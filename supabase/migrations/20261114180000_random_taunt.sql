-- 상대팀 불특정 1명에게 놀리기. 대상은 서버가 무작위로 고른다.
--   후보: 상대팀, 닉네임 있음, 최근 10분 내 활동
--   제외: 1분 수신 한도(3개) 도달, 내가 60초 안에 놀린 사람
--   우선: 최근 3분 내 활동자 중 무작위
-- 카드를 생략하면 대상 팀용 카드 중 무작위. 포인트 차감·쿨타임 검사는 send_taunt가 한다.
-- 오류: JK006 놀릴 수 있는 상대팀 팬 없음 (그 밖은 send_taunt와 동일)
create function public.send_random_taunt(p_card_id text default null)
returns table (
  id uuid,
  points integer,
  created_at timestamptz,
  receiver_id uuid,
  receiver_nickname text,
  receiver_team text,
  card_id text,
  card_message text
)
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  me public.fan_profiles;
  target public.fan_profiles;
  chosen_card_id text := p_card_id;
  sent record;
begin
  select * into me from public.fan_profiles p where p.id = auth.uid();
  if not found then
    raise exception 'Join a team first.' using errcode = '42501';
  end if;

  if me.nickname is null then
    raise exception 'Nickname is required.' using errcode = 'JK005';
  end if;

  -- 대상을 고르기 전에 보내기 쿨타임부터 확인한다(쿨타임인데 '대상 없음'으로 안내되지 않도록).
  if exists (
    select 1 from public.taunts t
    where t.sender_id = me.id and t.created_at > now() - interval '10 seconds'
  ) then
    raise exception 'Taunt cooldown.' using errcode = 'JK002';
  end if;

  select p.* into target
    from public.fan_profiles p
    where p.team <> me.team
      and p.nickname is not null
      and p.last_active_at > now() - interval '10 minutes'
      and (
        select count(*) from public.taunts t
        where t.receiver_id = p.id and t.created_at > now() - interval '1 minute'
      ) < 3
      and not exists (
        select 1 from public.taunts t
        where t.sender_id = me.id
          and t.receiver_id = p.id
          and t.created_at > now() - interval '60 seconds'
      )
    order by p.last_active_at > now() - interval '3 minutes' desc, random()
    limit 1;

  if not found then
    raise exception 'No fans of the other team to taunt.' using errcode = 'JK006';
  end if;

  if chosen_card_id is null then
    select c.id into chosen_card_id
      from public.taunt_cards c
      where c.target_team = target.team
      order by random()
      limit 1;
  end if;

  select * into sent from public.send_taunt(target.id, chosen_card_id);

  return query
    select sent.id, sent.points, sent.created_at, target.id, target.nickname, target.team, c.id, c.message
    from public.taunt_cards c
    where c.id = chosen_card_id;
end;
$$;

revoke all on function public.send_random_taunt(text) from public, anon, authenticated;
grant execute on function public.send_random_taunt(text) to authenticated;
