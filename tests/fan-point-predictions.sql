-- Run against a disposable Supabase database after applying the migrations.
begin;

insert into auth.users (id) values
  ('00000000-0000-4000-8000-0cc000000001'),
  ('00000000-0000-4000-8000-0cc000000002'),
  ('00000000-0000-4000-8000-0cc000000003'),
  ('00000000-0000-4000-8000-0cc000000004');

insert into public.fan_profiles (id, team, nickname, points) values
  ('00000000-0000-4000-8000-0cc000000001', 'lg', '승리팬', 0),
  ('00000000-0000-4000-8000-0cc000000002', 'doosan', '상대팬', 0),
  ('00000000-0000-4000-8000-0cc000000004', 'lg', null, 0);

do $$
declare
  player constant uuid := '00000000-0000-4000-8000-0cc000000001';
  opponent constant uuid := '00000000-0000-4000-8000-0cc000000002';
  stranger constant uuid := '00000000-0000-4000-8000-0cc000000003';
  unnamed constant uuid := '00000000-0000-4000-8000-0cc000000004';
  taunt_request constant uuid := '00000000-0000-4000-8000-0dd000000001';
  state jsonb;
  alternate_state jsonb;
  receipt jsonb;
begin
  if has_function_privilege('anon', 'public.fan_point_prediction(text,integer,text)', 'EXECUTE')
    or has_table_privilege('authenticated', 'public.fan_point_predictions', 'SELECT')
    or has_table_privilege('authenticated', 'public.fan_point_predictions', 'INSERT')
    or has_table_privilege('authenticated', 'public.fan_point_predictions', 'UPDATE')
    or has_column_privilege('authenticated', 'public.fan_profiles', 'points', 'UPDATE') then
    raise exception 'Unexpected prediction or points privileges.';
  end if;

  set local role authenticated;
  perform set_config('request.jwt.claim.sub', stranger::text, true);
  begin
    perform public.fan_point_prediction('start');
    raise exception 'An unregistered guest started a prediction.' using errcode = 'ZX001';
  exception when insufficient_privilege then
    null;
  end;
  perform set_config('request.jwt.claim.sub', unnamed::text, true);
  begin
    perform public.fan_point_prediction('start');
    raise exception 'An unnamed guest started a prediction.' using errcode = 'ZX001';
  exception when insufficient_privilege then
    null;
  end;

  perform set_config('request.jwt.claim.sub', player::text, true);
  begin
    update public.fan_profiles set points = 100 where id = player;
    raise exception 'The client set its point balance.' using errcode = 'ZX001';
  exception when insufficient_privilege then
    null;
  end;
  begin
    perform answer from public.fan_point_predictions where user_id = player;
    raise exception 'The client queried the hidden answer.' using errcode = 'ZX001';
  exception when insufficient_privilege then
    null;
  end;

  state := public.fan_point_prediction();
  if state ->> 'phase' is distinct from 'ready' or state ->> 'points' is distinct from '0'
    or state ->> 'answer' is not null or state ->> 'round' is not null then
    raise exception 'Unexpected initial state %.', state;
  end if;
  begin
    perform public.fan_point_prediction('vote', 1, 'safe');
    raise exception 'Accepted prediction before any round started.' using errcode = 'ZX001';
  exception when sqlstate 'P0001' then
    null;
  end;
  state := public.fan_point_prediction('start');
  alternate_state := public.fan_point_prediction('start');
  if state ->> 'round' is distinct from '1' or alternate_state ->> 'round' is distinct from '1'
    or state ->> 'phase' is distinct from 'open' or state ->> 'answer' is not null
    or state ->> 'choice' is not null or state ->> 'reward' is not null then
    raise exception 'A repeated start replaced the active round or exposed its answer %.', state;
  end if;

  reset role;
  update public.fan_point_predictions set opens_at = clock_timestamp() + interval '5 seconds'
    where user_id = player and round = 1;
  set local role authenticated;
  state := public.fan_point_prediction();
  if state ->> 'phase' is distinct from 'locked' or state ->> 'answer' is not null then
    raise exception 'A future round was presented as votable %.', state;
  end if;
  begin
    perform public.fan_point_prediction('vote', 1, 'safe');
    raise exception 'Accepted prediction before opens_at.' using errcode = 'ZX001';
  exception when sqlstate 'P0001' then
    null;
  end;
  reset role;
  update public.fan_point_predictions set answer = 'safe', opens_at = clock_timestamp() - interval '1 second'
    where user_id = player and round = 1;
  set local role authenticated;
  begin
    perform public.fan_point_prediction('vote', 2, 'safe');
    raise exception 'Accepted prediction for a future round number.' using errcode = 'ZX001';
  exception when sqlstate 'P0001' then
    null;
  end;
  state := public.fan_point_prediction('vote', 1, 'safe');
  alternate_state := public.fan_point_prediction('vote', 1, 'out');
  if state ->> 'choice' is distinct from 'safe' or alternate_state ->> 'choice' is distinct from 'safe'
    or alternate_state ->> 'answer' is not null or alternate_state ->> 'reward' is not null
    or alternate_state ->> 'points' is distinct from '0' then
    raise exception 'Repeated vote replaced prediction or credited it early %. %.', state, alternate_state;
  end if;

  perform set_config('request.jwt.claim.sub', opponent::text, true);
  if public.fan_point_prediction() ->> 'phase' is distinct from 'ready' then
    raise exception 'Opponent saw another fan''s active round.';
  end if;
  perform public.fan_taunt_activity(true);
  perform set_config('request.jwt.claim.sub', player::text, true);
  begin
    perform public.send_fan_taunt('lg1', 'default', taunt_request);
    raise exception 'Spent points before the award settled.' using errcode = 'ZX001';
  exception when sqlstate 'P0001' then
    null;
  end;

  reset role;
  update public.fan_point_predictions set closes_at = clock_timestamp() - interval '1 second'
    where user_id = player and round = 1;
  set local role authenticated;
  state := public.fan_point_prediction();
  if state ->> 'phase' is distinct from 'locked' or state ->> 'answer' is not null
    or state ->> 'reward' is not null or state ->> 'points' is distinct from '0' then
    raise exception 'Prediction answer or reward leaked before reveal %.', state;
  end if;

  reset role;
  update public.fan_point_predictions set reveals_at = clock_timestamp() - interval '500 milliseconds'
    where user_id = player and round = 1;
  set local role authenticated;
  state := public.fan_point_prediction();
  alternate_state := public.fan_point_prediction();
  if state ->> 'phase' is distinct from 'result' or state ->> 'answer' is distinct from 'safe'
    or state ->> 'reward' is distinct from '100' or state ->> 'points' is distinct from '100'
    or alternate_state ->> 'points' is distinct from '100' then
    raise exception 'Wrong result or repeated reward %. %.', state, alternate_state;
  end if;

  receipt := public.send_fan_taunt('lg1', 'default', taunt_request);
  if receipt ->> 'points' is distinct from '0'
    or receipt -> 'taunt' ->> 'recipientNickname' is distinct from '상대팬' then
    raise exception 'Earned points did not fund the real taunt %.', receipt;
  end if;
  if public.send_fan_taunt('lg1', 'default', taunt_request) is distinct from receipt
    or public.fan_point_prediction() ->> 'points' is distinct from '0' then
    raise exception 'Retry charged twice or read restored spent points.';
  end if;

  state := public.fan_point_prediction('start');
  if state ->> 'round' is distinct from '2' or state ->> 'choice' is not null or state ->> 'answer' is not null then
    raise exception 'New round reused the previous result %.', state;
  end if;
  reset role;
  update public.fan_point_predictions
    set opens_at = clock_timestamp() - interval '30 seconds', closes_at = clock_timestamp() - interval '1 second'
    where user_id = player and round = 2;
  set local role authenticated;
  begin
    perform public.fan_point_prediction('vote', 2, 'safe');
    raise exception 'Accepted vote after closes_at.' using errcode = 'ZX001';
  exception when sqlstate 'P0001' then
    null;
  end;
  reset role;
  update public.fan_point_predictions set reveals_at = clock_timestamp() - interval '500 milliseconds'
    where user_id = player and round = 2;
  set local role authenticated;
  state := public.fan_point_prediction();
  if state ->> 'phase' is distinct from 'result' or state ->> 'choice' is not null
    or state ->> 'reward' is distinct from '0' or state ->> 'points' is distinct from '0' then
    raise exception 'A missed round awarded points %.', state;
  end if;

  state := public.fan_point_prediction('start');
  if state ->> 'round' is distinct from '3' then
    raise exception 'Third prediction was unavailable %.', state;
  end if;
  reset role;
  update public.fan_point_predictions set answer = 'out' where user_id = player and round = 3;
  set local role authenticated;
  perform public.fan_point_prediction('vote', 3, 'safe');
  reset role;
  update public.fan_point_predictions
    set opens_at = clock_timestamp() - interval '20 seconds', closes_at = clock_timestamp() - interval '8 seconds',
      reveals_at = clock_timestamp() - interval '6 seconds'
    where user_id = player and round = 3;
  set local role authenticated;
  state := public.fan_point_prediction();
  if state ->> 'phase' is distinct from 'result' or state ->> 'answer' is distinct from 'out'
    or state ->> 'choice' is distinct from 'safe' or state ->> 'reward' is distinct from '0'
    or state ->> 'points' is distinct from '0' then
    raise exception 'A wrong prediction awarded points %.', state;
  end if;
  reset role;
end;
$$;

rollback;
