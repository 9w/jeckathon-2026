-- Run after the replay and reward migrations in a disposable database.
begin;

insert into auth.users (id) values
  ('00000000-0000-4000-8000-a10000000001'),
  ('00000000-0000-4000-8000-a10000000002'),
  ('00000000-0000-4000-8000-a10000000003'),
  ('00000000-0000-4000-8000-a10000000004');

insert into public.fan_profiles (id, team, nickname) values
  ('00000000-0000-4000-8000-a10000000001', 'lg', '검증적중팬'),
  ('00000000-0000-4000-8000-a10000000002', 'doosan', '검증실패팬'),
  ('00000000-0000-4000-8000-a10000000003', 'lg', '검증관전팬');

insert into public.replay_games (id, played_on, away, home, duration_seconds)
values ('award-fixture', '2026-09-03', 'LG', '두산', 220);

insert into public.replay_rounds (
  game_id, id, inning, half, batter, open_second, close_second, reveal_second, result, vote_answer
) values
  ('award-fixture', 'one', 1, 'top', '예시 선수', 10, 40, 55, '1루타', 'safe'),
  ('award-fixture', 'unknown', 1, 'top', '예시 선수', 60, 85, 90, '미분류 기록', null),
  ('award-fixture', 'interrupted', 1, 'top', '예시 선수', 92, null, 98, '주루사로 타석 중단', null),
  ('award-fixture', 'two', 1, 'bottom', '예시 선수', 100, 130, 150, '삼진', 'out');

insert into public.replay_rooms (id, game_id, starts_at, position_seconds)
values ('00000000-0000-4000-8000-a20000000001', 'award-fixture', clock_timestamp(), 0);

do $$
declare
  winner constant uuid := '00000000-0000-4000-8000-a10000000001';
  loser constant uuid := '00000000-0000-4000-8000-a10000000002';
  watcher constant uuid := '00000000-0000-4000-8000-a10000000003';
  outsider constant uuid := '00000000-0000-4000-8000-a10000000004';
  original constant uuid := '00000000-0000-4000-8000-a20000000001';
  restarted constant uuid := '00000000-0000-4000-8000-a20000000002';
  nonexistent constant uuid := '00000000-0000-4000-8000-a20000000009';
  state jsonb;
begin
  if has_function_privilege('anon', 'public.get_fan_replay_rewards(uuid)', 'EXECUTE')
    or has_table_privilege('authenticated', 'public.replay_point_awards', 'INSERT')
    or has_table_privilege('authenticated', 'public.replay_rounds', 'SELECT') then
    raise exception 'Reward or hidden answer privileges are wrong.';
  end if;

  insert into public.replay_operators (user_id) values (winner);

  set local role authenticated;
  perform set_config('request.jwt.claim.sub', outsider::text, true);
  begin
    perform public.get_fan_replay_rewards(original);
    raise exception 'An unregistered account read rewards.' using errcode = 'ZX001';
  exception when insufficient_privilege then null;
  end;

  perform set_config('request.jwt.claim.sub', winner::text, true);
  if public.get_fan_replay_rewards(nonexistent) is not null then
    raise exception 'A nonexistent room returned rewards.';
  end if;
  if public.get_fan_replay_rewards(original) ->> 'voteCount' is distinct from '0' then
    raise exception 'A not-yet-started room reported votes.';
  end if;
  begin
    perform public.cast_replay_vote(original, 'one', 'safe');
    raise exception 'Accepted an early vote.' using errcode = 'ZX001';
  exception when sqlstate '55000' then null;
  end;

  perform public.control_replay(original, 'seek', 12);
  perform public.control_replay(original, 'play');
  if public.cast_replay_vote(original, 'one', 'safe') is distinct from 'safe'
    or public.cast_replay_vote(original, 'one', 'out') is distinct from 'safe' then
    raise exception 'A duplicate changed the original vote.';
  end if;
  perform set_config('request.jwt.claim.sub', loser::text, true);
  perform public.cast_replay_vote(original, 'one', 'out');
  state := public.get_fan_replay_rewards(original);
  if state ->> 'points' is distinct from '0' or state ->> 'roundReward' is not null
    or state ->> 'voteCount' is distinct from '2' or state ->> 'safeVotes' is not null
    or state ->> 'outVotes' is not null then
    raise exception 'Open response exposed payout or vote split %.', state;
  end if;

  perform set_config('request.jwt.claim.sub', winner::text, true);
  perform public.control_replay(original, 'seek', 42);
  state := public.get_fan_replay_rewards(original);
  if state ->> 'points' is distinct from '0' or state ->> 'roundReward' is not null
    or state ->> 'safeVotes' is distinct from '1' or state ->> 'outVotes' is distinct from '1' then
    raise exception 'Closed vote split or pre-reveal payout was wrong %.', state;
  end if;
  perform public.control_replay(original, 'seek', 55);
  state := public.get_fan_replay_rewards(original);
  if state ->> 'points' is distinct from '100' or state ->> 'earned' is distinct from '100'
    or state ->> 'roundReward' is distinct from '100' then
    raise exception 'A correct vote was not paid at the result boundary %.', state;
  end if;
  if public.get_fan_replay_rewards(original) ->> 'points' is distinct from '100' then
    raise exception 'Repeated settlement changed the balance.';
  end if;

  perform public.control_replay(original, 'seek', 12);
  state := public.get_fan_replay_rewards(original);
  if state ->> 'points' is distinct from '100' or state ->> 'earned' is distinct from '100'
    or state ->> 'roundReward' is not null or state ->> 'safeVotes' is not null then
    raise exception 'Backward seek revoked or exposed a payout %.', state;
  end if;
  perform set_config('request.jwt.claim.sub', loser::text, true);
  state := public.get_fan_replay_rewards(original);
  if state ->> 'points' is distinct from '0' or state ->> 'earned' is distinct from '0' then
    raise exception 'An incorrect prediction received points %.', state;
  end if;
  if public.get_fan_profile_stats() is distinct from '{"hits":0,"tries":1,"sent":0}'::jsonb then
    raise exception 'A missed prediction did not settle after backward seek.';
  end if;

  perform set_config('request.jwt.claim.sub', winner::text, true);
  perform public.control_replay(original, 'play');
  perform set_config('request.jwt.claim.sub', watcher::text, true);
  perform public.cast_replay_vote(original, 'one', 'safe');
  perform set_config('request.jwt.claim.sub', winner::text, true);
  perform public.control_replay(original, 'seek', 55);
  perform set_config('request.jwt.claim.sub', watcher::text, true);
  if public.get_fan_replay_rewards(original) ->> 'points' is distinct from '0' then
    raise exception 'A vote cast after rewinding the same room received points.';
  end if;
  perform set_config('request.jwt.claim.sub', winner::text, true);
  perform public.control_replay(original, 'seek', 68);
  perform public.control_replay(original, 'play');
  perform public.cast_replay_vote(original, 'unknown', 'safe');
  perform public.control_replay(original, 'seek', 92);
  state := public.get_fan_replay_rewards(original);
  if state ->> 'points' is distinct from '100' or state ->> 'roundReward' is not null
    or state ->> 'safeVotes' is not null then
    raise exception 'An unclassified or interrupted play paid out %.', state;
  end if;

  perform public.control_replay(original, 'seek', 105);
  perform public.control_replay(original, 'play');
  perform public.cast_replay_vote(original, 'two', 'out');
  reset role;
  update public.replay_rooms set active = false where id = original;
  insert into public.replay_rooms (id, game_id, starts_at, position_seconds)
  values (restarted, 'award-fixture', clock_timestamp(), 12);
  set local role authenticated;
  perform set_config('request.jwt.claim.sub', watcher::text, true);
  perform public.cast_replay_vote(restarted, 'one', 'safe');
  perform set_config('request.jwt.claim.sub', winner::text, true);
  perform public.control_replay(restarted, 'seek', 55);
  state := public.get_fan_replay_rewards(restarted);
  if state ->> 'points' is distinct from '100' or state ->> 'roundReward' is not null then
    raise exception 'Restart paid the same completed result again %.', state;
  end if;
  perform set_config('request.jwt.claim.sub', watcher::text, true);
  if public.get_fan_replay_rewards(restarted) ->> 'points' is distinct from '100' then
    raise exception 'A new room blocked a fan''s first eligible prediction.';
  end if;
  perform set_config('request.jwt.claim.sub', winner::text, true);
  perform public.control_replay(restarted, 'seek', 150);
  state := public.get_fan_replay_rewards(restarted);
  if state ->> 'points' is distinct from '200' or state ->> 'earned' is distinct from '200' then
    raise exception 'A first valid vote from the prior room did not settle on reveal %.', state;
  end if;
  if public.get_fan_profile_stats() is distinct from '{"hits":2,"tries":2,"sent":0}'::jsonb then
    raise exception 'Record did not count exactly two settled, correct shared votes.';
  end if;
  perform set_config('request.jwt.claim.sub', loser::text, true);
  perform public.fan_taunt_activity(true);
  perform set_config('request.jwt.claim.sub', winner::text, true);
  state := public.buy_fan_card('lg2', gen_random_uuid());
  if state ->> 'points' is distinct from '100' or state ->> 'charged' is distinct from '100' then
    raise exception 'Settled replay points did not fund the purchase %.', state;
  end if;
  state := public.send_fan_taunt('lg2', 'default', gen_random_uuid());
  if state ->> 'points' is distinct from '0' or state -> 'taunt' ->> 'cardId' is distinct from 'lg2' then
    raise exception 'Settled replay points did not fund real dispatch %.', state;
  end if;
  state := public.get_fan_replay_rewards(restarted);
  if state ->> 'points' is distinct from '0' or state ->> 'earned' is distinct from '200' then
    raise exception 'Reward polling restored spent points %.', state;
  end if;
  reset role;
end;
$$;

rollback;
