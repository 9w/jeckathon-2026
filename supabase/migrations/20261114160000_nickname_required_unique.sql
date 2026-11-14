-- 닉네임 중복 금지(대소문자 무시) + 닉네임 입력 입장 함수.
-- 기존 화면(팀 선택 후 닉네임 설정)이 깨지지 않도록 컬럼은 nullable로 두고,
-- 놀리기 기능에서 닉네임을 필수로 검사한다(20261114150000_taunts.sql).

-- 기존 중복은 첫 번째만 남기고 뒤에 ID 일부를 붙인다 (최대 16자)
with ranked as (
  select id, row_number() over (partition by lower(nickname) order by id) as rn
  from public.fan_profiles
  where nickname is not null
)
update public.fan_profiles p
  set nickname = left(p.nickname, 11) || '#' || left(p.id::text, 4)
  from ranked r
  where r.id = p.id and r.rn > 1;

-- 중복이면 insert/update가 23505(unique_violation)로 실패한다.
create unique index fan_profiles_nickname_key
  on public.fan_profiles (lower(nickname))
  where nickname is not null;

-- 한번 정한 닉네임은 비울 수 없다(변경은 가능).
create function public.keep_fan_nickname()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.nickname is null and old.nickname is not null then
    raise exception 'Nickname is required.' using errcode = 'JK005';
  end if;
  return new;
end;
$$;

revoke all on function public.keep_fan_nickname() from public, anon, authenticated;

create trigger fan_profiles_keep_nickname
  before update of nickname on public.fan_profiles
  for each row execute function public.keep_fan_nickname();

-- 팀과 닉네임을 함께 받아 입장한다. 기존 join_fan(p_team)은 그대로 유지.
-- 이미 프로필이 있으면 기존 프로필을 그대로 돌려준다.
create function public.join_fan(p_team text, p_nickname text)
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

  select * into profile from public.fan_profiles where id = player_id;
  if found then
    return profile;
  end if;

  if p_team is null or p_team not in ('lg', 'doosan') then
    raise exception 'Invalid team.' using errcode = '22023';
  end if;

  if p_nickname is null then
    raise exception 'Nickname is required.' using errcode = 'JK005';
  end if;

  -- 길이·공백 규칙은 테이블 check 제약(23514), 중복은 unique 인덱스(23505)가 검사한다.
  insert into public.fan_profiles (id, team, nickname)
    values (player_id, p_team, p_nickname)
    on conflict (id) do nothing
    returning * into profile;

  if not found then
    select * into strict profile from public.fan_profiles where id = player_id;
  end if;

  return profile;
end;
$$;

revoke all on function public.join_fan(text, text) from public, anon, authenticated;
grant execute on function public.join_fan(text, text) to authenticated;
