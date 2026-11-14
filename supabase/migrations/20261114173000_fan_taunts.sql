create table public.fan_taunt_presence (
  fan_id uuid primary key references public.fan_profiles (id) on delete cascade,
  active boolean not null,
  seen_at timestamptz not null
);

create index fan_taunt_presence_active_idx
  on public.fan_taunt_presence (seen_at desc) where active;

create table public.fan_taunts (
  id uuid primary key default gen_random_uuid(),
  sender_id uuid not null references public.fan_profiles (id) on delete cascade,
  receiver_id uuid not null references public.fan_profiles (id) on delete cascade,
  sender_nickname text not null,
  recipient_nickname text not null,
  card_id text not null check (card_id in ('first', 'turtle', 'sleepy', 'decline', 'salt', 'violin')),
  phrase_id text not null check (phrase_id in ('default', 'first', 'turtle', 'sleepy', 'next', 'wager')),
  request_id uuid not null,
  reply_to uuid unique references public.fan_taunts (id) on delete set null,
  cost integer not null check (cost = 100),
  sent_at timestamptz not null,
  read_at timestamptz,
  unique (sender_id, request_id),
  check (sender_id <> receiver_id)
);

create index fan_taunts_receiver_sent_idx on public.fan_taunts (receiver_id, sent_at desc);
create index fan_taunts_sender_sent_idx on public.fan_taunts (sender_id, sent_at desc);

alter table public.fan_taunt_presence enable row level security;
alter table public.fan_taunts enable row level security;
revoke all on public.fan_taunt_presence, public.fan_taunts from public, anon, authenticated;

create function public.fan_taunt_payload(p_taunt public.fan_taunts)
returns jsonb
language sql
stable
set search_path = ''
as $$
  select jsonb_build_object(
    'id', p_taunt.id,
    'cardId', p_taunt.card_id,
    'phraseId', p_taunt.phrase_id,
    'senderNickname', p_taunt.sender_nickname,
    'recipientNickname', p_taunt.recipient_nickname,
    'sentAt', p_taunt.sent_at,
    'readAt', p_taunt.read_at,
    'replyTo', p_taunt.reply_to
  );
$$;

create function public.fan_taunt_activity(p_active boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  player uuid := auth.uid();
begin
  if not exists (select 1 from public.fan_profiles where id = player and nickname is not null) then
    raise exception 'A named fan is required.' using errcode = '42501';
  end if;

  insert into public.fan_taunt_presence (fan_id, active, seen_at)
  values (player, coalesce(p_active, false), clock_timestamp())
  on conflict (fan_id) do update
    set active = excluded.active, seen_at = excluded.seen_at
    where public.fan_taunt_presence.seen_at <= excluded.seen_at;
end;
$$;

create function public.send_fan_taunt(
  p_card_id text,
  p_phrase_id text,
  p_request_id uuid,
  p_reply_to uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  player uuid := auth.uid();
  sender public.fan_profiles;
  original public.fan_taunts;
  message public.fan_taunts;
  target_id uuid;
  target_nickname text;
  sent_time timestamptz;
  balance integer;
begin
  if not exists (select 1 from public.fan_profiles where id = player and nickname is not null) then
    raise exception 'A named fan is required.' using errcode = '42501';
  end if;
  if p_request_id is null then
    raise exception 'An idempotency key is required.' using detail = 'invalid_request';
  end if;
  if p_card_id is null or p_card_id not in ('first', 'turtle', 'sleepy', 'decline', 'salt', 'violin')
    or p_phrase_id is null or p_phrase_id not in ('default', 'first', 'turtle', 'sleepy', 'next', 'wager') then
    raise exception 'Choose an approved card and phrase.' using detail = 'invalid_selection';
  end if;

  -- Serialize sends end-to-end so the same recipient quota cannot be consumed concurrently.
  -- Heartbeats and read receipts don't acquire this lock.
  perform pg_advisory_xact_lock(731007418291::bigint);
  sent_time := clock_timestamp();
  select * into sender from public.fan_profiles where id = player for no key update;
  if not found or sender.nickname is null then
    raise exception 'A named fan is required.' using errcode = '42501';
  end if;

  select * into message from public.fan_taunts where sender_id = player and request_id = p_request_id;
  if found then
    if message.card_id <> p_card_id or message.phrase_id <> p_phrase_id
      or message.reply_to is distinct from p_reply_to then
      raise exception 'Request key was already used with a different payload.' using detail = 'request_conflict';
    end if;
    return jsonb_build_object('taunt', public.fan_taunt_payload(message), 'points', sender.points);
  end if;

  if p_reply_to is not null then
    select * into original from public.fan_taunts where id = p_reply_to and receiver_id = player;
    if not found or exists (select 1 from public.fan_taunts where reply_to = p_reply_to) then
      raise exception 'This incoming message cannot be countered.' using detail = 'invalid_reply';
    end if;
  end if;

  if exists (
    select 1 from public.fan_taunts where sender_id = player and sent_at > sent_time - interval '10 seconds'
  ) then
    raise exception 'Wait before sending another message.' using detail = 'cooldown';
  end if;

  if sender.points < 100 then
    raise exception 'Not enough points.' using detail = 'insufficient_points';
  end if;

  select candidate.id, candidate.nickname into target_id, target_nickname
  from public.fan_taunt_presence presence
  join public.fan_profiles candidate on candidate.id = presence.fan_id
  cross join lateral (
    select count(*) as recent_count, max(sent_at) as last_received
    from public.fan_taunts
    where receiver_id = candidate.id and sent_at > sent_time - interval '1 minute'
  ) recent
  where candidate.team <> sender.team
    and candidate.nickname is not null
    and presence.active
    and presence.seen_at > sent_time - interval '3 minutes'
    and recent.recent_count < 3
    and coalesce(recent.last_received <= sent_time - interval '10 seconds', true)
    and (
      (p_reply_to is not null and candidate.id = original.sender_id)
      or (
        p_reply_to is null and not exists (
          select 1 from public.fan_taunts
          where sender_id = player and receiver_id = candidate.id
            and sent_at > sent_time - interval '1 minute'
        )
      )
    )
  order by recent.recent_count, presence.seen_at desc, random()
  limit 1;

  if not found then
    raise exception 'No eligible active opponent.' using detail = 'inactive_opponent';
  end if;

  update public.fan_profiles set points = points - 100 where id = player returning points into balance;
  insert into public.fan_taunts (
    sender_id, receiver_id, sender_nickname, recipient_nickname, card_id, phrase_id, request_id, reply_to, cost, sent_at
  ) values (
    player, target_id, sender.nickname, target_nickname, p_card_id, p_phrase_id, p_request_id, p_reply_to, 100, sent_time
  )
  returning * into message;

  return jsonb_build_object('taunt', public.fan_taunt_payload(message), 'points', balance);
end;
$$;

create function public.list_fan_taunts()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(jsonb_agg(public.fan_taunt_payload(inbox) order by inbox.sent_at desc, inbox.id), '[]'::jsonb)
  from (
    select *
    from public.fan_taunts
    where receiver_id = (select auth.uid())
    order by (read_at is null) desc, sent_at desc, id
    limit 30
  ) inbox;
$$;

create function public.get_fan_taunt(p_taunt_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select public.fan_taunt_payload(message)
  from public.fan_taunts message
  where message.id = p_taunt_id and (select auth.uid()) in (message.sender_id, message.receiver_id);
$$;

create function public.read_fan_taunt(p_taunt_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  message public.fan_taunts;
begin
  update public.fan_taunts
  set read_at = clock_timestamp()
  where id = p_taunt_id and receiver_id = (select auth.uid()) and read_at is null
  returning * into message;

  if not found then
    select * into message from public.fan_taunts
    where id = p_taunt_id and receiver_id = (select auth.uid());
    if not found then return null; end if;
  end if;
  return public.fan_taunt_payload(message);
end;
$$;

revoke all on function public.fan_taunt_payload(public.fan_taunts),
  public.fan_taunt_activity(boolean), public.send_fan_taunt(text, text, uuid, uuid),
  public.list_fan_taunts(), public.get_fan_taunt(uuid), public.read_fan_taunt(uuid)
  from public, anon, authenticated;

grant execute on function public.fan_taunt_activity(boolean), public.send_fan_taunt(text, text, uuid, uuid),
  public.list_fan_taunts(), public.get_fan_taunt(uuid), public.read_fan_taunt(uuid)
  to authenticated;
