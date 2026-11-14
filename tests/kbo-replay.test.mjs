import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { test } from "node:test";
import { parseReplayGame } from "../src/lib/replay/parse.ts";

const input = new URL("../.local-replay/lg-doosan-20260903.json", import.meta.url);
const match = existsSync(input) ? JSON.parse(readFileSync(input, "utf8")) : null;
const options = { skip: match ? false : "9월 3일 내부 검증 데이터 없음" };

const sample = {
  gameId: "20260903LGOB0",
  date: "2026-09-03",
  awayTeam: "LG",
  homeTeam: "두산",
  sourceUrl: "https://www.koreabaseball.com/Schedule/GameCenter/Main.aspx?gameDate=20260903&gameId=20260903LGOB0&section=REVIEW",
  startedAt: "18:32:01",
  endedAt: "21:13:06",
  appearances: [
    { id: "test-pa-1", inning: 1, half: "top", batter: "예시 타자", result: "삼진", choice: "out", pitchCount: 4, firstPitchTime: "18:32:07", resultTime: "18:33:39" },
  ],
};

test("검증 파일은 예상한 경기와 타석 형식만 허용한다", () => {
  assert.deepEqual(parseReplayGame(sample), sample);
  assert.equal(parseReplayGame({ ...sample, gameId: "20260426LGOB0" }), null);
  assert.equal(parseReplayGame({ ...sample, sourceUrl: "https://example.com/game" }), null);
  assert.equal(parseReplayGame({ ...sample, appearances: [] }), null);
  assert.equal(parseReplayGame({ ...sample, appearances: [sample.appearances[0], sample.appearances[0]] }), null);
  for (const change of [{ inning: 0 }, { pitchCount: -1 }, { half: "invalid" }, { firstPitchTime: "29:00:00" }, { resultTime: "18:32:06" }, { resultTime: "21:13:07" }]) {
    assert.equal(parseReplayGame({ ...sample, appearances: [{ ...sample.appearances[0], ...change }] }), null);
  }
});

test("기존 파일은 경기 시각을 채우고 결과 시각을 미기록으로 처리한다", () => {
  const legacy = { ...sample, startedAt: undefined, endedAt: undefined, appearances: [{ ...sample.appearances[0], resultTime: undefined }] };
  const parsed = parseReplayGame(legacy);
  assert.equal(parsed.startedAt, sample.startedAt);
  assert.equal(parsed.endedAt, sample.endedAt);
  assert.equal(parsed.appearances[0].resultTime, null);
});

test("9월 3일 LG·두산 경기의 첫 타석과 마지막 타석, 결승 홈런을 포함한다", options, () => {
  assert.deepEqual(parseReplayGame(match), match);
  assert.equal(match.gameId, "20260903LGOB0");
  assert.equal(match.date, "2026-09-03");
  assert.equal(match.awayTeam, "LG");
  assert.equal(match.homeTeam, "두산");
  const { appearances } = match;
  const first = appearances[0];
  assert.deepEqual([first.inning, first.half, first.batter, first.result, first.pitchCount], [1, "top", "신민재", "삼진", 6]);
  assert.equal(first.resultTime, "18:33:39");
  const last = appearances.at(-1);
  assert.deepEqual([last.inning, last.half, last.batter, last.result, last.pitchCount], [9, "bottom", "박지훈", "땅볼 아웃", 6]);
  assert.equal(last.resultTime, "21:13:05");
  const homeRun = appearances.find((pa) => pa.result === "홈런");
  assert.deepEqual([homeRun.inning, homeRun.half, homeRun.batter, homeRun.pitchCount], [4, "top", "오스틴", 8]);
});

test("타석은 경기 순서이며 263구와 중단된 타석을 포함한다", options, () => {
  const ids = new Set();
  let previous = 0;

  for (const appearance of match.appearances) {
    assert.ok(["top", "bottom"].includes(appearance.half));
    assert.ok(["safe", "out", null].includes(appearance.choice));
    const position = appearance.inning * 2 + Number(appearance.half === "bottom");
    assert.ok(position >= previous);
    assert.ok(appearance.batter && appearance.result);
    assert.ok(!ids.has(appearance.id));
    ids.add(appearance.id);
    previous = position;
  }
  const stopped = match.appearances.filter((entry) => entry.choice === null);
  assert.equal(match.appearances.length, 67);
  assert.equal(stopped.length, 1);
  assert.deepEqual([stopped[0].inning, stopped[0].half, stopped[0].batter, stopped[0].pitchCount], [1, "top", "문보경", 2]);
  assert.equal(match.appearances.reduce((sum, entry) => sum + entry.pitchCount, 0), 263);
});
