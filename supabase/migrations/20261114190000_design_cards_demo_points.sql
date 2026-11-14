-- 디자인 시안 반영
--   1) 놀리기 카드: 팀 공통 이모지 카드 6장 + 정해진 문구 5개 중 선택
--   2) 입장 시 300P
--   3) 데모용 포인트 지급(예측 보상·충전). 예측 판정을 아직 화면이 하므로 해커톤 데모 한정.

-- 1) 카드 ---------------------------------------------------------------
alter table public.taunt_cards
  alter column target_team drop not null,
  add column emoji text,
  add column name text,
  add column active boolean not null default true;

-- 기존 팀별 카드는 보낸 기록이 참조할 수 있으므로 지우지 않고 비활성화한다.
update public.taunt_cards set active = false;

-- target_team이 null이면 어느 팀에게나 보낼 수 있다. message는 문구를 고르지 않았을 때의 기본 문구.
insert into public.taunt_cards (id, target_team, emoji, name, message, cost, sort_order) values
  ('clown',  null, '🤡', '처음 봐요?',   '오늘 야구 처음 봐요?',   100, 1),
  ('turtle', null, '🐢', '거북이 주루',  '주루가 거북이네~',       100, 2),
  ('yawn',   null, '🥱', '졸린 경기력',  '벌써 졸린 경기력',       100, 3),
  ('chart',  null, '📉', '타율 하락 중', '타율 실시간 하락 중',    100, 4),
  ('salt',   null, '🧂', '소금 한 사발', '짠내 나는 경기력이네',   100, 5),
  ('violin', null, '🎻', '슬픈 바이올린', 'BGM 깔아드릴게요',      100, 6);

create table public.taunt_phrases (
  id text primary key,
  message text not null,
  sort_order integer not null default 0
);

alter table public.taunt_phrases enable row level security;
revoke all on public.taunt_phrases from public, anon, authenticated;
grant select on public.taunt_phrases to authenticated;
create policy taunt_phrases_select_all on public.taunt_phrases
  for select to authenticated using (true);

insert into public.taunt_phrases (id, message, sort_order) values
  ('first-time', '야구 처음 봐요?', 1),
  ('turtle',     '주루가 거북이네~', 2),
  ('sleepy',     '벌써 졸린 경기력', 3),
  ('next-time',  '다음엔 맞히겠지^^', 4),
  ('why',        '그걸 왜 거기 걸어', 5);

alter table public.taunts add column phrase_id text references public.taunt_phrases (id);

-- send_taunt: 문구 선택 추가, 팀 공통·비활성 카드 처리
drop function public.send_taunt(uuid, text);

create function public.send_taunt(p_receiver_id uuid, p_card_id text, p_phrase_id text default null)
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
  select * into me from public.fan_profiles p where p.id = auth.uid() for update;
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
  if not found or not card.active or (card.target_team is not null and card.target_team <> target.team) then
    raise exception 'Invalid taunt card.' using errcode = '22023';
  end if;

  if p_phrase_id is not null and not exists (select 1 from public.taunt_phrases f where f.id = p_phrase_id) then
    raise exception 'Invalid taunt phrase.' using errcode = '22023';
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

  if (
    select count(*) from public.taunts t
    where t.receiver_id = target.id and t.created_at > now() - interval '1 minute'
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

  insert into public.taunts (sender_id, receiver_id, card_id, phrase_id, cost)
    values (me.id, target.id, card.id, p_phrase_id, card.cost)
    returning * into taunt;

  return query select taunt.id, me.points, taunt.created_at;
end;
$$;

revoke all on function public.send_taunt(uuid, text, text) from public, anon, authenticated;
grant execute on function public.send_taunt(uuid, text, text) to authenticated;

-- send_random_taunt: 문구 선택 추가, 응답에 이모지 포함
drop function public.send_random_taunt(text);

create function public.send_random_taunt(p_card_id text default null, p_phrase_id text default null)
returns table (
  id uuid,
  points integer,
  created_at timestamptz,
  receiver_id uuid,
  receiver_nickname text,
  receiver_team text,
  card_id text,
  card_emoji text,
  card_message text
)
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  me public.fan_profiles;
  target public.fan_profiles;
  chosen_card_id text := p_card_id;
  sent record;
begin
  select * into me from public.fan_profiles p where p.id = auth.uid();
  if not found then
    raise exception 'Join a team first.' using errcode = '42501';
  end if;

  if me.nickname is null then
    raise exception 'Nickname is required.' using errcode = 'JK005';
  end if;

  -- 대상을 고르기 전에 보내기 쿨타임부터 확인한다(쿨타임인데 '대상 없음'으로 안내되지 않도록).
  if exists (
    select 1 from public.taunts t
    where t.sender_id = me.id and t.created_at > now() - interval '10 seconds'
  ) then
    raise exception 'Taunt cooldown.' using errcode = 'JK002';
  end if;

  select p.* into target
    from public.fan_profiles p
    where p.team <> me.team
      and p.nickname is not null
      and p.last_active_at > now() - interval '10 minutes'
      and (
        select count(*) from public.taunts t
        where t.receiver_id = p.id and t.created_at > now() - interval '1 minute'
      ) < 3
      and not exists (
        select 1 from public.taunts t
        where t.sender_id = me.id
          and t.receiver_id = p.id
          and t.created_at > now() - interval '60 seconds'
      )
    order by p.last_active_at > now() - interval '3 minutes' desc, random()
    limit 1;

  if not found then
    raise exception 'No fans of the other team to taunt.' using errcode = 'JK006';
  end if;

  if chosen_card_id is null then
    select c.id into chosen_card_id
      from public.taunt_cards c
      where c.active and (c.target_team is null or c.target_team = target.team)
      order by random()
      limit 1;
  end if;

  select * into sent from public.send_taunt(target.id, chosen_card_id, p_phrase_id);

  return query
    select sent.id, sent.points, sent.created_at, target.id, target.nickname, target.team,
           c.id, c.emoji, coalesce(f.message, c.message)
    from public.taunt_cards c
    left join public.taunt_phrases f on f.id = p_phrase_id
    where c.id = chosen_card_id;
end;
$$;

revoke all on function public.send_random_taunt(text, text) from public, anon, authenticated;
grant execute on function public.send_random_taunt(text, text) to authenticated;

-- list_received_taunts: 이모지·카드 이름, 고른 문구 반영
drop function public.list_received_taunts(boolean, integer);

create function public.list_received_taunts(
  p_unread_only boolean default false,
  p_limit integer default 50
)
returns table (
  id uuid,
  card_id text,
  card_emoji text,
  card_name text,
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
  update public.fan_profiles p set last_active_at = now() where p.id = auth.uid();
  if not found then
    raise exception 'Join a team first.' using errcode = '42501';
  end if;

  return query
    select t.id, t.card_id, c.emoji, c.name, coalesce(f.message, c.message),
           s.id, s.nickname, s.team, t.cost, t.created_at, t.read_at
    from public.taunts t
    join public.taunt_cards c on c.id = t.card_id
    left join public.taunt_phrases f on f.id = t.phrase_id
    join public.fan_profiles s on s.id = t.sender_id
    where t.receiver_id = auth.uid()
      and (not p_unread_only or t.read_at is null)
    order by t.created_at desc
    limit least(greatest(coalesce(p_limit, 50), 1), 100);
end;
$$;

revoke all on function public.list_received_taunts(boolean, integer) from public, anon, authenticated;
grant execute on function public.list_received_taunts(boolean, integer) to authenticated;

-- 2) 입장 시 300P -------------------------------------------------------
alter table public.fan_profiles alter column points set default 300;

-- 3) 데모용 포인트 지급 ---------------------------------------------------
-- 예측 판정을 화면이 하므로 조작할 수 있다. 같은 키로는 한 번만 지급하고 금액은 100/300만 허용한다.
create table public.demo_point_claims (
  user_id uuid not null references public.fan_profiles (id) on delete cascade,
  claim_key text not null check (char_length(claim_key) between 1 and 64),
  amount integer not null,
  created_at timestamptz not null default now(),
  primary key (user_id, claim_key)
);

alter table public.demo_point_claims enable row level security;
revoke all on public.demo_point_claims from public, anon, authenticated;

create function public.claim_demo_points(p_key text, p_amount integer)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  balance integer;
begin
  if p_amount is null or p_amount not in (100, 300) then
    raise exception 'Invalid amount.' using errcode = '22023';
  end if;

  perform 1 from public.fan_profiles where id = auth.uid() for update;
  if not found then
    raise exception 'Join a team first.' using errcode = '42501';
  end if;

  insert into public.demo_point_claims (user_id, claim_key, amount)
    values (auth.uid(), p_key, p_amount)
    on conflict (user_id, claim_key) do nothing;

  if found then
    update public.fan_profiles
      set points = points + p_amount, last_active_at = now()
      where id = auth.uid()
      returning points into balance;
  else
    select points into balance from public.fan_profiles where id = auth.uid();
  end if;

  return balance;
end;
$$;

revoke all on function public.claim_demo_points(text, integer) from public, anon, authenticated;
grant execute on function public.claim_demo_points(text, integer) to authenticated;
