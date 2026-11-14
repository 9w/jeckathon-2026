# 놀리기(도발) API

상대팀 팬에게 포인트를 써서 사전 제작된 놀리기 카드를 보내고, 내가 받은 놀림을 확인하는 API.
기획: [service-plan.md](service-plan.md) ④ 상대 팬덤 도발, ⑤ 도발 수신 및 반격

## 목차

- [시작하기 전에](#시작하기-전에)
- [인증](#인증)
- [엔드포인트](#엔드포인트)
  - [GET /api/taunts/targets](#get-apitauntstargets) 놀릴 수 있는 회원 목록
  - [GET /api/taunts/cards](#get-apitauntscards) 놀리기 카드 목록
  - [POST /api/taunts](#post-apitaunts) 놀리기 보내기
  - [POST /api/taunts/random](#post-apitauntsrandom) 상대팀 불특정 1명 놀리기
  - [GET /api/taunts/received](#get-apitauntsreceived) 받은 놀림 목록
  - [POST /api/taunts/received/read](#post-apitauntsreceivedread) 받은 놀림 확인 처리
  - [POST /api/fans/heartbeat](#post-apifansheartbeat) 활동 신호
- [오류](#오류)
- [규칙](#규칙)
- [프론트에서 사용하기](#프론트에서-사용하기)
- [실시간 수신](#실시간-수신)
- [구조](#구조)

## 시작하기 전에

Supabase 프로젝트에 마이그레이션을 순서대로 적용해야 한다(SQL Editor에서 실행).

1. `supabase/migrations/20261114134000_fan_entry.sql` (기존)
2. `supabase/migrations/20261114150000_taunts.sql`
3. `supabase/migrations/20261114160000_nickname_required_unique.sql`
4. `supabase/migrations/20261114170000_fan_heartbeat.sql`
5. `supabase/migrations/20261114180000_random_taunt.sql`

## 인증

모든 API는 게스트 세션의 액세스 토큰이 필요하다. 응원팀을 고를 때 Supabase 익명 로그인으로 세션이 만들어진다.

```http
Authorization: Bearer <access_token>
```

- 토큰은 `getAccessToken()`(`src/lib/fan-session.ts`)으로 얻는다. [`src/lib/taunt-api.ts`](#프론트에서-사용하기)의 함수를 쓰면 자동으로 붙는다.
- 서버는 이 토큰을 그대로 Supabase에 전달하므로, 권한 판정은 DB의 RLS와 함수(`auth.uid()`)가 한다.
- 응원팀을 고르지 않았으면 `403 forbidden`, 닉네임이 없으면 `403 nickname_required`.

## 엔드포인트

공통: 응답은 JSON, 시각은 ISO 8601(UTC), ID는 UUID.

### GET /api/taunts/targets

내가 놀릴 수 있는 회원 목록.

- 상대팀 팬 중 닉네임이 있고 최근 10분 안에 활동한 사람
- 정렬: 최근 3분 내 활동자 → 최근 5분간 덜 놀림받은 사람 → 최근 활동 순
- 최대 30명
- 호출하면 내 활동 시각도 갱신된다

**응답 200**

```json
{
  "targets": [
    {
      "id": "8c1f3bca-c85a-4c32-baf1-e500315590c7",
      "nickname": "곰잡는쌍둥이",
      "team": "doosan",
      "lastActiveAt": "2026-11-14T06:03:30.188Z",
      "recentTauntCount": 1
    }
  ]
}
```

| 필드 | 타입 | 설명 |
| --- | --- | --- |
| `id` | string | 대상 게스트 ID. 놀리기 보낼 때 `receiverId`로 사용 |
| `nickname` | string | 닉네임 |
| `team` | `"lg"` \| `"doosan"` | 대상 응원팀 |
| `lastActiveAt` | string | 마지막 활동 시각 |
| `recentTauntCount` | number | 최근 5분간 받은 놀림 수 |

### GET /api/taunts/cards

보낼 수 있는 놀리기 카드 목록. 대상의 팀과 카드의 `targetTeam`이 같아야 보낼 수 있다.

**응답 200**

```json
{
  "cards": [
    { "id": "doosan-hibernate", "targetTeam": "doosan", "message": "곰이 아니라 겨울잠 자는 중?", "cost": 100 },
    { "id": "lg-twins-out", "targetTeam": "lg", "message": "오늘은 쌍둥이로 아웃 두 개?", "cost": 100 }
  ]
}
```

현재 카드 (`taunt_cards` 테이블, 마이그레이션에서 시드)

| id | 대상 팀 | 문구 | 비용 |
| --- | --- | --- | --- |
| `lg-twins-out` | lg | 오늘은 쌍둥이로 아웃 두 개? | 100 |
| `lg-jamsil-sigh` | lg | 잠실 하늘에 한숨만 가득하네~ | 100 |
| `lg-bat-nap` | lg | 방망이가 낮잠 자는 중? | 100 |
| `doosan-hibernate` | doosan | 곰이 아니라 겨울잠 자는 중? | 100 |
| `doosan-honey` | doosan | 꿀 대신 삼진만 먹는 곰? | 100 |
| `doosan-teddy` | doosan | 오늘은 곰돌이 인형 모드? | 100 |

카드를 추가·수정하려면 `taunt_cards` 테이블에 행을 넣으면 된다(코드 변경 불필요).

### POST /api/taunts

상대팀 팬에게 놀리기 카드를 보낸다. 카드 비용만큼 내 포인트가 차감된다.

**요청**

```json
{
  "receiverId": "8c1f3bca-c85a-4c32-baf1-e500315590c7",
  "cardId": "doosan-hibernate"
}
```

| 필드 | 타입 | 필수 | 설명 |
| --- | --- | --- | --- |
| `receiverId` | string (UUID) | O | 대상 게스트 ID (`/api/taunts/targets`의 `id`) |
| `cardId` | string | O | 카드 ID (`/api/taunts/cards`의 `id`) |

**응답 201**

```json
{
  "id": "6d1f453d-d1ab-4ab5-b007-723ec10e6567",
  "remainingPoints": 200,
  "createdAt": "2026-11-14T06:03:30.182Z"
}
```

| 필드 | 타입 | 설명 |
| --- | --- | --- |
| `id` | string | 보낸 놀림 ID |
| `remainingPoints` | number | 차감 후 내 포인트. 화면의 포인트 표시를 이 값으로 갱신 |
| `createdAt` | string | 보낸 시각 |

**주요 실패**

| 상황 | HTTP | code |
| --- | --- | --- |
| 포인트 부족 | 402 | `not_enough_points` |
| 10초 안에 다시 보냄 / 같은 대상에게 60초 안에 다시 보냄 | 429 | `cooldown` |
| 대상이 1분 안에 이미 3개 받음 | 429 | `target_limit` |
| 대상이 10분 넘게 활동 없음 | 409 | `target_inactive` |
| 같은 팀, 대상 팀과 맞지 않는 카드, 없는 카드 | 400 | `invalid_request` |
| 대상이 없거나 닉네임 없음 | 404 | `target_not_found` |

실패하면 포인트는 차감되지 않는다.

### POST /api/taunts/random

대상을 고르지 않고 상대팀 불특정 1명에게 놀리기를 보낸다. 대상은 서버가 무작위로 고른다(브라우저가 고르면 특정인을 노리도록 조작할 수 있으므로). 카드 비용만큼 포인트가 차감된다.

대상 선정

- 후보: 상대팀, 닉네임 있음, 최근 10분 내 활동
- 제외: 1분 수신 한도(3개)에 도달한 사람, 내가 60초 안에 놀린 사람
- 최근 3분 내 활동자가 있으면 그중에서, 없으면 10분 내 활동자 중에서 무작위

**요청**

```json
{ "cardId": "doosan-hibernate" }
```

| 필드 | 타입 | 필수 | 설명 |
| --- | --- | --- | --- |
| `cardId` | string | X | 보낼 카드. 생략하면(`{}`) 상대팀용 카드 중 무작위 |

**응답 201**

```json
{
  "id": "92004264-b9a9-4a3c-8d76-4cb9fb89a12b",
  "remainingPoints": 900,
  "createdAt": "2026-11-14T06:21:45.211Z",
  "receiver": { "id": "b658f01f-a5f1-4502-a084-2efc3fe6d014", "nickname": "곰잡는쌍둥이", "team": "doosan" },
  "card": { "id": "doosan-teddy", "message": "오늘은 곰돌이 인형 모드?" }
}
```

| 필드 | 타입 | 설명 |
| --- | --- | --- |
| `id`, `remainingPoints`, `createdAt` | | [POST /api/taunts](#post-apitaunts)와 같음 |
| `receiver` | object | 서버가 고른 대상의 ID·닉네임·팀. "OOO님에게 보냈어요" 연출에 사용 |
| `card` | object | 보낸 카드 ID·문구. 카드를 생략했을 때 무엇이 나갔는지 확인 |

**주요 실패**: 놀릴 수 있는 상대팀 팬이 없으면 `404 no_target`. 그 밖의 실패(`not_enough_points`, `cooldown`, `invalid_request` 등)는 [POST /api/taunts](#post-apitaunts)와 같다. 실패하면 포인트는 차감되지 않는다.

### GET /api/taunts/received

내가 받은 놀림 목록. 최신순, 최대 50개. 호출하면 내 활동 시각도 갱신된다.

**쿼리**

| 이름 | 값 | 설명 |
| --- | --- | --- |
| `unread` | `true` | 아직 확인하지 않은 것만 |

**응답 200**

```json
{
  "taunts": [
    {
      "id": "079316f5-67e2-41fa-8012-3e1a8633ff3a",
      "cardId": "doosan-teddy",
      "message": "오늘은 곰돌이 인형 모드?",
      "sender": { "id": "80c19d61-cb0b-4598-bb95-23a6f97e548a", "nickname": "잠실직관러", "team": "lg" },
      "cost": 100,
      "createdAt": "2026-11-14T06:10:59.757Z",
      "readAt": null
    }
  ],
  "unreadCount": 1
}
```

| 필드 | 타입 | 설명 |
| --- | --- | --- |
| `taunts[].id` | string | 놀림 ID. 확인 처리에 사용 |
| `taunts[].cardId` / `message` | string | 카드 ID / 문구 |
| `taunts[].sender` | object | 보낸 사람 ID·닉네임·팀. 반격할 때 `sender.id`를 `receiverId`로 사용 |
| `taunts[].cost` | number | 보낸 사람이 쓴 포인트 |
| `taunts[].createdAt` | string | 받은 시각 |
| `taunts[].readAt` | string \| null | 확인한 시각. 확인 전이면 `null` |
| `unreadCount` | number | 이번 응답에 포함된 것 중 확인하지 않은 개수 |

### POST /api/taunts/received/read

받은 놀림을 확인 처리한다.

**요청**

```json
{ "ids": ["079316f5-67e2-41fa-8012-3e1a8633ff3a"] }
```

| 필드 | 타입 | 필수 | 설명 |
| --- | --- | --- | --- |
| `ids` | string[] (UUID) | X | 확인 처리할 놀림 ID. 생략하면(`{}`) 받은 놀림 전부 |

**응답 200**

```json
{ "updated": 1 }
```

`updated`는 이번에 새로 확인 처리된 개수. 이미 확인했거나 내가 받은 게 아닌 ID는 무시된다.

### POST /api/fans/heartbeat

화면을 보고 있다는 신호. 내 마지막 활동 시각(`last_active_at`)을 지금으로 갱신한다.
투표를 하지 않고 화면만 보고 있는 팬도 놀리기 대상 목록에 계속 나오게 하려면, 화면이 보이는 동안 1분마다 호출한다.

요청 본문 없음.

**응답 200**

```json
{ "lastActiveAt": "2026-11-14T06:15:39.250Z" }
```

응원팀을 고르기 전이면 `403 forbidden`. 직접 호출하기보다 [`startHeartbeat()`](#활동-신호-보내기)를 쓴다.

## 오류

오류 응답 형식

```json
{ "error": { "code": "not_enough_points", "message": "포인트가 부족합니다." } }
```

`message`는 사용자에게 그대로 보여줄 수 있는 한국어 문장이다. 분기 처리는 `code`로 한다.

| code | HTTP | 의미 |
| --- | --- | --- |
| `invalid_request` | 400 | 요청 형식 오류, 같은 팀, 잘못된 카드 |
| `unauthorized` | 401 | 토큰 없음 또는 만료 |
| `not_enough_points` | 402 | 포인트 부족 |
| `forbidden` | 403 | 응원팀 미선택 |
| `nickname_required` | 403 | 닉네임 미설정 |
| `target_not_found` | 404 | 대상 없음 |
| `no_target` | 404 | 무작위 놀리기에서 놀릴 수 있는 상대팀 팬 없음 |
| `target_inactive` | 409 | 대상이 최근 활동 없음 |
| `cooldown` | 429 | 쿨타임 중 |
| `target_limit` | 429 | 대상의 수신 한도 초과 |
| `internal_error` | 500 | 그 밖의 서버 오류 |
| `supabase_not_configured` | 503 | 서버에 Supabase 설정 없음 |

## 규칙

모든 검사와 포인트 차감은 DB 함수 `send_taunt` 한 트랜잭션에서 처리한다. 브라우저에서 조작해도 우회할 수 없다.

| 항목 | 값 | 위치 |
| --- | --- | --- |
| 카드 비용 | 카드별 `cost` (현재 모두 100P) | `taunt_cards.cost` |
| 대상 | 상대팀, 닉네임 있음, 최근 10분 내 활동 | `list_taunt_targets`, `send_taunt` |
| 보내는 쿨타임 | 10초 | `send_taunt` |
| 같은 대상 쿨타임 | 60초 | `send_taunt` |
| 받는 한도 | 1명당 1분에 3개 | `send_taunt` |
| 활동 시각 갱신 | 입장, 투표, heartbeat, 대상 목록 조회, 놀리기 전송, 받은 놀림 조회 | `fan_profiles.last_active_at` |

닉네임 규칙 (`20261114160000_nickname_required_unique.sql`)

- 닉네임은 중복될 수 없다(대소문자 무시). 중복이면 DB 오류 `23505`
- 닉네임이 없으면 놀리기를 쓸 수 없고 대상 목록에도 나오지 않는다
- 한번 정한 닉네임은 바꿀 수 있지만 비울 수 없다
- 팀과 닉네임을 한 번에 받는 입장 RPC `join_fan(p_team, p_nickname)`이 있다. 기존 `join_fan(p_team)`도 동작한다

## 프론트에서 사용하기

`src/lib/taunt-api.ts`, `src/lib/fan-heartbeat.ts`의 함수를 쓰면 토큰 첨부와 오류 변환을 대신 해준다. 실패하면 `TauntRequestError`(= `ApiRequestError`, `status`·`code`·`message`)를 던진다. 타입은 `src/lib/taunt-types.ts`.

| 함수 | API |
| --- | --- |
| `fetchTauntTargets()` | `GET /api/taunts/targets` |
| `fetchTauntCards()` | `GET /api/taunts/cards` |
| `sendTaunt(receiverId, cardId)` | `POST /api/taunts` |
| `sendRandomTaunt(cardId?)` | `POST /api/taunts/random` |
| `fetchReceivedTaunts(unreadOnly?)` | `GET /api/taunts/received` |
| `markTauntsRead(ids?)` | `POST /api/taunts/received/read` |
| `sendHeartbeat()` / `startHeartbeat(options?)` | `POST /api/fans/heartbeat` |

```ts
import { fetchTauntCards, fetchTauntTargets, sendTaunt, TauntRequestError } from "@/lib/taunt-api";

const [targets, cards] = await Promise.all([fetchTauntTargets(), fetchTauntCards()]);
const target = targets[0];
const card = cards.find((c) => c.targetTeam === target.team);

try {
  const { remainingPoints } = await sendTaunt(target.id, card!.id);
  setProfile((p) => p && { ...p, points: remainingPoints });
} catch (error) {
  if (error instanceof TauntRequestError && error.code === "not_enough_points") {
    // 예측을 맞혀 포인트를 모으라고 안내
  }
  showToast(error instanceof Error ? error.message : "놀리기에 실패했습니다.");
}
```

받은 놀림 확인

```ts
import { fetchReceivedTaunts, markTauntsRead } from "@/lib/taunt-api";

const { taunts, unreadCount } = await fetchReceivedTaunts(true);
// 화면에 연출한 뒤
await markTauntsRead(taunts.map((t) => t.id));
```

### 활동 신호 보내기

입장한 뒤(프로필이 생긴 뒤) `startHeartbeat()`를 시작한다. 반환값을 호출하면 멈춘다.

- 시작할 때, 그리고 탭·앱이 다시 보일 때 즉시 1회 전송
- 화면이 보이는 동안 1분마다 전송, 숨겨져 있으면 보내지 않음
- 실패해도 화면 동작에는 영향 없음(`onError`로 받을 수 있음)

```tsx
import { startHeartbeat } from "@/lib/fan-heartbeat";

useEffect(() => (profile ? startHeartbeat() : undefined), [profile?.id]);
```

## 실시간 수신

받은 놀림을 바로 띄우려면 Supabase Realtime으로 `taunts` 테이블의 INSERT를 구독한다. RLS 때문에 내가 보내거나 받은 행만 전달된다. 이벤트에는 ID만 있으므로 문구·보낸 사람은 `fetchReceivedTaunts(true)`로 가져온다.

```ts
const channel = supabase
  .channel("my-taunts")
  .on(
    "postgres_changes",
    { event: "INSERT", schema: "public", table: "taunts", filter: `receiver_id=eq.${profile.id}` },
    async () => {
      const { taunts } = await fetchReceivedTaunts(true);
      // 놀림 연출
    },
  )
  .subscribe();

// 정리: supabase.removeChannel(channel)
```

> `fan-session.ts`의 Supabase 클라이언트는 아직 외부에 공개돼 있지 않다. 실시간 구독을 붙일 때 클라이언트를 export 하거나 구독 함수를 `fan-session.ts`에 추가한다.

## 구조

```
src/
├─ app/api/taunts/
│  ├─ route.ts                 POST   /api/taunts
│  ├─ random/route.ts          POST   /api/taunts/random
│  ├─ targets/route.ts         GET    /api/taunts/targets
│  ├─ cards/route.ts           GET    /api/taunts/cards
│  └─ received/
│     ├─ route.ts              GET    /api/taunts/received
│     └─ read/route.ts         POST   /api/taunts/received/read
├─ app/api/fans/heartbeat/
│  └─ route.ts                 POST   /api/fans/heartbeat
├─ server/                     서버 전용
│  ├─ supabase.ts              요청자 토큰으로 Supabase 클라이언트 생성
│  ├─ http.ts                  DB 오류 코드 → HTTP 응답 변환
│  ├─ taunts.ts                RPC 호출 + 응답 변환(snake_case → camelCase)
│  └─ fans.ts                  활동 시각 갱신
└─ lib/
   ├─ api-request.ts           토큰 첨부·오류 변환 공용 fetch
   ├─ taunt-api.ts             놀리기 클라이언트 함수
   ├─ fan-heartbeat.ts         활동 신호 클라이언트 함수
   └─ taunt-types.ts           공용 타입

supabase/migrations/
├─ 20261114150000_taunts.sql                     테이블·RPC·Realtime
├─ 20261114160000_nickname_required_unique.sql   닉네임 중복 금지·필수
├─ 20261114170000_fan_heartbeat.sql              활동 신호 RPC
└─ 20261114180000_random_taunt.sql               불특정 1명 놀리기 RPC
```

DB 객체

| 이름 | 종류 | 설명 |
| --- | --- | --- |
| `taunt_cards` | 테이블 | 카드 목록. 로그인 사용자 조회 가능 |
| `taunts` | 테이블 | 보낸 놀림. 본인이 보내거나 받은 것만 조회, 직접 쓰기 불가 |
| `fan_profiles.last_active_at` | 컬럼 | 마지막 활동 시각 |
| `list_taunt_targets()` | RPC | 대상 목록 |
| `send_taunt(p_receiver_id, p_card_id)` | RPC | 놀리기 전송·포인트 차감 |
| `send_random_taunt(p_card_id)` | RPC | 대상 무작위 선정 후 `send_taunt` 호출 |
| `list_received_taunts(p_unread_only, p_limit)` | RPC | 받은 놀림 목록 |
| `mark_taunts_read(p_ids)` | RPC | 확인 처리 |
| `touch_fan()` | RPC | 활동 시각 갱신(heartbeat) |

DB 함수 오류 코드: `JK001` 포인트 부족, `JK002` 쿨타임, `JK003` 수신 한도, `JK004` 대상 비활성, `JK005` 닉네임 미설정, `JK006` 무작위 대상 없음 (`src/server/http.ts`에서 HTTP로 변환)
