-- 타석 예측과 포인트 정산.
-- 원칙
--  * 포인트는 fan_profiles.points 하나뿐이고, 바뀔 때마다 point_ledger 에 같은 금액이 남는다 (합계 = 잔액).
--  * 투표 마감·정산은 클라이언트가 아니라 서버 시계(now())로 판단한다.
--  * 정답(answer)은 결과 공개 전까지 클라이언트가 읽을 수 없다.
--  * 같은 정산이 여러 번 호출돼도 지급은 한 번: point_ledger (reason, ref_id) UNIQUE.

create table public.prediction_rounds (
  id text primary key check (char_length(id) between 1 and 80),
  game_id text not null,
  batter text not null check (char_length(batter) between 1 and 120),
  -- null = 출루·아웃으로 판정할 수 없는 타석 → 무효
  answer text check (answer in ('safe', 'out')),
  opens_at timestamptz not null,
  locks_at timestamptz not null,
  result_at timestamptz not null,
  status text not null default 'open' check (status in ('open', 'settled', 'void')),
  settled_at timestamptz,
  check (opens_at <= locks_at and locks_at <= result_at),
  check ((status = 'open') = (settled_at is null))
);

create index prediction_rounds_due on public.prediction_rounds (result_at) where status = 'open';
create index prediction_rounds_game on public.prediction_rounds (game_id, opens_at);

alter table public.prediction_rounds enable row level security;
revoke all on public.prediction_rounds from public, anon, authenticated;

create table public.fan_predictions (
  user_id uuid not null references public.fan_profiles (id) on delete cascade,
  round_id text not null references public.prediction_rounds (id) on delete cascade,
  choice text not null check (choice in ('safe', 'out')),
  status text not null default 'pending' check (status in ('pending', 'won', 'lost', 'void')),
  reward integer not null default 0 check (reward >= 0),
  created_at timestamptz not null default now(),
  primary key (user_id, round_id)
);

create index fan_predictions_pending on public.fan_predictions (round_id) where status = 'pending';

alter table public.fan_predictions enable row level security;
revoke all on public.fan_predictions from public, anon, authenticated;
grant select on public.fan_predictions to authenticated;

create policy fan_predictions_select_self on public.fan_predictions
  for select to authenticated
  using (user_id = (select auth.uid()));

create table public.point_ledger (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.fan_profiles (id) on delete cascade,
  amount integer not null check (amount <> 0),
  reason text not null check (reason in ('prediction_win')),
  ref_id text not null,
  created_at timestamptz not null default now(),
  unique (reason, ref_id)
);

create index point_ledger_user on public.point_ledger (user_id, id desc);

alter table public.point_ledger enable row level security;
revoke all on public.point_ledger from public, anon, authenticated;
grant select on public.point_ledger to authenticated;

create policy point_ledger_select_self on public.point_ledger
  for select to authenticated
  using (user_id = (select auth.uid()));

-- 투표. 마감 판단은 서버 시계. 이미 투표했으면 처음 선택을 그대로 돌려준다(재시도 안전).
create function public.cast_prediction(p_round_id text, p_choice text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  player_id uuid := auth.uid();
  round public.prediction_rounds;
  saved text;
begin
  if player_id is null then
    raise exception 'A guest session is required.' using errcode = '42501';
  end if;
  if p_choice is null or p_choice not in ('safe', 'out') then
    raise exception 'Invalid choice.' using errcode = '22023';
  end if;

  -- for share: 정산(for update)과 겹치면 투표가 먼저 끝난 뒤 정산된다
  select * into round from public.prediction_rounds where id = p_round_id for share;
  if not found then
    raise exception 'Unknown round.' using errcode = 'P0002';
  end if;

  select choice into saved from public.fan_predictions
    where user_id = player_id and round_id = p_round_id;
  if found then
    return saved;
  end if;

  if round.status <> 'open' or now() < round.opens_at or now() >= round.locks_at then
    raise exception 'Voting is closed.' using errcode = 'P0001', hint = 'VOTING_CLOSED';
  end if;

  insert into public.fan_predictions (user_id, round_id, choice)
    values (player_id, p_round_id, p_choice)
    on conflict (user_id, round_id) do nothing;

  select choice into strict saved from public.fan_predictions
    where user_id = player_id and round_id = p_round_id;
  return saved;
end;
$$;

revoke all on function public.cast_prediction(text, text) from public, anon, authenticated;
grant execute on function public.cast_prediction(text, text) to authenticated;

-- 결과 시각이 지난 타석을 정산한다. 누가 몇 번 불러도 결과가 같다.
create function public.settle_due_rounds()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  round record;
  settled integer := 0;
begin
  -- 정산은 한 번에 한 트랜잭션만. 동시에 불리면 나머지는 바로 빠진다(잔액 갱신 데드락 방지).
  if not pg_try_advisory_xact_lock(hashtext('public.settle_due_rounds')) then
    return 0;
  end if;

  for round in
    select id, answer from public.prediction_rounds
    where status = 'open' and result_at <= now()
    order by result_at
    for update
  loop
    if round.answer is null then
      update public.prediction_rounds set status = 'void', settled_at = now() where id = round.id;
      update public.fan_predictions set status = 'void'
        where round_id = round.id and status = 'pending';
    else
      update public.prediction_rounds set status = 'settled', settled_at = now() where id = round.id;

      -- shortcut: 정답이면 출루·아웃 모두 +100P (기획서). 이러면 "항상 아웃"이 유리하다 — 차등 보상은 팀 결정 후.
      with judged as (
        update public.fan_predictions
          set status = case when choice = round.answer then 'won' else 'lost' end,
              reward = case when choice = round.answer then 100 else 0 end
          where round_id = round.id and status = 'pending'
          returning user_id, reward
      ), paid as (
        insert into public.point_ledger (user_id, amount, reason, ref_id)
          select user_id, reward, 'prediction_win', round.id || ':' || user_id
          from judged where reward > 0
          on conflict (reason, ref_id) do nothing
          returning user_id, amount
      )
      update public.fan_profiles p
        set points = p.points + paid.amount
        from paid
        where p.id = paid.user_id;
    end if;
    settled := settled + 1;
  end loop;

  return settled;
end;
$$;

revoke all on function public.settle_due_rounds() from public, anon, authenticated;
grant execute on function public.settle_due_rounds() to authenticated;

-- 화면용: 지난 타석을 정산한 뒤 최근 타석 목록을 준다. 정답은 공개된 타석만.
create function public.poll_rounds(p_game_id text)
returns table (
  id text,
  batter text,
  opens_at timestamptz,
  locks_at timestamptz,
  result_at timestamptz,
  status text,
  answer text
)
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.settle_due_rounds();
  return query
    select r.id, r.batter, r.opens_at, r.locks_at, r.result_at, r.status,
           case when r.status = 'open' then null else r.answer end
    from public.prediction_rounds r
    where r.game_id = p_game_id and r.opens_at <= now() + interval '1 minute'
    order by r.opens_at desc
    limit 20;
end;
$$;

revoke all on function public.poll_rounds(text) from public, anon, authenticated;
grant execute on function public.poll_rounds(text) to authenticated;

-- 리플레이 (재)시작. 같은 경기의 열린 타석을 무효 처리하고 새 일정을 넣는다 — 한 트랜잭션.
-- 정답이 들어 있으므로 서버 전용 키(service_role)만 호출할 수 있다.
create function public.start_replay_rounds(p_game_id text, p_rounds jsonb)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  inserted integer;
begin
  with voided as (
    update public.prediction_rounds
      set status = 'void', settled_at = now()
      where game_id = p_game_id and status = 'open'
      returning id
  )
  update public.fan_predictions
    set status = 'void'
    where round_id in (select id from voided) and status = 'pending';

  insert into public.prediction_rounds (id, game_id, batter, answer, opens_at, locks_at, result_at)
    select r.id, p_game_id, r.batter, r.answer, r.opens_at, r.locks_at, r.result_at
    from jsonb_to_recordset(p_rounds)
      as r(id text, batter text, answer text, opens_at timestamptz, locks_at timestamptz, result_at timestamptz);
  get diagnostics inserted = row_count;
  return inserted;
end;
$$;

revoke all on function public.start_replay_rounds(text, jsonb) from public, anon, authenticated;
grant execute on function public.start_replay_rounds(text, jsonb) to service_role;
