import { apiRequest as request } from "@/lib/api-request";
import type { ReceivedTaunt, SentRandomTaunt, SentTaunt, TauntCard, TauntTarget } from "@/lib/taunt-types";

export { ApiRequestError as TauntRequestError } from "@/lib/api-request";

/** 내가 놀릴 수 있는 회원 목록 */
export async function fetchTauntTargets() {
  return (await request<{ targets: TauntTarget[] }>("/api/taunts/targets")).targets;
}

/** 놀리기 카드 목록 (target.team === card.targetTeam 인 카드만 보낼 수 있음) */
export async function fetchTauntCards() {
  return (await request<{ cards: TauntCard[] }>("/api/taunts/cards")).cards;
}

/** 놀리기 전송. 성공 시 남은 포인트를 돌려준다. 실패 code: not_enough_points | cooldown | target_limit | target_inactive | ... */
export function sendTaunt(receiverId: string, cardId: string) {
  return request<SentTaunt>("/api/taunts", {
    method: "POST",
    body: JSON.stringify({ receiverId, cardId }),
  });
}

/** 상대팀 불특정 1명에게 놀리기. 대상은 서버가 고른다. cardId 생략 시 카드도 무작위. 실패 code: no_target | not_enough_points | cooldown | ... */
export function sendRandomTaunt(cardId?: string) {
  return request<SentRandomTaunt>("/api/taunts/random", {
    method: "POST",
    body: JSON.stringify(cardId ? { cardId } : {}),
  });
}

/** 내가 받은 놀림 목록 */
export function fetchReceivedTaunts(unreadOnly = false) {
  return request<{ taunts: ReceivedTaunt[]; unreadCount: number }>(
    `/api/taunts/received${unreadOnly ? "?unread=true" : ""}`,
  );
}

/** 받은 놀림 확인 처리. ids 생략 시 전부 */
export async function markTauntsRead(ids?: string[]) {
  return (
    await request<{ updated: number }>("/api/taunts/received/read", {
      method: "POST",
      body: JSON.stringify(ids ? { ids } : {}),
    })
  ).updated;
}
