import { errorResponse } from "@/server/http";
import { supabaseForRequest } from "@/server/supabase";
import { listReceivedTaunts } from "@/server/taunts";

// GET /api/taunts/received?unread=true
// 내가 받은 놀림 목록(최신순, 최대 50개). unread=true면 아직 확인하지 않은 것만.
export async function GET(request: Request) {
  try {
    const db = supabaseForRequest(request);
    const unreadOnly = new URL(request.url).searchParams.get("unread") === "true";
    const taunts = await listReceivedTaunts(db, unreadOnly);
    return Response.json({ taunts, unreadCount: taunts.filter((t) => !t.readAt).length });
  } catch (error) {
    return errorResponse(error);
  }
}
