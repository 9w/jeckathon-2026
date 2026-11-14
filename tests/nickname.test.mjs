import assert from "node:assert/strict";
import { test } from "node:test";
import { normalizeNickname } from "../src/lib/nickname.ts";

test("닉네임 앞뒤 공백을 정리하고 2~16글자를 허용한다", () => {
  assert.equal(normalizeNickname("  두산팬  "), "두산팬");
  assert.equal(normalizeNickname("엘지"), "엘지");
  assert.equal(normalizeNickname("가".repeat(16)), "가".repeat(16));
  assert.equal(normalizeNickname("⚾야"), "⚾야");
});

test("비어 있거나 너무 짧거나 긴 닉네임을 거절한다", () => {
  for (const value of [" \t ", "팬", "😀", "가".repeat(17), "팬\n닉", "팬\t닉"]) {
    assert.equal(normalizeNickname(value), null);
  }
});
