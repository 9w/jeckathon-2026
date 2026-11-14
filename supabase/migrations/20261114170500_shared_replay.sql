begin;

create table public.replay_games (
  id text primary key,
  played_on date not null,
  away text not null,
  home text not null,
  duration_seconds integer not null check (duration_seconds > 0)
);

create table public.replay_rounds (
  game_id text not null references public.replay_games(id),
  id text not null,
  inning integer not null check (inning > 0),
  half text not null check (half in ('top', 'bottom')),
  batter text not null,
  open_second integer not null check (open_second >= 0),
  close_second integer check (close_second > open_second and close_second < reveal_second),
  reveal_second integer not null check (reveal_second >= open_second),
  result text not null,
  primary key (game_id, id),
  unique (game_id, open_second)
);

create table public.replay_rooms (
  id uuid primary key default gen_random_uuid(),
  game_id text not null references public.replay_games(id),
  starts_at timestamptz not null,
  active boolean not null default true,
  unique (id, game_id)
);
create unique index replay_one_active_room on public.replay_rooms (active) where active;

create table public.replay_votes (
  room_id uuid not null,
  game_id text not null,
  round_id text not null,
  user_id uuid not null references public.fan_profiles(id) on delete cascade,
  choice text not null check (choice in ('safe', 'out')),
  primary key (room_id, round_id, user_id),
  foreign key (room_id, game_id) references public.replay_rooms(id, game_id),
  foreign key (game_id, round_id) references public.replay_rounds(game_id, id)
);

alter table public.replay_games enable row level security;
alter table public.replay_rounds enable row level security;
alter table public.replay_rooms enable row level security;
alter table public.replay_votes enable row level security;
revoke all on public.replay_games, public.replay_rounds, public.replay_rooms, public.replay_votes
  from public, anon, authenticated;

create function public.get_replay_room(p_room uuid)
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
  elapsed := floor(extract(epoch from (statement_timestamp() - room.starts_at)));
  select * into at_bat from public.replay_rounds
    where game_id = room.game_id and open_second <= elapsed
    order by open_second desc limit 1;

  phase := case
    when elapsed >= game.duration_seconds then 'finished'
    when at_bat.id is null then 'waiting'
    when elapsed >= at_bat.reveal_second then 'revealed'
    when at_bat.close_second is null or elapsed >= at_bat.close_second then 'locked'
    else 'open' end;

  select choice into mine from public.replay_votes
    where room_id = room.id and round_id = at_bat.id and user_id = player;

  return jsonb_build_object(
    'roomId', room.id, 'date', game.played_on, 'away', game.away, 'home', game.home,
    'phase', phase, 'roundId', at_bat.id, 'inning', at_bat.inning, 'half', at_bat.half,
    'batter', at_bat.batter, 'secondsLeft', case when phase = 'open' then at_bat.close_second - elapsed end,
    'result', case when elapsed >= at_bat.reveal_second then at_bat.result end, 'myVote', mine
  );
end;
$$;

create function public.cast_replay_vote(p_room uuid, p_round text, p_choice text)
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

  elapsed := extract(epoch from (clock_timestamp() - room.starts_at));
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

revoke all on function public.get_replay_room(uuid), public.cast_replay_vote(uuid, text, text) from public, anon, authenticated;
grant execute on function public.get_replay_room(uuid), public.cast_replay_vote(uuid, text, text) to authenticated;

commit;
