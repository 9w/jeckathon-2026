begin;

create table public.fan_point_predictions (
  user_id uuid not null references public.fan_profiles (id) on delete cascade,
  round integer not null check (round > 0),
  answer text not null check (answer in ('safe', 'out')),
  opens_at timestamptz not null,
  closes_at timestamptz not null,
  reveals_at timestamptz not null,
  choice text check (choice in ('safe', 'out')),
  reward integer check (reward in (0, 100)),
  primary key (user_id, round)
);

alter table public.fan_point_predictions enable row level security;
revoke all on public.fan_point_predictions from public, anon, authenticated;

-- Only the server controls the practice round, result and point balance.
create function public.fan_point_prediction(p_action text default 'read', p_round integer default null, p_choice text default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  player uuid := auth.uid();
  balance integer;
  state public.fan_point_predictions;
  instant timestamptz;
  phase text;
begin
  select points into balance from public.fan_profiles where id = player and nickname is not null for no key update;
  if not found then raise exception 'A fan profile is required.' using errcode = '42501'; end if;
  if p_action is null or p_action not in ('read', 'start', 'vote') then
    raise exception 'Invalid prediction action.' using errcode = '22023';
  end if;

  instant := clock_timestamp();
  select * into state from public.fan_point_predictions where user_id = player order by round desc limit 1;
  if state.round is not null and instant >= state.reveals_at and state.reward is null then
    update public.fan_point_predictions
      set reward = case when choice = answer then 100 else 0 end
      where user_id = player and round = state.round returning * into state;
    if state.reward > 0 then
      update public.fan_profiles
        set points = points + state.reward where id = player returning points into balance;
    end if;
  end if;

  if p_action = 'start' and (state.round is null or state.reward is not null) then
    insert into public.fan_point_predictions (user_id, round, answer, opens_at, closes_at, reveals_at)
      values (player, coalesce(state.round, 0) + 1, case when random() < 0.35 then 'safe' else 'out' end,
        instant, instant + interval '12 seconds', instant + interval '14 seconds')
      returning * into state;
  elsif p_action = 'vote' then
    if p_choice is null or p_choice not in ('safe', 'out') then raise exception 'Invalid prediction.' using errcode = '22023'; end if;
    if state.round is null or state.round is distinct from p_round
      or (state.choice is null and (instant < state.opens_at or instant >= state.closes_at)) then
      raise exception 'Prediction is closed.' using errcode = 'P0001';
    end if;
    if state.choice is null then
      update public.fan_point_predictions set choice = p_choice
        where user_id = player and round = state.round returning * into state;
    end if;
  end if;

  phase := case
    when state.round is null then 'ready'
    when state.reward is not null then 'result'
    when instant < state.opens_at or instant >= state.closes_at then 'locked'
    else 'open' end;
  return jsonb_build_object(
    'phase', phase, 'round', state.round, 'choice', state.choice, 'reward', state.reward, 'points', balance,
    'answer', case when phase = 'result' then state.answer end,
    'secondsLeft', case when phase = 'open' then greatest(0, ceil(extract(epoch from (state.closes_at - instant)))) end
  );
end;
$$;

revoke all on function public.fan_point_prediction(text, integer, text) from public, anon, authenticated;
grant execute on function public.fan_point_prediction(text, integer, text) to authenticated;

commit;
