-- 상대팀 팬 놀리기(도발). 포인트를 소비해 사전 제작된 카드만 보낼 수 있다.
-- 포인트 차감·쿨타임·수신 제한은 send_taunt 한 트랜잭션에서 서버가 판정한다.

-- 활동 사용자 판별용. 투표·놀리기 API 호출 시 갱신된다.
alter table public.fan_profiles
  add column last_active_at timestamptz not null default now();

create index fan_profiles_team_active_idx
  on public.fan_profiles (team, last_active_at desc);

create function public.touch_fan_on_vote()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.fan_profiles set last_active_at = now() where id = new.user_id;
  return new;
end;
$$;

revoke all on function public.touch_fan_on_vote() from public, anon, authenticated;

create trigger fan_votes_touch_fan
  after insert on public.fan_votes
  for each row execute function public.touch_fan_on_vote();

-- 놀리기 카드: 대상 팀별 사전 승인 문구
create table public.taunt_cards (
  id text primary key,
  target_team text not null check (target_team in ('lg', 'doosan')),
  message text not null,
  cost integer not null check (cost > 0),
  sort_order integer not null default 0
);

alter table public.taunt_cards enable row level security;

revoke all on public.taunt_cards from public, anon, authenticated;
grant select on public.taunt_cards to authenticated;

create policy taunt_cards_select_all on public.taunt_cards
  for select to authenticated
  using (true);

insert into public.taunt_cards (id, target_team, message, cost, sort_order) values
  ('lg-twins-out', 'lg', '오늘은 쌍둥이로 아웃 두 개?', 100, 1),
  ('lg-jamsil-sigh', 'lg', '잠실 하늘에 한숨만 가득하네~', 100, 2),
  ('lg-bat-nap', 'lg', '방망이가 낮잠 자는 중?', 100, 3),
  ('doosan-hibernate', 'doosan', '곰이 아니라 겨울잠 자는 중?', 100, 1),
  ('doosan-honey', 'doosan', '꿀 대신 삼진만 먹는 곰?', 100, 2),
  ('doosan-teddy', 'doosan', '오늘은 곰돌이 인형 모드?', 100, 3);

create table public.taunts (
  id uuid primary key default gen_random_uuid(),
  sender_id uuid not null references public.fan_profiles (id) on delete cascade,
  receiver_id uuid not null references public.fan_profiles (id) on delete cascade,
  card_id text not null references public.taunt_cards (id),
  cost integer not null,
  created_at timestamptz not null default now(),
  read_at timestamptz,
  check (sender_id <> receiver_id)
);

create index taunts_receiver_created_idx on public.taunts (receiver_id, created_at desc);
create index taunts_sender_created_idx on public.taunts (sender_id, created_at desc);

alter table public.taunts enable row level security;

-- 직접 insert/update는 막고 RPC로만 쓴다. select는 Realtime 수신용.
revoke all on public.taunts from public, anon, authenticated;
grant select on public.taunts to authenticated;

create policy taunts_select_own on public.taunts
  for select to authenticated
  using (receiver_id = (select auth.uid()) or sender_id = (select auth.uid()));

-- 내가 놀릴 수 있는 회원: 상대팀, 최근 10분 내 활동.
-- 최근 3분 활동자 우선, 최근 5분간 덜 놀림받은 사람 우선.
create function public.list_taunt_targets()
returns table (
  id uuid,
  nickname text,
  team text,
  last_active_at timestamptz,
  recent_taunt_count integer
)
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  me public.fan_profiles;
begin
  update public.fan_profiles p
    set last_active_at = now()
    where p.id = auth.uid()
    returning * into me;

  if not found then
    raise exception 'Join a team first.' using errcode = '42501';
  end if;

  if me.nickname is null then
    raise exception 'Nickname is required.' using errcode = 'JK005';
  end if;

  return query
    select
      p.id,
      p.nickname,
      p.team,
      p.last_active_at,
      (
        select count(*)::integer
        from public.taunts t
        where t.receiver_id = p.id
          and t.created_at > now() - interval '5 minutes'
      ) as recent_taunt_count
    from public.fan_profiles p
    where p.team <> me.team
      and p.nickname is not null
      and p.last_active_at > now() - interval '10 minutes'
    order by
      p.last_active_at > now() - interval '3 minutes' desc,
      recent_taunt_count asc,
      p.last_active_at desc
    limit 30;
end;
$$;

-- 놀리기 전송. 오류 코드 (PTxxx는 PostgREST가 HTTP 상태로 해석하므로 JKxxx 사용):
--   JK001 포인트 부족, JK002 쿨타임, JK003 대상 수신 한도 초과, JK004 대상 비활성, JK005 닉네임 미설정
-- 닉네임 없는 팬은 놀릴 수도, 놀림받을 수도 없다.
create function public.send_taunt(p_receiver_id uuid, p_card_id text)
returns table (id uuid, points integer, created_at timestamptz)
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  me public.fan_profiles;
  target public.fan_profiles;
  card public.taunt_cards;
  taunt public.taunts;
begin
  -- 발신자 행을 잠가 같은 사용자의 동시 요청을 직렬화한다(포인트 이중 차감 방지).
  select * into me
    from public.fan_profiles p
    where p.id = auth.uid()
    for update;

  if not found then
    raise exception 'Join a team first.' using errcode = '42501';
  end if;

  if me.nickname is null then
    raise exception 'Nickname is required.' using errcode = 'JK005';
  end if;

  select * into target from public.fan_profiles p where p.id = p_receiver_id;
  if not found or target.nickname is null then
    raise exception 'Target not found.' using errcode = 'P0002';
  end if;

  if target.id = me.id or target.team = me.team then
    raise exception 'You can only taunt fans of the other team.' using errcode = '22023';
  end if;

  select * into card from public.taunt_cards c where c.id = p_card_id;
  if not found or card.target_team <> target.team then
    raise exception 'Invalid taunt card.' using errcode = '22023';
  end if;

  if target.last_active_at <= now() - interval '10 minutes' then
    raise exception 'Target is not active.' using errcode = 'JK004';
  end if;

  if exists (
    select 1 from public.taunts t
    where t.sender_id = me.id
      and (
        t.created_at > now() - interval '10 seconds'
        or (t.receiver_id = target.id and t.created_at > now() - interval '60 seconds')
      )
  ) then
    raise exception 'Taunt cooldown.' using errcode = 'JK002';
  end if;

  -- 한 사람에게 도발이 몰리지 않도록 1분에 3개까지만 받는다.
  -- 대상 행은 잠그지 않으므로 동시 요청 시 한도를 약간 넘을 수 있다(교착 회피).
  if (
    select count(*) from public.taunts t
    where t.receiver_id = target.id
      and t.created_at > now() - interval '1 minute'
  ) >= 3 then
    raise exception 'Target has received too many taunts.' using errcode = 'JK003';
  end if;

  if me.points < card.cost then
    raise exception 'Not enough points.' using errcode = 'JK001';
  end if;

  update public.fan_profiles p
    set points = p.points - card.cost, last_active_at = now()
    where p.id = me.id
    returning * into me;

  insert into public.taunts (sender_id, receiver_id, card_id, cost)
    values (me.id, target.id, card.id, card.cost)
    returning * into taunt;

  return query select taunt.id, me.points, taunt.created_at;
end;
$$;

-- 내가 받은 놀림 목록 (보낸 사람 닉네임·팀 포함)
create function public.list_received_taunts(
  p_unread_only boolean default false,
  p_limit integer default 50
)
returns table (
  id uuid,
  card_id text,
  message text,
  sender_id uuid,
  sender_nickname text,
  sender_team text,
  cost integer,
  created_at timestamptz,
  read_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
begin
  update public.fan_profiles p
    set last_active_at = now()
    where p.id = auth.uid();

  if not found then
    raise exception 'Join a team first.' using errcode = '42501';
  end if;

  return query
    select t.id, t.card_id, c.message, s.id, s.nickname, s.team, t.cost, t.created_at, t.read_at
    from public.taunts t
    join public.taunt_cards c on c.id = t.card_id
    join public.fan_profiles s on s.id = t.sender_id
    where t.receiver_id = auth.uid()
      and (not p_unread_only or t.read_at is null)
    order by t.created_at desc
    limit least(greatest(coalesce(p_limit, 50), 1), 100);
end;
$$;

-- 받은 놀림 확인 처리. p_ids가 null이면 전부 읽음 처리. 처리된 개수를 반환한다.
create function public.mark_taunts_read(p_ids uuid[] default null)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  updated integer;
begin
  if auth.uid() is null then
    raise exception 'A guest session is required.' using errcode = '42501';
  end if;

  update public.taunts t
    set read_at = now()
    where t.receiver_id = auth.uid()
      and t.read_at is null
      and (p_ids is null or t.id = any (p_ids));

  get diagnostics updated = row_count;
  return updated;
end;
$$;

revoke all on function public.list_taunt_targets() from public, anon, authenticated;
revoke all on function public.send_taunt(uuid, text) from public, anon, authenticated;
revoke all on function public.list_received_taunts(boolean, integer) from public, anon, authenticated;
revoke all on function public.mark_taunts_read(uuid[]) from public, anon, authenticated;
grant execute on function public.list_taunt_targets() to authenticated;
grant execute on function public.send_taunt(uuid, text) to authenticated;
grant execute on function public.list_received_taunts(boolean, integer) to authenticated;
grant execute on function public.mark_taunts_read(uuid[]) to authenticated;

-- 받은 놀림을 실시간으로 받을 수 있게 Realtime에 등록 (RLS로 본인 것만 전달됨)
alter publication supabase_realtime add table public.taunts;
