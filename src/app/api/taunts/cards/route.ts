import { errorResponse } from "@/server/http";
import { supabaseForRequest } from "@/server/supabase";
import { listTauntCards } from "@/server/taunts";

// GET /api/taunts/cards
// 보낼 수 있는 놀리기 카드와 고를 수 있는 문구 목록. 카드의 targetTeam이 null이면 모든 팀에게 보낼 수 있다.
export async function GET(request: Request) {
  try {
    const db = supabaseForRequest(request);
    return Response.json(await listTauntCards(db));
  } catch (error) {
    return errorResponse(error);
  }
}
