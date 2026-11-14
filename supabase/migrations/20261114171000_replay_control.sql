begin;

create table public.replay_operators (
  user_id uuid primary key references public.fan_profiles(id) on delete cascade
);
alter table public.replay_operators enable row level security;
revoke all on public.replay_operators from public, anon, authenticated;

create table public.replay_operator_code (digest bytea primary key);
alter table public.replay_operator_code enable row level security;
revoke all on public.replay_operator_code from public, anon, authenticated;

create function public.claim_replay_operator(p_code text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  player uuid := auth.uid();
begin
  if player is null or p_code is null or char_length(p_code) <> 36
    or not exists (select 1 from public.fan_profiles where id = player)
    or not exists (select 1 from public.replay_operator_code where digest = sha256(convert_to(p_code, 'UTF8'))) then
    return false;
  end if;
  insert into public.replay_operators values (player) on conflict do nothing;
  return true;
end;
$$;

revoke all on function public.claim_replay_operator(text) from public, anon, authenticated;
grant execute on function public.claim_replay_operator(text) to authenticated;

alter table public.replay_rooms
  alter column starts_at drop not null,
  add column position_seconds integer not null default 0 check (position_seconds >= 0);

create function public.control_replay(p_room uuid, p_action text, p_second integer default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  room public.replay_rooms;
  duration integer;
  elapsed integer;
  instant timestamptz;
begin
  if not exists (select 1 from public.replay_operators where user_id = auth.uid()) then
    raise exception 'A replay operator is required.' using errcode = '42501';
  end if;
  select * into room from public.replay_rooms where id = p_room and active for update;
  if not found then raise exception 'The room is closed.' using errcode = '55000'; end if;
  select duration_seconds into strict duration from public.replay_games where id = room.game_id;

  instant := clock_timestamp();
  elapsed := greatest(0, least(duration, room.position_seconds
    + floor(coalesce(extract(epoch from (instant - room.starts_at)), 0))::integer));
  case p_action
    when 'play' then
      if elapsed >= duration then raise exception 'Seek before resuming.' using errcode = '55000'; end if;
      if room.starts_at is null then
        update public.replay_rooms set starts_at = instant where id = room.id;
      end if;
    when 'pause' then
      update public.replay_rooms set position_seconds = elapsed, starts_at = null where id = room.id;
    when 'seek' then
      if p_second is null or p_second not between 0 and duration then
        raise exception 'Invalid replay position.' using errcode = '22023';
      end if;
      update public.replay_rooms set position_seconds = p_second, starts_at = null where id = room.id;
    else raise exception 'Invalid replay action.' using errcode = '22023';
  end case;
end;
$$;

revoke all on function public.control_replay(uuid, text, integer) from public, anon, authenticated;
grant execute on function public.control_replay(uuid, text, integer) to authenticated;

create or replace function public.get_replay_room(p_room uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  player uuid := auth.uid();
  room public.replay_rooms;
  game public.replay_games;
  at_bat public.replay_rounds;
  elapsed integer;
  phase text;
  mine text;
begin
  if player is null or not exists (select 1 from public.fan_profiles where id = player) then
    raise exception 'A fan profile is required.' using errcode = '42501';
  end if;

  select * into room from public.replay_rooms where id = p_room and active;
  if not found then return null; end if;

  select * into strict game from public.replay_games where id = room.game_id;
  elapsed := floor(room.position_seconds + coalesce(extract(epoch from (statement_timestamp() - room.starts_at)), 0));
  select * into at_bat from public.replay_rounds
    where game_id = room.game_id and open_second <= elapsed
    order by open_second desc limit 1;

  phase := case
    when elapsed >= game.duration_seconds then 'finished'
    when room.starts_at is null and elapsed = 0 then 'waiting'
    when room.starts_at is null then 'paused'
    when at_bat.id is null then 'waiting'
    when elapsed >= at_bat.reveal_second then 'revealed'
    when at_bat.close_second is null or elapsed >= at_bat.close_second then 'locked'
    else 'open' end;

  select choice into mine from public.replay_votes
    where room_id = room.id and round_id = at_bat.id and user_id = player;

  return jsonb_build_object(
    'roomId', room.id, 'date', game.played_on, 'away', game.away, 'home', game.home,
    'phase', phase, 'elapsed', greatest(0, least(elapsed, game.duration_seconds)), 'duration', game.duration_seconds,
    'playing', room.starts_at is not null and elapsed < game.duration_seconds,
    'canControl', exists (select 1 from public.replay_operators where user_id = player), 'roundId', at_bat.id, 'inning', at_bat.inning, 'half', at_bat.half,
    'batter', at_bat.batter, 'secondsLeft', case when phase = 'open' then at_bat.close_second - elapsed end,
    'result', case when elapsed >= at_bat.reveal_second then at_bat.result end, 'myVote', mine
  );
end;
$$;

create or replace function public.cast_replay_vote(p_room uuid, p_round text, p_choice text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  player uuid := auth.uid();
  room public.replay_rooms;
  at_bat public.replay_rounds;
  elapsed numeric;
  saved text;
begin
  if player is null or not exists (select 1 from public.fan_profiles where id = player) then
    raise exception 'A fan profile is required.' using errcode = '42501';
  end if;
  if p_choice is null or p_choice not in ('safe', 'out') then
    raise exception 'Invalid vote.' using errcode = '22023';
  end if;

  select * into room from public.replay_rooms where id = p_room and active for share;
  if not found then raise exception 'The room is closed.' using errcode = '55000'; end if;

  select choice into saved from public.replay_votes
    where room_id = room.id and round_id = p_round and user_id = player;
  if found then return saved; end if;

  if room.starts_at is null then raise exception 'The room is paused.' using errcode = '55000'; end if;
  elapsed := room.position_seconds + extract(epoch from (clock_timestamp() - room.starts_at));
  select * into at_bat from public.replay_rounds
    where game_id = room.game_id and open_second <= elapsed
    order by open_second desc limit 1;
  if not found or at_bat.id is distinct from p_round or at_bat.close_second is null
    or elapsed >= (select duration_seconds from public.replay_games where id = room.game_id)
    or elapsed >= at_bat.close_second then
    raise exception 'Voting is closed for this plate appearance.' using errcode = '55000';
  end if;

  insert into public.replay_votes (room_id, game_id, round_id, user_id, choice)
    values (room.id, room.game_id, at_bat.id, player, p_choice)
    on conflict (room_id, round_id, user_id) do nothing;
  select choice into strict saved from public.replay_votes
    where room_id = room.id and round_id = at_bat.id and user_id = player;
  return saved;
end;
$$;

commit;
