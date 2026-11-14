-- Run against a disposable Supabase database after applying the migrations.
begin;

insert into auth.users (id) values
  ('00000000-0000-4000-8000-c00000000001'),
  ('00000000-0000-4000-8000-c00000000002'),
  ('00000000-0000-4000-8000-c00000000003'),
  ('00000000-0000-4000-8000-c00000000004');

insert into public.fan_profiles (id, team, nickname, points) values
  ('00000000-0000-4000-8000-c00000000001', 'lg', '제비팬', 450),
  ('00000000-0000-4000-8000-c00000000002', 'doosan', '곰직관팬', 0),
  ('00000000-0000-4000-8000-c00000000003', 'lg', '오래된팬', 0);

insert into public.fan_taunts (
  id, sender_id, receiver_id, sender_nickname, recipient_nickname, card_id, phrase_id, request_id, cost, sent_at
) values (
  '00000000-0000-4000-8000-c00000000009',
  '00000000-0000-4000-8000-c00000000003',
  '00000000-0000-4000-8000-c00000000002',
  '오래된팬', '곰직관팬', 'turtle', 'default', '00000000-0000-4000-8000-c00000000099',
  100, clock_timestamp() - interval '4 minutes'
);

do $$
declare
  lg_fan constant uuid := '00000000-0000-4000-8000-c00000000001';
  doosan_fan constant uuid := '00000000-0000-4000-8000-c00000000002';
  older_fan constant uuid := '00000000-0000-4000-8000-c00000000003';
  non_fan constant uuid := '00000000-0000-4000-8000-c00000000004';
  old_message constant uuid := '00000000-0000-4000-8000-c00000000009';
  old_request constant uuid := '00000000-0000-4000-8000-c00000000099';
  single_request constant uuid := '00000000-0000-4000-8000-c00000000100';
  pack_request constant uuid := '00000000-0000-4000-8000-c00000000101';
  send_request constant uuid := '00000000-0000-4000-8000-c00000000102';
  receipt jsonb;
  rejected text;
  sent_message uuid;
begin
  if has_function_privilege('anon', 'public.get_fan_card_collection()', 'EXECUTE')
    or has_function_privilege('anon', 'public.buy_fan_card(text,uuid)', 'EXECUTE')
    or has_table_privilege('authenticated', 'public.fan_character_card_ownership', 'INSERT')
    or has_table_privilege('authenticated', 'public.fan_character_card_purchases', 'SELECT') then
    raise exception 'Unexpected card ownership privileges.';
  end if;

  set local role authenticated;
  perform set_config('request.jwt.claim.sub', non_fan::text, true);
  begin
    perform public.get_fan_card_collection();
    raise exception 'An unregistered guest obtained a collection.' using errcode = 'ZX001';
  exception when insufficient_privilege then null;
  end;

  perform set_config('request.jwt.claim.sub', doosan_fan::text, true);
  receipt := public.get_fan_card_collection();
  if receipt -> 'ownedCardIds' <> '["ds1","ds4"]'::jsonb or receipt ->> 'points' <> '0' then
    raise exception 'Doosan starters changed the balance or showed the wrong cards %.', receipt;
  end if;
  begin
    perform public.buy_fan_card('ds2', single_request);
    raise exception 'Purchased a card without points.' using errcode = 'ZX001';
  exception when sqlstate 'P0001' then
    get stacked diagnostics rejected = pg_exception_detail;
    if rejected <> 'insufficient_points' then raise; end if;
  end;
  begin
    perform public.buy_fan_card_pack(pack_request);
    raise exception 'Purchased four locked cards without points.' using errcode = 'ZX001';
  exception when sqlstate 'P0001' then
    get stacked diagnostics rejected = pg_exception_detail;
    if rejected <> 'insufficient_points' then raise; end if;
  end;
  perform public.fan_taunt_activity(true);
  if public.list_fan_taunts() -> 0 ->> 'cardId' <> 'turtle' then
    raise exception 'Old received cards disappeared after catalog update.';
  end if;

  perform set_config('request.jwt.claim.sub', older_fan::text, true);
  receipt := public.send_fan_taunt('turtle', 'default', old_request);
  if receipt -> 'taunt' ->> 'id' is distinct from old_message::text or receipt ->> 'points' <> '0' then
    raise exception 'An in-flight legacy retry did not retain its original message %.', receipt;
  end if;

  perform set_config('request.jwt.claim.sub', lg_fan::text, true);
  receipt := public.get_fan_card_collection();
  if receipt -> 'ownedCardIds' <> '["lg1","lg4"]'::jsonb or receipt ->> 'points' <> '450' then
    raise exception 'LG starter collection is wrong %.', receipt;
  end if;
  begin
    perform public.buy_fan_card('ds2', single_request);
    raise exception 'Purchased a card from the opposing team.' using errcode = 'ZX001';
  exception when sqlstate 'P0001' then
    get stacked diagnostics rejected = pg_exception_detail;
    if rejected <> 'invalid_selection' then raise; end if;
  end;
  begin
    perform public.send_fan_taunt('lg2', 'default', send_request);
    raise exception 'Sent an unowned card.' using errcode = 'ZX001';
  exception when sqlstate 'P0001' then
    get stacked diagnostics rejected = pg_exception_detail;
    if rejected <> 'card_not_owned' then raise; end if;
  end;
  begin
    perform public.send_fan_taunt('ds1', 'default', send_request);
    raise exception 'Sent from the other team''s catalog.' using errcode = 'ZX001';
  exception when sqlstate 'P0001' then
    get stacked diagnostics rejected = pg_exception_detail;
    if rejected <> 'invalid_selection' then raise; end if;
  end;
  begin
    perform public.send_fan_taunt('turtle', 'default', send_request);
    raise exception 'Sent a legacy card on a new request.' using errcode = 'ZX001';
  exception when sqlstate 'P0001' then
    get stacked diagnostics rejected = pg_exception_detail;
    if rejected <> 'invalid_selection' then raise; end if;
  end;

  receipt := public.buy_fan_card('lg2', single_request);
  if receipt ->> 'charged' <> '100' or receipt ->> 'points' <> '350'
    or receipt -> 'ownedCardIds' <> '["lg1","lg2","lg4"]'::jsonb then
    raise exception 'Individual purchase receipt is wrong %.', receipt;
  end if;
  if public.buy_fan_card('lg2', single_request) is distinct from receipt then
    raise exception 'Identical purchase retry did not return the original charge.';
  end if;
  if public.buy_fan_card('lg2', gen_random_uuid()) ->> 'charged' is distinct from '0' then
    raise exception 'An unlocked individual card was charged.';
  end if;
  begin
    perform public.buy_fan_card_pack(single_request);
    raise exception 'Accepted the same key for a different purchase.' using errcode = 'ZX001';
  exception when sqlstate 'P0001' then
    get stacked diagnostics rejected = pg_exception_detail;
    if rejected <> 'request_conflict' then raise; end if;
  end;
  receipt := public.buy_fan_card_pack(pack_request);
  if receipt ->> 'charged' <> '200' or receipt ->> 'points' <> '150'
    or receipt -> 'ownedCardIds' <> '["lg1","lg2","lg3","lg4","lg5","lg6"]'::jsonb then
    raise exception 'Pack charged for previously owned cards %.', receipt;
  end if;
  if public.buy_fan_card_pack(pack_request) is distinct from receipt then
    raise exception 'Pack charged twice on retry.';
  end if;
  if public.buy_fan_card_pack(gen_random_uuid()) ->> 'charged' <> '0' then
    raise exception 'A complete collection was charged.';
  end if;
  if public.buy_fan_card('lg1', gen_random_uuid()) ->> 'charged' <> '0' then
    raise exception 'The starter card was charged.';
  end if;
  receipt := public.send_fan_taunt('lg2', 'default', send_request);
  sent_message := (receipt -> 'taunt' ->> 'id')::uuid;
  if sent_message is null or receipt ->> 'points' <> '50' or receipt -> 'taunt' ->> 'cardId' <> 'lg2' then
    raise exception 'Purchased card could not be sent at the standard cost %.', receipt;
  end if;
  if public.send_fan_taunt('lg2', 'default', send_request) is distinct from receipt then
    raise exception 'Same delivery request was charged twice.';
  end if;
  perform set_config('request.jwt.claim.sub', doosan_fan::text, true);
  if public.get_fan_taunt(sent_message) ->> 'cardId' is distinct from 'lg2'
    or public.read_fan_taunt(sent_message) ->> 'readAt' is null
    or public.get_fan_card_collection() -> 'ownedCardIds' <> '["ds1","ds4"]'::jsonb then
    raise exception 'The other team could not read the card, or receiving granted ownership.';
  end if;
  perform set_config('request.jwt.claim.sub', non_fan::text, true);
  if public.get_fan_taunt(sent_message) is not null then
    raise exception 'An unrelated account accessed a private card.';
  end if;

  reset role;
  insert into public.fan_point_predictions (user_id, round, answer, opens_at, closes_at, reveals_at, choice, reward) values
    (lg_fan, 1, 'safe', now() - interval '5 minutes', now() - interval '4 minutes', now() - interval '3 minutes', 'safe', 100),
    (lg_fan, 2, 'safe', now() - interval '3 minutes', now() - interval '2 minutes', now() - interval '1 minute', 'out', 0),
    (lg_fan, 3, 'out', now() - interval '1 minute', now() - interval '30 seconds', now() - interval '20 seconds', null, 0),
    (lg_fan, 4, 'safe', now(), now() + interval '12 seconds', now() + interval '14 seconds', 'safe', null);
  insert into public.fan_taunt_presence (fan_id, active, seen_at) values
    (older_fan, true, clock_timestamp() - interval '4 minutes');
  set local role authenticated;
  perform set_config('request.jwt.claim.sub', lg_fan::text, true);
  if public.get_fan_profile_stats() is distinct from '{"hits":1,"tries":2,"sent":1}'::jsonb then
    raise exception 'Personal counters counted missed or unsettled rounds.';
  end if;
  perform public.fan_taunt_activity(true);
  if public.get_fan_camp_presence() is distinct from '{"lg":1,"doosan":1}'::jsonb then
    raise exception 'Camp presence omitted active fans or included stale fans.';
  end if;
  perform set_config('request.jwt.claim.sub', doosan_fan::text, true);
  if public.get_fan_profile_stats() is distinct from '{"hits":0,"tries":0,"sent":0}'::jsonb then
    raise exception 'Another fan''s counters were exposed.';
  end if;
  perform public.fan_taunt_activity(false);
  if public.get_fan_camp_presence() is distinct from '{"lg":1,"doosan":0}'::jsonb then
    raise exception 'Camp presence included a hidden fan.';
  end if;
  reset role;
  insert into public.fan_character_card_ownership (fan_id, card_id) values
    (doosan_fan, 'ds2'), (doosan_fan, 'ds3'), (doosan_fan, 'ds5');
  set local role authenticated;
  receipt := public.buy_fan_card_pack(pack_request);
  if receipt ->> 'charged' is distinct from '0' or receipt ->> 'points' is distinct from '0'
    or receipt -> 'ownedCardIds' is distinct from '["ds1","ds2","ds3","ds4","ds5","ds6"]'::jsonb then
    raise exception 'The final locked card did not honor the pack discount %.', receipt;
  end if;
end;
$$;

rollback;
