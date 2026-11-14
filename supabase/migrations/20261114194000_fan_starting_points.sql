begin;

-- Keep new joins and balance changes on one side of the one-time credit.
alter table public.fan_profiles alter column points set default 500;

create table if not exists public.fan_starting_point_grant (
  granted boolean primary key check (granted)
);
alter table public.fan_starting_point_grant enable row level security;
revoke all on public.fan_starting_point_grant from public, anon, authenticated, service_role;

do $$
begin
  insert into public.fan_starting_point_grant (granted)
  values (true)
  on conflict do nothing;

  if found then
    update public.fan_profiles set points = points + 500;
  end if;
end;
$$;

commit;
