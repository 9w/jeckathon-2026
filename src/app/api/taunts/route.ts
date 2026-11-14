import { errorResponse, HttpError, isUuid, readJson } from "@/server/http";
import { supabaseForRequest } from "@/server/supabase";
import { sendTaunt } from "@/server/taunts";

// POST /api/taunts  { receiverId, cardId, phraseId? }
// 상대팀 팬에게 놀리기 카드를 보낸다. 카드 비용만큼 포인트가 차감된다. phraseId는 /api/taunts/cards의 phrases 중 하나.
export async function POST(request: Request) {
  try {
    const db = supabaseForRequest(request);
    const { receiverId, cardId, phraseId } = await readJson(request);
    if (!isUuid(receiverId) || typeof cardId !== "string" || !cardId) {
      throw new HttpError(400, "invalid_request", "receiverId(uuid)와 cardId가 필요합니다.");
    }
    if (phraseId !== undefined && (typeof phraseId !== "string" || !phraseId)) {
      throw new HttpError(400, "invalid_request", "phraseId는 문자열이어야 합니다.");
    }
    return Response.json(await sendTaunt(db, receiverId, cardId, (phraseId as string | undefined) ?? null), { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}
