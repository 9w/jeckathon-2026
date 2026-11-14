import { errorResponse, HttpError, readJson } from "@/server/http";
import { supabaseForRequest } from "@/server/supabase";
import { sendRandomTaunt } from "@/server/taunts";

// POST /api/taunts/random  { cardId? }
// 상대팀 불특정 1명에게 놀리기. 대상은 서버가 무작위로 고른다(최근 3분 활동자 우선).
// cardId를 생략하면 대상 팀용 카드 중 무작위. 카드 비용만큼 포인트가 차감된다.
export async function POST(request: Request) {
  try {
    const db = supabaseForRequest(request);
    const { cardId } = await readJson(request);
    if (cardId !== undefined && (typeof cardId !== "string" || !cardId)) {
      throw new HttpError(400, "invalid_request", "cardId는 문자열이어야 합니다.");
    }
    return Response.json(await sendRandomTaunt(db, (cardId as string | undefined) ?? null), { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}
