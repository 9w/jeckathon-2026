import { createClient } from "@supabase/supabase-js";
import { timingSafeEqual } from "node:crypto";
import { clockSeconds } from "@/lib/replay/clock";
import { parseReplayGame } from "@/lib/replay/parse";
import type { ReplayGame } from "@/lib/replay/types";

const maxBodyBytes = 512 * 1024;

// 투표는 직전 타석 결과부터 이번 타석 첫 투구까지 받고, 결과는 기록된 결과 시각에 공개한다.
function replayRounds(game: ReplayGame, runId: string, startedAtMs: number) {
  const start = clockSeconds(game.startedAt) ?? 0;
  const at = (time: string) => new Date(startedAtMs + ((clockSeconds(time) ?? start) - start) * 1000).toISOString();
  let previous = game.startedAt;
  return game.appearances.map((appearance) => {
    const firstPitch = appearance.firstPitchTime ?? previous;
    const result = appearance.resultTime ?? firstPitch;
    const round = {
      id: `${runId}:${appearance.id}`,
      game_id: game.gameId,
      batter: appearance.batter,
      answer: appearance.choice,
      opens_at: at(previous),
      locks_at: at(firstPitch),
      result_at: at(result),
    };
    previous = result;
    return round;
  });
}

function sameToken(given: string, expected: string) {
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

// 시연 진행자가 리플레이를 시작할 때 한 번 호출한다. 지금부터 경기 기록 시각대로 타석 투표 일정을 서버에 만든다.
// 정답이 들어 있으므로 진행자 토큰과 서버 전용 키로만 쓴다.
export async function POST(request: Request) {
  const adminToken = process.env.REPLAY_ADMIN_TOKEN;
  const secretKey = process.env.SUPABASE_SECRET_KEY;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!adminToken || !secretKey || !url) {
    return Response.json({ error: "리플레이 진행 설정이 없습니다." }, { status: 503 });
  }
  if (!sameToken(request.headers.get("x-replay-admin-token") ?? "", adminToken)) {
    return Response.json({ error: "진행자 토큰이 필요합니다." }, { status: 401 });
  }

  const body = await request.text();
  if (body.length > maxBodyBytes) {
    return Response.json({ error: "리플레이 기록이 너무 큽니다." }, { status: 413 });
  }
  let game;
  try {
    game = parseReplayGame(JSON.parse(body));
  } catch {
    game = null;
  }
  if (!game) {
    return Response.json({ error: "9월 3일 LG·두산전 리플레이 JSON이 필요합니다." }, { status: 400 });
  }

  const startedAt = Date.now();
  const runId = new Date(startedAt).toISOString().replace(/\D/g, "").slice(0, 14);
  const rounds = replayRounds(game, runId, startedAt);
  const supabase = createClient(url, secretKey, { auth: { persistSession: false } });
  const { error } = await supabase.from("prediction_rounds").insert(rounds);
  if (error) {
    return Response.json({ error: "투표 일정을 만들지 못했습니다." }, { status: 500 });
  }

  return Response.json({ runId, gameId: game.gameId, startedAt: new Date(startedAt).toISOString(), rounds: rounds.length });
}
