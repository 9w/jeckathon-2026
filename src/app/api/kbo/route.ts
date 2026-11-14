import {
  getBoxScore,
  getGameResult,
  getGames,
  getGameState,
  getGroundState,
  getLiveText,
  getScoreboard,
  parseLiveTextHtml,
  toDateString,
} from "@/lib/kbo";

// KBO 사이트는 CORS를 막고 Origin/Referer 헤더가 필요해서 브라우저에서 직접 호출할 수 없다.
// 이 Route Handler가 서버에서 대신 호출한다.
//   GET /api/kbo?fn=games&date=YYYYMMDD   (date 생략 시 KST 오늘)
//   GET /api/kbo?fn=state|scoreboard|ground|result|livetext|boxscore&gameId=20260412SKLG0

const handlers: Record<string, (p: URLSearchParams) => Promise<unknown>> = {
  games: (p) => getGames(p.get("date") || toDateString(new Date())),
  state: (p) => getGameState(gameId(p)),
  scoreboard: (p) => getScoreboard(gameId(p)),
  ground: (p) => getGroundState(gameId(p)),
  result: (p) => getGameResult(gameId(p)),
  livetext: async (p) => parseLiveTextHtml(await getLiveText(gameId(p))),
  boxscore: (p) => getBoxScore(gameId(p)),
};

function gameId(p: URLSearchParams): string {
  const id = p.get("gameId");
  if (!id || !/^\d{8}[A-Z]{4}\d$/.test(id)) {
    throw new BadRequest("gameId 형식이 잘못됐습니다 (예: 20260412SKLG0)");
  }
  return id;
}

class BadRequest extends Error {}

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const fn = params.get("fn") ?? "";
  const handler = handlers[fn];
  if (!handler) {
    return Response.json(
      { error: `fn은 ${Object.keys(handlers).join(", ")} 중 하나여야 합니다` },
      { status: 400 },
    );
  }

  const started = Date.now();
  try {
    const data = await handler(params);
    return Response.json({ data, ms: Date.now() - started });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return Response.json(
      { error: message, ms: Date.now() - started },
      { status: e instanceof BadRequest ? 400 : 502 },
    );
  }
}
