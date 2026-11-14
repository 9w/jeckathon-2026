import type { ReplayPitch, ScoreboardEvent } from "./types";

export function pitchAt(pitches: Pick<ReplayPitch, "time">[], clock: string) {
  return pitches.findLastIndex(({ time }) => time !== null && time <= clock);
}

export function pitchCursorTime(pitches: Pick<ReplayPitch, "time">[], index: number) {
  for (let previous = index; previous >= 0; previous--) {
    const time = pitches[previous]?.time;
    if (time) return time;
  }
  return null;
}

export function scoreboardAt(events: ScoreboardEvent[], clock: string) {
  return events.findLast(({ time }) => time <= clock);
}
