import { errorResponse } from "@/server/http";
import { supabaseForRequest } from "@/server/supabase";
import { listTauntCards } from "@/server/taunts";

// GET /api/taunts/cards
// 보낼 수 있는 놀리기 카드 목록. 대상 팀(targetTeam)이 맞는 카드만 보낼 수 있다.
export async function GET(request: Request) {
  try {
    const db = supabaseForRequest(request);
    return Response.json({ cards: await listTauntCards(db) });
  } catch (error) {
    return errorResponse(error);
  }
}
