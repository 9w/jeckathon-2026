import { errorResponse } from "@/server/http";
import { supabaseForRequest } from "@/server/supabase";
import { listTauntTargets } from "@/server/taunts";

// GET /api/taunts/targets
// 내가 놀릴 수 있는 회원 목록: 상대팀 + 최근 10분 내 활동.
// 최근 3분 활동자 → 최근 덜 놀림받은 순으로 정렬, 최대 30명.
export async function GET(request: Request) {
  try {
    const db = supabaseForRequest(request);
    return Response.json({ targets: await listTauntTargets(db) });
  } catch (error) {
    return errorResponse(error);
  }
}
