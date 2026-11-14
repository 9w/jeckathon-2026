begin;

alter table public.replay_rounds
  add column vote_answer text check (vote_answer in ('safe', 'out'));

-- Backfill only results verified against the private September 3 source's choice field.
update public.replay_rounds
set vote_answer = case result
  when '1루타' then 'safe'
  when '2루타' then 'safe'
  when '3루타' then 'safe'
  when '몸에 맞는 볼' then 'safe'
  when '볼넷' then 'safe'
  when '야수선택 출루' then 'safe'
  when '홈런' then 'safe'
  when '낫아웃 아웃' then 'out'
  when '땅볼 아웃' then 'out'
  when '라인드라이브 아웃' then 'out'
  when '삼진' then 'out'
  when '플라이 아웃' then 'out'
end
where game_id = '20260903LGOB0' and close_second is not null;

alter table public.replay_rooms
  add column reward_progress_seconds integer not null default 0 check (reward_progress_seconds >= 0);

alter table public.replay_votes
  add column reward_eligible boolean not null default false;

create unique index replay_one_reward_vote on public.replay_votes (user_id, game_id, round_id)
  where reward_eligible;
create index replay_votes_room_round_choice on public.replay_votes (room_id, round_id, choice);

create table public.replay_point_awards (
  user_id uuid not null references public.fan_profiles (id) on delete cascade,
  game_id text not null,
  round_id text not null,
  room_id uuid not null,
  reward integer not null check (reward in (0, 100)),
  primary key (user_id, game_id, round_id),
  foreign key (game_id, round_id) references public.replay_rounds (game_id, id),
  foreign key (room_id, game_id) references public.replay_rooms (id, game_id)
);

alter table public.replay_point_awards enable row level security;
revoke all on public.replay_point_awards from public, anon, authenticated;

create function public.replay_reward_elapsed(p_room public.replay_rooms, p_at timestamptz)
returns integer
language sql
stable
set search_path = ''
as $$
  select greatest(0, least(game.duration_seconds, floor(p_room.position_seconds
    + coalesce(extract(epoch from (p_at - p_room.starts_at)), 0))))
  from public.replay_games game
  where game.id = p_room.game_id;
$$;

create function public.track_replay_reward_progress()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  instant timestamptz := clock_timestamp();
begin
  -- Preserve results that were visible before seeking backward or ending a room.
  new.reward_progress_seconds := greatest(old.reward_progress_seconds,
    case when old.active then public.replay_reward_elapsed(old, instant) else 0 end,
    case when new.active then public.replay_reward_elapsed(new, instant) else 0 end);
  return new;
end;
$$;

create trigger replay_reward_progress_before_control
  before update of starts_at, position_seconds, active on public.replay_rooms
  for each row execute function public.track_replay_reward_progress();

create function public.track_replay_reward_vote()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  at_bat public.replay_rounds;
  room public.replay_rooms;
  elapsed integer;
begin
  -- Serialize same-fan eligibility across duplicate requests and room changes.
  perform 1 from public.fan_profiles where id = new.user_id for no key update;
  select * into room from public.replay_rooms where id = new.room_id and active;
  select * into at_bat from public.replay_rounds where game_id = new.game_id and id = new.round_id;
  elapsed := public.replay_reward_elapsed(room, clock_timestamp());
  new.reward_eligible := coalesce(
    room.starts_at is not null and elapsed >= at_bat.open_second and elapsed < at_bat.close_second
    and room.reward_progress_seconds < at_bat.close_second and at_bat.vote_answer is not null
    and not exists (
      select 1 from public.replay_votes
      where user_id = new.user_id and game_id = new.game_id and round_id = new.round_id and reward_eligible
    ), false);
  return new;
end;
$$;

create trigger replay_reward_vote_before_insert
  before insert on public.replay_votes
  for each row execute function public.track_replay_reward_vote();

create function public.get_fan_replay_rewards(p_room uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  player uuid := auth.uid();
  room public.replay_rooms;
  at_bat public.replay_rounds;
  instant timestamptz;
  elapsed integer;
  balance integer;
  earned integer;
  credited integer;
  plate_reward integer;
  votes integer := 0;
  safe_votes integer;
  out_votes integer;
begin
  select points into balance from public.fan_profiles where id = player for no key update;
  if not found then raise exception 'A fan profile is required.' using errcode = '42501'; end if;

  select * into room from public.replay_rooms where id = p_room;
  if not found then return null; end if;
  instant := clock_timestamp();
  elapsed := case when room.active then public.replay_reward_elapsed(room, instant)
    else room.reward_progress_seconds end;

  with settled as (
    insert into public.replay_point_awards (user_id, game_id, round_id, room_id, reward)
    select player, vote.game_id, vote.round_id, vote.room_id,
      case when vote.choice = round.vote_answer then 100 else 0 end
    from public.replay_votes vote
    join public.replay_rounds round on (round.game_id, round.id) = (vote.game_id, vote.round_id)
    join public.replay_rooms source on source.id = vote.room_id
    where vote.user_id = player and vote.game_id = room.game_id and vote.reward_eligible
      and round.vote_answer is not null
      and round.reveal_second <= greatest(source.reward_progress_seconds, room.reward_progress_seconds,
        case when source.active then public.replay_reward_elapsed(source, instant) else 0 end,
        case when room.active then elapsed else 0 end)
    on conflict (user_id, game_id, round_id) do nothing
    returning reward
  )
  select coalesce(sum(reward), 0) into credited from settled;

  if credited > 0 then
    update public.fan_profiles set points = points + credited where id = player returning points into balance;
  end if;
  select coalesce(sum(reward), 0) into earned
  from public.replay_point_awards where user_id = player and game_id = room.game_id;

  select * into at_bat from public.replay_rounds where game_id = room.game_id and open_second <= elapsed
  order by open_second desc limit 1;
  if at_bat.id is not null then
    select count(*), count(*) filter (where choice = 'safe'), count(*) filter (where choice = 'out')
    into votes, safe_votes, out_votes
    from public.replay_votes where room_id = room.id and round_id = at_bat.id;

    if elapsed >= at_bat.reveal_second then
      select reward into plate_reward from public.replay_point_awards
      where user_id = player and game_id = room.game_id and round_id = at_bat.id and room_id = room.id;
    end if;
  end if;

  return jsonb_build_object(
    'points', balance, 'earned', earned, 'roundId', at_bat.id, 'roundReward', plate_reward,
    'voteCount', votes,
    'safeVotes', case when elapsed >= at_bat.close_second then safe_votes end,
    'outVotes', case when elapsed >= at_bat.close_second then out_votes end
  );
end;
$$;

create or replace function public.get_fan_profile_stats()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  player uuid := auth.uid();
begin
  if not exists (select 1 from public.fan_profiles where id = player and nickname is not null) then
    raise exception 'A named fan is required.' using errcode = '42501';
  end if;

  return (
    select jsonb_build_object(
      'hits', count(*) filter (where reward = 100),
      'tries', count(*),
      'sent', (select count(*) from public.fan_taunts where sender_id = player)
    )
    from (
      select reward from public.fan_point_predictions
      where user_id = player and reward is not null and choice is not null
      union all
      select reward from public.replay_point_awards where user_id = player
    ) predictions
  );
end;
$$;

revoke all on function public.replay_reward_elapsed(public.replay_rooms, timestamptz),
  public.track_replay_reward_progress(), public.track_replay_reward_vote(),
  public.get_fan_replay_rewards(uuid) from public, anon, authenticated;
grant execute on function public.get_fan_replay_rewards(uuid) to authenticated;

commit;
