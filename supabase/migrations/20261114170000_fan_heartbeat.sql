-- 화면을 보고 있는 팬의 활동 신호. 화면이 보이는 동안 주기적으로 호출한다.
-- 놀리기 대상 선정(last_active_at)에 쓰인다.
create function public.touch_fan()
returns timestamptz
language plpgsql
security definer
set search_path = ''
as $$
declare
  touched_at timestamptz;
begin
  update public.fan_profiles
    set last_active_at = now()
    where id = auth.uid()
    returning last_active_at into touched_at;

  if not found then
    raise exception 'Join a team first.' using errcode = '42501';
  end if;

  return touched_at;
end;
$$;

revoke all on function public.touch_fan() from public, anon, authenticated;
grant execute on function public.touch_fan() to authenticated;
