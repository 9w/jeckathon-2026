import type { PlateAppearance, ReplayGame, ReplayPitch, ScoreboardEvent } from "./types";

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

function isIntegerBetween(value: unknown, min: number, max: number): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= min && value <= max;
}

function isPitch(value: unknown): value is ReplayPitch {
  return isRecord(value) && (value.time === null || isClockTime(value.time)) && isText(value.pitcher)
    && (value.outcome === "ball" || value.outcome === "strike" || value.outcome === "foul" || value.outcome === "in-play")
    && isIntegerBetween(value.balls, 0, 4) && isIntegerBetween(value.strikes, 0, 3);
}

function isScoreboardEvent(value: unknown): value is ScoreboardEvent {
  return isRecord(value) && isClockTime(value.time) && isIntegerBetween(value.inning, 1, 20)
    && (value.half === "top" || value.half === "bottom") && isIntegerBetween(value.outs, 0, 3)
    && isIntegerBetween(value.away, 0, 100) && isIntegerBetween(value.home, 0, 100);
}

function isAppearance(value: unknown): value is Omit<PlateAppearance, "resultTime" | "pitches"> & { resultTime?: string | null; pitches?: unknown } {
  if (!isRecord(value)) return false;

  return isText(value.id) && isText(value.batter) && isText(value.result)
    && isIntegerBetween(value.inning, 1, 20)
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
    const { pitches, ...appearance } = item;
    let lastPitchTime = firstPitchTime;
    if (pitches !== undefined) {
      if (!Array.isArray(pitches) || pitches.length !== item.pitchCount || !pitches.every(isPitch)) return null;
      for (const { time } of pitches) {
        if (time === null) continue;
        if (time < lastPitchTime || time > (item.resultTime ?? endedAt)) return null;
        lastPitchTime = time;
      }
    }
    lastHalf = half;
    lastTime = item.resultTime ?? lastPitchTime;
    ids.add(item.id);
    appearances.push({ ...appearance, resultTime: item.resultTime ?? null, ...(pitches === undefined ? {} : { pitches }) });
  }

  const scoreboard = value.scoreboard;
  if (scoreboard !== undefined) {
    if (!Array.isArray(scoreboard) || !scoreboard.length || !scoreboard.every(isScoreboardEvent)) return null;
    let lastEventTime = startedAt;
    for (const { time } of scoreboard) {
      if (time < lastEventTime || time > endedAt) return null;
      lastEventTime = time;
    }
  }

  return {
    gameId, date: gameDate, awayTeam: "LG", homeTeam: "두산", sourceUrl: gameRecordUrl, startedAt, endedAt, appearances,
    ...(scoreboard === undefined ? {} : { scoreboard }),
  };
}
