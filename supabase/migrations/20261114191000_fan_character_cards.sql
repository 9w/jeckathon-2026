begin;

-- The original emoji ids remain valid for saved deliveries and their receipts.
alter table public.fan_taunts
  drop constraint fan_taunts_card_id_check,
  add constraint fan_taunts_card_id_check check (card_id in (
    'first', 'turtle', 'sleepy', 'decline', 'salt', 'violin',
    'lg1', 'lg2', 'lg3', 'lg4', 'lg5', 'lg6', 'ds1', 'ds2', 'ds3', 'ds4', 'ds5', 'ds6'
  )),
  drop constraint fan_taunts_phrase_id_check,
  add constraint fan_taunts_phrase_id_check check (phrase_id in (
    'default', 'first', 'turtle', 'sleepy', 'next', 'wager', 'tease', 'laugh', 'cry', 'easy'
  ));

create table public.fan_character_card_catalog (
  id text primary key,
  team text not null check (team in ('lg', 'doosan')),
  starter boolean not null
);

insert into public.fan_character_card_catalog (id, team, starter) values
  ('lg1', 'lg', true), ('lg2', 'lg', false), ('lg3', 'lg', false),
  ('lg4', 'lg', true), ('lg5', 'lg', false), ('lg6', 'lg', false),
  ('ds1', 'doosan', true), ('ds2', 'doosan', false), ('ds3', 'doosan', false),
  ('ds4', 'doosan', true), ('ds5', 'doosan', false), ('ds6', 'doosan', false);

create table public.fan_character_card_ownership (
  fan_id uuid not null references public.fan_profiles (id) on delete cascade,
  card_id text not null references public.fan_character_card_catalog (id),
  primary key (fan_id, card_id)
);

create table public.fan_character_card_purchases (
  fan_id uuid not null references public.fan_profiles (id) on delete cascade,
  request_id uuid not null,
  card_id text references public.fan_character_card_catalog (id),
  charged integer not null check (charged >= 0),
  primary key (fan_id, request_id)
);

alter table public.fan_character_card_catalog enable row level security;
alter table public.fan_character_card_ownership enable row level security;
alter table public.fan_character_card_purchases enable row level security;
revoke all on public.fan_character_card_catalog, public.fan_character_card_ownership,
  public.fan_character_card_purchases from public, anon, authenticated;

create function public.fan_character_card_collection(p_fan public.fan_profiles)
returns jsonb
language sql
stable
set search_path = ''
as $$
  select jsonb_build_object(
    'team', p_fan.team,
    'ownedCardIds', coalesce(jsonb_agg(card.id order by card.id), '[]'::jsonb),
    'points', p_fan.points
  )
  from public.fan_character_card_catalog card
  where card.team = p_fan.team and (
    card.starter or exists (
      select 1 from public.fan_character_card_ownership owned where owned.fan_id = p_fan.id and owned.card_id = card.id
    )
  );
$$;

create function public.get_fan_card_collection()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  fan public.fan_profiles;
begin
  select * into fan from public.fan_profiles where id = auth.uid() and nickname is not null;
  if not found then raise exception 'A named fan is required.' using errcode = '42501'; end if;
  return public.fan_character_card_collection(fan);
end;
$$;

create function public.buy_fan_character_cards(p_card_id text, p_pack boolean, p_request_id uuid)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  player uuid := auth.uid();
  fan public.fan_profiles;
  prior_purchase public.fan_character_card_purchases;
  missing_cards text[];
  charge integer;
begin
  select * into fan from public.fan_profiles where id = player and nickname is not null for no key update;
  if not found then raise exception 'A named fan is required.' using errcode = '42501'; end if;
  if p_request_id is null then
    raise exception 'An idempotency key is required.' using detail = 'invalid_request';
  end if;

  if not p_pack and not exists (
    select 1 from public.fan_character_card_catalog where id = p_card_id and team = fan.team
  ) then
    raise exception 'Choose a card from your own team.' using detail = 'invalid_selection';
  end if;

  select * into prior_purchase from public.fan_character_card_purchases
  where fan_id = player and request_id = p_request_id;
  if found then
    if prior_purchase.card_id is distinct from p_card_id then
      raise exception 'Request key was already used with a different purchase.' using detail = 'request_conflict';
    end if;
    return public.fan_character_card_collection(fan) || jsonb_build_object('charged', prior_purchase.charged);
  end if;

  select coalesce(array_agg(card.id), array[]::text[]) into missing_cards
  from public.fan_character_card_catalog card
  where card.team = fan.team and not card.starter
    and (p_pack or card.id = p_card_id)
    and not exists (
      select 1 from public.fan_character_card_ownership owned where owned.fan_id = player and owned.card_id = card.id
    );

  charge := greatest(0, cardinality(missing_cards) * 100 - case when p_pack then 100 else 0 end);
  if fan.points < charge then
    raise exception 'Not enough points.' using detail = 'insufficient_points';
  end if;

  if charge > 0 then
    update public.fan_profiles set points = points - charge
      where id = player returning * into fan;
  end if;

  insert into public.fan_character_card_ownership (fan_id, card_id)
    select player, card_id from unnest(missing_cards) as cards(card_id);

  insert into public.fan_character_card_purchases (fan_id, request_id, card_id, charged)
    values (player, p_request_id, p_card_id, charge);

  return public.fan_character_card_collection(fan) || jsonb_build_object('charged', charge);
end;
$$;

create function public.buy_fan_card(p_card_id text, p_request_id uuid)
returns jsonb
language sql
security definer
set search_path = ''
as $$
  select public.buy_fan_character_cards(p_card_id, false, p_request_id);
$$;

create function public.buy_fan_card_pack(p_request_id uuid)
returns jsonb
language sql
security definer
set search_path = ''
as $$
  select public.buy_fan_character_cards(null, true, p_request_id);
$$;

create function public.get_fan_profile_stats()
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

  -- Only practice predictions have a settled result and a recorded reward.
  return (
    select jsonb_build_object(
      'hits', count(*) filter (where reward = 100),
      'tries', count(*),
      'sent', (select count(*) from public.fan_taunts where sender_id = player)
    )
    from public.fan_point_predictions
    where user_id = player and reward is not null and choice is not null
  );
end;
$$;

create function public.get_fan_camp_presence()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not exists (select 1 from public.fan_profiles where id = auth.uid() and nickname is not null) then
    raise exception 'A named fan is required.' using errcode = '42501';
  end if;
  return (
    select jsonb_build_object(
      'lg', count(*) filter (where fan.team = 'lg'),
      'doosan', count(*) filter (where fan.team = 'doosan')
    )
    from public.fan_taunt_presence presence
    join public.fan_profiles fan on fan.id = presence.fan_id
    where fan.nickname is not null and presence.active
      and presence.seen_at > statement_timestamp() - interval '3 minutes'
  );
end;
$$;

revoke all on function public.fan_character_card_collection(public.fan_profiles),
  public.get_fan_card_collection(), public.buy_fan_character_cards(text, boolean, uuid),
  public.buy_fan_card(text, uuid), public.buy_fan_card_pack(uuid), public.get_fan_profile_stats(),
  public.get_fan_camp_presence() from public, anon, authenticated;

grant execute on function public.get_fan_card_collection(),
  public.buy_fan_card(text, uuid), public.buy_fan_card_pack(uuid),
  public.get_fan_profile_stats(), public.get_fan_camp_presence() to authenticated;

create or replace function public.send_fan_taunt(
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
  card public.fan_character_card_catalog;
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

  select * into card from public.fan_character_card_catalog where id = p_card_id and team = sender.team;
  if not found or p_phrase_id is null or p_phrase_id not in ('default', 'tease', 'laugh', 'cry', 'easy', 'next') then
    raise exception 'Choose a card from your own team and an approved phrase.' using detail = 'invalid_selection';
  end if;

  if not card.starter and not exists (
    select 1 from public.fan_character_card_ownership where fan_id = player and card_id = card.id
  ) then
    raise exception 'Unlock the card before sending it.' using detail = 'card_not_owned';
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

commit;
