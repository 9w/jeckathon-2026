import { errorResponse, HttpError, readJson } from "@/server/http";
import { supabaseForRequest } from "@/server/supabase";
import { sendRandomTaunt } from "@/server/taunts";

// POST /api/taunts/random  { cardId?, phraseId? }
// 상대팀 불특정 1명에게 놀리기. 대상은 서버가 무작위로 고른다(최근 3분 활동자 우선).
// cardId를 생략하면 카드도 무작위. 카드 비용만큼 포인트가 차감된다.
export async function POST(request: Request) {
  try {
    const db = supabaseForRequest(request);
    const { cardId, phraseId } = await readJson(request);
    for (const [name, value] of [["cardId", cardId], ["phraseId", phraseId]] as const) {
      if (value !== undefined && (typeof value !== "string" || !value)) {
        throw new HttpError(400, "invalid_request", `${name}는 문자열이어야 합니다.`);
      }
    }
    const result = await sendRandomTaunt(db, (cardId as string | undefined) ?? null, (phraseId as string | undefined) ?? null);
    return Response.json(result, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}
