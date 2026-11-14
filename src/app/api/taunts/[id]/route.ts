import { errorResponse, HttpError, isUuid } from "@/server/http";
import { supabaseForRequest } from "@/server/supabase";
import { getSentTaunt } from "@/server/taunts";

// GET /api/taunts/{id}
// 내가 보낸 놀림을 상대가 확인했는지(readAt). 내가 보내거나 받은 놀림만 조회된다.
export async function GET(request: Request, { params }: RouteContext<"/api/taunts/[id]">) {
  try {
    const db = supabaseForRequest(request);
    const { id } = await params;
    if (!isUuid(id)) throw new HttpError(400, "invalid_request", "id는 uuid여야 합니다.");
    return Response.json(await getSentTaunt(db, id));
  } catch (error) {
    return errorResponse(error);
  }
}
