import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { test } from "node:test";
import { pitchAt, pitchCursorTime, scoreboardAt } from "../src/lib/replay/pitches.ts";

const pitches = [{ time: "19:11:45" }, { time: null }, { time: "19:12:49" }];

test("경기 시계는 시각이 있는 투구를 선택하고, 시각 없는 투구는 이전 시각에서 직접 확인한다", () => {
  assert.equal(pitchAt(pitches, "19:11:44"), -1);
  assert.equal(pitchAt(pitches, "19:12:48"), 0);
  assert.equal(pitchAt(pitches, "19:12:49"), 2);
  assert.equal(pitchCursorTime(pitches, 1), "19:11:45");
});

const fixture = new URL("../.local-replay/lg-doosan-20260903.json", import.meta.url);

test("9월 3일 전광판의 득점 시점과 263구 및 보정 투구를 검증한다", { skip: !existsSync(fixture) }, () => {
  const game = JSON.parse(readFileSync(fixture, "utf8"));
  const recorded = game.appearances.flatMap((appearance) => appearance.pitches);
  assert.equal(recorded.length, 263);
  assert.equal(recorded.filter((pitch) => pitch.time === null).length, 2);
  assert.equal(recorded[0].pitcher, "곽빈");
  const [before, after, nextHalf] = ["19:27:31", "19:27:32", "19:32:11"].map((clock) => scoreboardAt(game.scoreboard, clock));
  assert.deepEqual([before.away, before.home, before.inning, before.half, before.outs], [0, 0, 4, "top", 1]);
  assert.deepEqual([after.away, after.home], [1, 0]);
  assert.deepEqual([nextHalf.away, nextHalf.home, nextHalf.inning, nextHalf.half, nextHalf.outs], [1, 0, 4, "bottom", 0]);
  const jung = game.appearances.find((appearance) => appearance.inning === 3 && appearance.half === "bottom" && appearance.batter === "정수빈");
  assert.deepEqual(jung.pitches[3], { time: null, pitcher: "박시원", outcome: "ball", balls: 2, strikes: 2 });
  assert.deepEqual([jung.pitches[4].balls, jung.pitches[4].strikes], [2, 3]);
});
