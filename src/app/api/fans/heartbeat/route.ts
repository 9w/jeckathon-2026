import { errorResponse } from "@/server/http";
import { touchFan } from "@/server/fans";
import { supabaseForRequest } from "@/server/supabase";

// POST /api/fans/heartbeat
// 화면을 보고 있다는 신호. 마지막 활동 시각을 갱신해 놀리기 대상 목록에 계속 나오게 한다.
export async function POST(request: Request) {
  try {
    const db = supabaseForRequest(request);
    return Response.json({ lastActiveAt: await touchFan(db) });
  } catch (error) {
    return errorResponse(error);
  }
}
