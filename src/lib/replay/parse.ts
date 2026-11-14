import type { PlateAppearance, ReplayGame } from "./types";

const gameId = "20260903LGOB0";
const gameDate = "2026-09-03";
const gameRecordUrl = "https://www.koreabaseball.com/Schedule/GameCenter/Main.aspx?gameDate=20260903&gameId=20260903LGOB0&section=REVIEW";
const matchStart = "18:32:01";
const matchEnd = "21:13:06";
const timePattern = /^(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d$/;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isText(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0 && value.length <= 120;
}

function isClockTime(value: unknown): value is string {
  return typeof value === "string" && timePattern.test(value);
}

function isAppearance(value: unknown): value is Omit<PlateAppearance, "resultTime"> & { resultTime?: string | null } {
  if (!isRecord(value)) return false;

  return isText(value.id) && isText(value.batter) && isText(value.result)
    && typeof value.inning === "number" && Number.isInteger(value.inning) && value.inning >= 1 && value.inning <= 20
    && (value.half === "top" || value.half === "bottom")
    && (value.choice === "safe" || value.choice === "out" || value.choice === null)
    && typeof value.pitchCount === "number" && Number.isInteger(value.pitchCount) && value.pitchCount >= 0
    && (value.firstPitchTime === null || isClockTime(value.firstPitchTime))
    && (value.resultTime === undefined || value.resultTime === null || isClockTime(value.resultTime));
}

export function parseReplayGame(value: unknown): ReplayGame | null {
  if (!isRecord(value) || value.gameId !== gameId || value.date !== gameDate
    || value.awayTeam !== "LG" || value.homeTeam !== "두산" || value.sourceUrl !== gameRecordUrl
    || !Array.isArray(value.appearances) || value.appearances.length === 0 || value.appearances.length > 200) return null;

  const startedAt = value.startedAt ?? matchStart;
  const endedAt = value.endedAt ?? matchEnd;
  if (!isClockTime(startedAt) || !isClockTime(endedAt) || startedAt >= endedAt) return null;

  const ids = new Set<string>();
  const appearances: PlateAppearance[] = [];
  let lastHalf = 0;
  let lastTime = startedAt;
  for (const item of value.appearances) {
    if (!isAppearance(item) || ids.has(item.id)) return null;
    const half = item.inning * 2 + Number(item.half === "bottom");
    if (half < lastHalf) return null;
    const firstPitchTime = item.firstPitchTime ?? lastTime;
    if (firstPitchTime < lastTime || firstPitchTime > endedAt) return null;
    if (item.resultTime && (item.resultTime < firstPitchTime || item.resultTime > endedAt)) return null;
    lastHalf = half;
    lastTime = item.resultTime ?? firstPitchTime;
    ids.add(item.id);
    appearances.push({ ...item, resultTime: item.resultTime ?? null });
  }

  return { gameId, date: gameDate, awayTeam: "LG", homeTeam: "두산", sourceUrl: gameRecordUrl, startedAt, endedAt, appearances };
}
