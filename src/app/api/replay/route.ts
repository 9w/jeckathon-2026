import { readFile } from "node:fs/promises";
import { join } from "node:path";

const replayUnavailable = () =>
  Response.json({ error: "리플레이 경기 기록이 없습니다." }, { status: 404 });

export async function GET() {
  if (process.env.NODE_ENV !== "development") return replayUnavailable();

  try {
    const file = join(process.cwd(), ".local-replay", "lg-doosan-20260903.json");
    const replay = JSON.parse(await readFile(file, "utf8"));
    return Response.json(replay, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") {
      return replayUnavailable();
    }
    return Response.json({ error: "리플레이 경기 기록을 읽지 못했습니다." }, { status: 500 });
  }
}
