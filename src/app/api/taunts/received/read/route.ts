import { errorResponse, HttpError, isUuid, readJson } from "@/server/http";
import { supabaseForRequest } from "@/server/supabase";
import { markTauntsRead } from "@/server/taunts";

// POST /api/taunts/received/read  { ids?: string[] }
// 받은 놀림을 확인 처리한다. ids를 생략하면 전부 확인 처리.
export async function POST(request: Request) {
  try {
    const db = supabaseForRequest(request);
    const { ids } = await readJson(request);
    if (ids !== undefined && !(Array.isArray(ids) && ids.every(isUuid))) {
      throw new HttpError(400, "invalid_request", "ids는 uuid 배열이어야 합니다.");
    }
    return Response.json({ updated: await markTauntsRead(db, ids ?? null) });
  } catch (error) {
    return errorResponse(error);
  }
}
