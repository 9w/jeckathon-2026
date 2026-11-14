import { clockSeconds } from "./clock.ts";
import type { ReplayGame } from "./types.ts";

export function makeSharedReplay(game: ReplayGame) {
  const start = clockSeconds(game.startedAt);
  const end = clockSeconds(game.endedAt);
  if (start === null || end === null || start >= end) throw new Error("경기 시작·종료 시각을 확인해 주세요.");

  let previousEnd = start;
  let previousStart = start - 1;
  const rounds = [];
  for (const appearance of game.appearances) {
    const first = appearance.firstPitchTime && clockSeconds(appearance.firstPitchTime);
    const result = appearance.resultTime && clockSeconds(appearance.resultTime);
    if (typeof first !== "number" || typeof result !== "number") continue;
    if (first < previousEnd || first <= previousStart || result < first || result > end) {
      throw new Error("타석 시작·결과 시각의 순서를 확인해 주세요.");
    }
    previousStart = first;
    previousEnd = result;

    const closing = Math.min(first + 12, result - 1);
    rounds.push({
      id: appearance.id,
      inning: appearance.inning,
      half: appearance.half,
      batter: appearance.batter,
      open_second: first - start,
      close_second: appearance.choice !== null && closing > first ? closing - start : null,
      reveal_second: result - start,
      result: appearance.result,
      vote_answer: appearance.choice,
    });
  }
  if (!rounds.some((round) => round.close_second !== null)) throw new Error("투표 가능한 타석이 없습니다.");
  return { id: game.gameId, played_on: game.date, away: game.awayTeam, home: game.homeTeam, duration_seconds: end - start, rounds };
}
