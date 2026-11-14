begin;

create function public.get_current_replay_room()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select public.get_replay_room((select id from public.replay_rooms where active))
$$;

revoke all on function public.get_current_replay_room() from public, anon, authenticated;
grant execute on function public.get_current_replay_room() to authenticated;

commit;
