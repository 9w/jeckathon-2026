-- Run against a disposable Supabase database after applying the migrations.
begin;

insert into auth.users (id) values
  ('00000000-0000-4000-8000-0aa000000001'),
  ('00000000-0000-4000-8000-0aa000000002'),
  ('00000000-0000-4000-8000-0aa000000003'),
  ('00000000-0000-4000-8000-0aa000000004');

insert into public.fan_profiles (id, team, nickname, points) values
  ('00000000-0000-4000-8000-0aa000000001', 'lg', '직관팬', 200),
  ('00000000-0000-4000-8000-0aa000000002', 'doosan', '잠실팬', 100),
  ('00000000-0000-4000-8000-0aa000000003', 'lg', '한강팬', 100),
  ('00000000-0000-4000-8000-0aa000000004', 'doosan', '원정팬', 0);

do $$
declare
  sender constant uuid := '00000000-0000-4000-8000-0aa000000001';
  receiver constant uuid := '00000000-0000-4000-8000-0aa000000002';
  stranger constant uuid := '00000000-0000-4000-8000-0aa000000003';
  alternate constant uuid := '00000000-0000-4000-8000-0aa000000004';
  request_id constant uuid := '00000000-0000-4000-8000-0bb000000001';
  other_id constant uuid := '00000000-0000-4000-8000-0bb000000002';
  counter_id constant uuid := '00000000-0000-4000-8000-0bb000000003';
  receipt jsonb;
  replay_receipt jsonb;
  message_id uuid;
  read_at text;
  rejected text;
begin
  if has_function_privilege('anon', 'public.send_fan_taunt(text,text,uuid,uuid)', 'EXECUTE')
    or has_function_privilege('anon', 'public.fan_taunt_activity(boolean)', 'EXECUTE')
    or has_table_privilege('authenticated', 'public.fan_taunts', 'SELECT')
    or has_table_privilege('authenticated', 'public.fan_taunt_presence', 'UPDATE')
    or has_column_privilege('authenticated', 'public.fan_profiles', 'points', 'UPDATE') then
    raise exception 'Unexpected taunt permissions.';
  end if;

  set local role authenticated;
  perform set_config('request.jwt.claim.sub', stranger::text, true);
  perform public.fan_taunt_activity(true);
  perform set_config('request.jwt.claim.sub', sender::text, true);
  perform public.fan_taunt_activity(true);
  begin
    perform public.send_fan_taunt('first', 'default', request_id);
    raise exception 'Sent with no active opponent.' using errcode = 'ZX001';
  exception when sqlstate 'P0001' then
    get stacked diagnostics rejected = pg_exception_detail;
    if rejected <> 'inactive_opponent' then raise; end if;
  end;
  if (select points from public.fan_profiles where id = sender) <> 200 then
    raise exception 'Failed send changed the balance.';
  end if;

  perform set_config('request.jwt.claim.sub', receiver::text, true);
  perform public.fan_taunt_activity(true);
  perform set_config('request.jwt.claim.sub', alternate::text, true);
  perform public.fan_taunt_activity(true);
  perform public.fan_taunt_activity(false);
  perform set_config('request.jwt.claim.sub', sender::text, true);
  begin
    perform public.send_fan_taunt('unapproved', 'default', request_id);
    raise exception 'Accepted a non-catalog item.' using errcode = 'ZX001';
  exception when sqlstate 'P0001' then
    get stacked diagnostics rejected = pg_exception_detail;
    if rejected <> 'invalid_selection' then raise; end if;
  end;
  receipt := public.send_fan_taunt('turtle', 'default', request_id);
  message_id := (receipt -> 'taunt' ->> 'id')::uuid;
  if message_id is null or receipt ->> 'points' <> '100'
    or receipt -> 'taunt' ->> 'recipientNickname' <> '잠실팬'
    or receipt -> 'taunt' ? 'recipientId' then
    raise exception 'Invalid receipt %.', receipt;
  end if;
  replay_receipt := public.send_fan_taunt('turtle', 'default', request_id);
  if replay_receipt <> receipt then raise exception 'Retry changed the receipt.'; end if;
  begin
    perform public.send_fan_taunt('first', 'default', request_id);
    raise exception 'Accepted a changed request payload.' using errcode = 'ZX001';
  exception when sqlstate 'P0001' then
    get stacked diagnostics rejected = pg_exception_detail;
    if rejected <> 'request_conflict' then raise; end if;
  end;
  begin
    perform public.send_fan_taunt('first', 'default', other_id);
    raise exception 'Ignored the sender cooldown.' using errcode = 'ZX001';
  exception when sqlstate 'P0001' then
    get stacked diagnostics rejected = pg_exception_detail;
    if rejected <> 'cooldown' then raise; end if;
  end;

  if public.read_fan_taunt(message_id) is not null
    or public.get_fan_taunt(message_id) ->> 'readAt' is not null
    or public.list_fan_taunts() <> '[]'::jsonb then
    raise exception 'Sender received inbox access to their outgoing message.';
  end if;
  perform set_config('request.jwt.claim.sub', stranger::text, true);
  if public.get_fan_taunt(message_id) is not null or public.read_fan_taunt(message_id) is not null then
    raise exception 'Unrelated fan obtained a private message.';
  end if;
  begin
    perform public.send_fan_taunt('first', 'default', other_id, message_id);
    raise exception 'Unrelated fan sent a counter.' using errcode = 'ZX001';
  exception when sqlstate 'P0001' then
    get stacked diagnostics rejected = pg_exception_detail;
    if rejected <> 'invalid_reply' then raise; end if;
  end;
  perform set_config('request.jwt.claim.sub', receiver::text, true);
  if jsonb_array_length(public.list_fan_taunts()) <> 1 then
    raise exception 'The incoming message was unavailable.';
  end if;
  read_at := public.read_fan_taunt(message_id) ->> 'readAt';
  if read_at is null or public.read_fan_taunt(message_id) ->> 'readAt' <> read_at then
    raise exception 'Read receipt was missing or changed on retry.';
  end if;
  receipt := public.send_fan_taunt('violin', 'next', counter_id, message_id);
  if receipt ->> 'points' <> '0'
    or receipt -> 'taunt' ->> 'replyTo' <> message_id::text
    or receipt -> 'taunt' ->> 'recipientNickname' <> '직관팬' then
    raise exception 'Counter did not go to the original sender.';
  end if;
  if public.send_fan_taunt('violin', 'next', counter_id, message_id) <> receipt then
    raise exception 'Counter retry changed the receipt.';
  end if;

  perform set_config('request.jwt.claim.sub', sender::text, true);
  if public.get_fan_taunt(message_id) ->> 'readAt' <> read_at
    or jsonb_array_length(public.list_fan_taunts()) <> 1 then
    raise exception 'Sender did not get the read receipt and counter.';
  end if;
  reset role;
  if (select count(*) from public.fan_taunts) <> 2 then
    raise exception 'Unexpected message count.';
  end if;
end;
$$;

do $$
declare
  sender constant uuid := '00000000-0000-4000-8000-0aa000000001';
  receiver constant uuid := '00000000-0000-4000-8000-0aa000000002';
  stranger constant uuid := '00000000-0000-4000-8000-0aa000000003';
  alternate constant uuid := '00000000-0000-4000-8000-0aa000000004';
  second_request constant uuid := '00000000-0000-4000-8000-0bb000000005';
  first_message uuid;
  rejected text;
  receipt jsonb;
begin
  select id into first_message from public.fan_taunts where sender_id = sender;
  update public.fan_taunts set sent_at = clock_timestamp() - interval '20 seconds';

  set local role authenticated;
  perform set_config('request.jwt.claim.sub', receiver::text, true);
  begin
    perform public.send_fan_taunt('first', 'default', second_request, first_message);
    raise exception 'Accepted a second counter.' using errcode = 'ZX001';
  exception when sqlstate 'P0001' then
    get stacked diagnostics rejected = pg_exception_detail;
    if rejected <> 'invalid_reply' then raise; end if;
  end;
  begin
    perform public.send_fan_taunt('first', 'default', second_request);
    raise exception 'Sent with zero points.' using errcode = 'ZX001';
  exception when sqlstate 'P0001' then
    get stacked diagnostics rejected = pg_exception_detail;
    if rejected <> 'insufficient_points' then raise; end if;
  end;

  perform set_config('request.jwt.claim.sub', sender::text, true);
  begin
    perform public.send_fan_taunt('first', 'default', second_request);
    raise exception 'Targeted the same recipient twice in a minute.' using errcode = 'ZX001';
  exception when sqlstate 'P0001' then
    get stacked diagnostics rejected = pg_exception_detail;
    if rejected <> 'inactive_opponent' then raise; end if;
  end;

  reset role;
  update public.fan_taunt_presence set seen_at = clock_timestamp() - interval '4 minutes' where fan_id = receiver;
  set local role authenticated;
  perform set_config('request.jwt.claim.sub', stranger::text, true);
  begin
    perform public.send_fan_taunt('first', 'default', second_request);
    raise exception 'Sent to a stale active fan.' using errcode = 'ZX001';
  exception when sqlstate 'P0001' then
    get stacked diagnostics rejected = pg_exception_detail;
    if rejected <> 'inactive_opponent' then raise; end if;
  end;

  perform set_config('request.jwt.claim.sub', receiver::text, true);
  perform public.fan_taunt_activity(true);
  reset role;
  insert into public.fan_taunts (
    sender_id, receiver_id, sender_nickname, recipient_nickname, card_id, phrase_id, request_id, cost, sent_at
  ) values
    (sender, receiver, '직관팬', '잠실팬', 'first', 'default', gen_random_uuid(), 100, clock_timestamp() - interval '10 seconds'),
    (sender, receiver, '직관팬', '잠실팬', 'first', 'default', gen_random_uuid(), 100, clock_timestamp() - interval '30 seconds');
  set local role authenticated;
  perform set_config('request.jwt.claim.sub', stranger::text, true);
  begin
    perform public.send_fan_taunt('first', 'default', second_request);
    raise exception 'Exceeded recipient limit despite elapsed receive interval.' using errcode = 'ZX001';
  exception when sqlstate 'P0001' then
    get stacked diagnostics rejected = pg_exception_detail;
    if rejected <> 'inactive_opponent' then raise; end if;
  end;

  perform set_config('request.jwt.claim.sub', alternate::text, true);
  perform public.fan_taunt_activity(true);
  perform set_config('request.jwt.claim.sub', stranger::text, true);
  receipt := public.send_fan_taunt('first', 'wager', second_request);
  if receipt -> 'taunt' ->> 'recipientNickname' <> '원정팬' or receipt ->> 'points' <> '0' then
    raise exception 'Failed to select the alternative receiver.';
  end if;
  reset role;
end;
$$;

rollback;
