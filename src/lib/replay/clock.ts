export function clockSeconds(time: string): number | null {
  const match = /^([01]\d|2[0-3]):([0-5]\d):([0-5]\d)$/.exec(time);
  if (!match) return null;
  return Number(match[1]) * 3600 + Number(match[2]) * 60 + Number(match[3]);
}

export function formatElapsed(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = String(Math.floor(seconds / 60) % 60).padStart(2, "0");
  const remainder = String(seconds % 60).padStart(2, "0");
  return `${hours}:${minutes}:${remainder}`;
}

export function formatClock(seconds: number): string {
  return formatElapsed(seconds).padStart(8, "0");
}

export function appearanceAt(startTimes: number[], seconds: number) {
  return Math.max(0, startTimes.findLastIndex((start) => start <= seconds));
}

export function appearanceOffsets(appearances: { firstPitchTime: string | null }[], start: number) {
  const offsets: number[] = [];
  for (const appearance of appearances) {
    const time = appearance.firstPitchTime === null ? null : clockSeconds(appearance.firstPitchTime);
    offsets.push(time === null ? (offsets.at(-1) ?? 0) : time - start);
  }
  return offsets;
}

export function playbackSecond(offset: number, beganAt: number, now: number, duration: number) {
  return Math.min(duration, offset + Math.floor((now - beganAt) / 1000));
}
