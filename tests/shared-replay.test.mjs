import assert from "node:assert/strict";
import { test } from "node:test";
import { makeSharedReplay } from "../src/lib/replay/shared-import.mts";

const game = {
  gameId: "test-game", date: "2026-09-03", awayTeam: "LG", homeTeam: "두산",
  startedAt: "18:32:01", endedAt: "18:33:01",
  appearances: [
    { id: "one", inning: 1, half: "top", batter: "테스트 타자 1", firstPitchTime: "18:32:07", resultTime: "18:32:27", choice: "safe", result: "안타" },
    { id: "two", inning: 1, half: "top", batter: "테스트 타자 2", firstPitchTime: "18:32:31", resultTime: "18:32:34", choice: "out", result: "삼진" },
    { id: "three", inning: 1, half: "top", batter: "테스트 타자 3", firstPitchTime: "18:32:50", resultTime: "18:32:55", choice: null, result: "타석 중단" },
  ],
};

test("첫 투구 기준 12초 동안 열고 빠른 결과는 공개 직전 마감한다", () => {
  const { duration_seconds, rounds } = makeSharedReplay(game);
  assert.equal(duration_seconds, 60);
  assert.deepEqual(rounds.map(({ open_second, close_second, reveal_second }) =>
    [open_second, close_second, reveal_second]), [[6, 18, 26], [30, 32, 33], [49, null, 54]]);
});

test("시각을 알 수 없는 타석은 건너뛰고 같은 초에 결과가 나온 타석은 관전만 허용한다", () => {
  const [atBat] = game.appearances;
  const { rounds } = makeSharedReplay({ ...game, appearances: [
    { ...atBat, firstPitchTime: null },
    { ...atBat, id: "instant", resultTime: atBat.firstPitchTime },
    game.appearances[1],
  ] });
  assert.deepEqual(rounds.map(({ id, close_second }) => [id, close_second]), [["instant", null], ["two", 32]]);
});

test("시각 순서가 틀리거나 투표 가능한 타석이 전혀 없으면 등록을 거절한다", () => {
  assert.throws(() => makeSharedReplay({ ...game, appearances: [game.appearances[1], game.appearances[0]] }), /순서/);
  assert.throws(() => makeSharedReplay({ ...game, appearances: [game.appearances[2]] }), /투표 가능한/);
});
