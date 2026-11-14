begin;

create or replace function public.claim_replay_operator(p_code text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  player uuid := auth.uid();
begin
  if player is null or p_code is null or char_length(p_code) not between 5 and 36
    or not exists (select 1 from public.fan_profiles where id = player)
    or not exists (select 1 from public.replay_operator_code where digest = sha256(convert_to(p_code, 'UTF8'))) then
    return false;
  end if;
  insert into public.replay_operators values (player) on conflict do nothing;
  return true;
end;
$$;

commit;
