create table public.fan_profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  team text not null check (team in ('lg', 'doosan')),
  nickname text check (
    char_length(nickname) between 2 and 16
    and nickname collate "C" !~ U&'[\0001-\001F\007F-\009F]'
    -- Match the browser's String.trim() whitespace rules.
    and nickname = btrim(
      nickname,
      U&'\0009\000A\000B\000C\000D\0020\00A0\1680\2000\2001\2002\2003\2004\2005\2006\2007\2008\2009\200A\2028\2029\202F\205F\3000\FEFF'
    )
  ),
  points integer not null default 0 check (points >= 0)
);

alter table public.fan_profiles enable row level security;

revoke all on public.fan_profiles from public, anon, authenticated;
grant select, update (nickname) on public.fan_profiles to authenticated;

create policy fan_profiles_select_self on public.fan_profiles
  for select to authenticated
  using (id = (select auth.uid()));

create policy fan_profiles_update_self on public.fan_profiles
  for update to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

create function public.join_fan(p_team text)
returns public.fan_profiles
language plpgsql
security definer
set search_path = ''
as $$
declare
  player_id uuid := auth.uid();
  profile public.fan_profiles;
begin
  if player_id is null then
    raise exception 'A guest session is required.' using errcode = '42501';
  end if;

  if p_team is null or p_team not in ('lg', 'doosan') then
    raise exception 'Invalid team.' using errcode = '22023';
  end if;

  insert into public.fan_profiles (id, team)
    values (player_id, p_team)
    on conflict (id) do nothing
    returning * into profile;

  if not found then
    select * into strict profile
    from public.fan_profiles
    where id = player_id;
  end if;

  return profile;
end;
$$;

revoke all on function public.join_fan(text) from public, anon, authenticated;
grant execute on function public.join_fan(text) to authenticated;

-- The MVP records a single demo vote per guest.
create table public.fan_votes (
  user_id uuid not null references public.fan_profiles (id) on delete cascade,
  round_id text not null check (round_id = 'preview-1'),
  choice text not null check (choice in ('safe', 'out')),
  primary key (user_id, round_id)
);

alter table public.fan_votes enable row level security;

revoke all on public.fan_votes from public, anon, authenticated;
grant select, insert on public.fan_votes to authenticated;

create policy fan_votes_select_self on public.fan_votes
  for select to authenticated
  using (user_id = (select auth.uid()));

create policy fan_votes_insert_self on public.fan_votes
  for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and exists (
      select 1
      from public.fan_profiles
      where id = fan_votes.user_id
    )
  );
