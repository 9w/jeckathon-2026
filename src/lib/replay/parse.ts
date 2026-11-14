import type { PlateAppearance, ReplayGame } from "./types";

const gameId = "20260903LGOB0";
const gameDate = "2026-09-03";
const gameRecordUrl = "https://www.koreabaseball.com/Schedule/GameCenter/Main.aspx?gameDate=20260903&gameId=20260903LGOB0&section=REVIEW";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isText(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0 && value.length <= 120;
}

function isAppearance(value: unknown): value is PlateAppearance {
  if (!isRecord(value)) return false;

  return isText(value.id) && isText(value.batter) && isText(value.result)
    && typeof value.inning === "number" && Number.isInteger(value.inning) && value.inning >= 1 && value.inning <= 20
    && (value.half === "top" || value.half === "bottom")
    && (value.choice === "safe" || value.choice === "out" || value.choice === null)
    && typeof value.pitchCount === "number" && Number.isInteger(value.pitchCount) && value.pitchCount >= 0
    && (value.firstPitchTime === null || (typeof value.firstPitchTime === "string" && /^(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d$/.test(value.firstPitchTime)));
}

export function parseReplayGame(value: unknown): ReplayGame | null {
  if (!isRecord(value) || value.gameId !== gameId || value.date !== gameDate
    || value.awayTeam !== "LG" || value.homeTeam !== "두산" || value.sourceUrl !== gameRecordUrl
    || !Array.isArray(value.appearances) || value.appearances.length === 0 || value.appearances.length > 200) return null;

  const ids = new Set<string>();
  const appearances: PlateAppearance[] = [];
  let lastHalf = 0;
  for (const item of value.appearances) {
    if (!isAppearance(item) || ids.has(item.id)) return null;
    const half = item.inning * 2 + Number(item.half === "bottom");
    if (half < lastHalf) return null;
    lastHalf = half;
    ids.add(item.id);
    appearances.push(item);
  }

  return { gameId, date: gameDate, awayTeam: "LG", homeTeam: "두산", sourceUrl: gameRecordUrl, appearances };
}
