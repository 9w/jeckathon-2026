import assert from "node:assert/strict";
import { test } from "node:test";
import { appearanceAt, appearanceOffsets, clockSeconds, formatClock, formatElapsed, playbackSecond } from "../src/lib/replay/clock.ts";

test("경기 시각과 경과 시간을 초 단위로 계산한다", () => {
  const start = clockSeconds("18:32:01");
  assert.equal(clockSeconds("21:13:06") - start, 9665);
  assert.equal(formatClock(start + 1), "18:32:02");
  assert.equal(formatElapsed(0), "0:00:00");
  assert.equal(formatElapsed(9665), "2:41:05");
  assert.equal(clockSeconds("24:00:00"), null);
  assert.equal(clockSeconds("18:72:00"), null);
});

test("첫 투구가 기록된 순간부터 다음 타자로 바뀐다", () => {
  const startTimes = [6, 128, 228];
  assert.equal(appearanceAt(startTimes, 0), 0);
  assert.equal(appearanceAt(startTimes, 127), 0);
  assert.equal(appearanceAt(startTimes, 128), 1);
  assert.equal(appearanceAt(startTimes, 9665), 2);
});

test("첫 투구 시각을 경기 시작 기준으로 변환하고 누락 시 직전 위치를 쓴다", () => {
  const appearances = [{ firstPitchTime: "18:32:07" }, { firstPitchTime: null }, { firstPitchTime: "18:34:09" }];
  assert.deepEqual(appearanceOffsets(appearances, clockSeconds("18:32:01")), [6, 6, 128]);
});

test("타이머가 늦게 호출되어도 실제 경과 시간으로 따라잡고 경기 종료에서 멈춘다", () => {
  assert.equal(playbackSecond(120, 4000, 4950, 9665), 120);
  assert.equal(playbackSecond(120, 4000, 7300, 9665), 123);
  assert.equal(playbackSecond(9664, 4000, 10000, 9665), 9665);
});
