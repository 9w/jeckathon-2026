import { errorResponse, HttpError, readJson } from "@/server/http";
import { claimDemoPoints } from "@/server/fans";
import { supabaseForRequest } from "@/server/supabase";

// POST /api/fans/demo-points  { key, amount }
// 데모용 포인트 지급. 예측 판정을 아직 화면이 하므로 예측 보상(100P)과 데모 충전(300P)을 서버에 기록한다.
// 같은 key로는 한 번만 지급된다(예: "bat:<경기ID>:<타석>"). 해커톤 데모 한정 — 정식 판정이 생기면 제거한다.
export async function POST(request: Request) {
  try {
    const db = supabaseForRequest(request);
    const { key, amount } = await readJson(request);
    if (typeof key !== "string" || !key || key.length > 64 || (amount !== 100 && amount !== 300)) {
      throw new HttpError(400, "invalid_request", "key(1~64자)와 amount(100 또는 300)가 필요합니다.");
    }
    return Response.json({ points: await claimDemoPoints(db, key, amount) });
  } catch (error) {
    return errorResponse(error);
  }
}
