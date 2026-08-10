import assert from "node:assert/strict";
import test from "node:test";

import {
  hashPin,
  normalizeUsername,
  validatePin,
  validateUsername,
  verifyPin,
} from "../app/auth-utils.ts";

test("아이디는 공백과 영문 대소문자를 정규화한다", () => {
  assert.equal(normalizeUsername("  Turini_User  "), "turini_user");
  assert.equal(normalizeUsername("가영-01"), "가영-01");
});

test("아이디와 숫자 비밀번호 4자리 형식을 검사한다", () => {
  assert.equal(validateUsername("가영_01"), null);
  assert.match(validateUsername("ab"), /3~20자/);
  assert.match(validateUsername("user name"), /한글, 영문, 숫자/);
  assert.equal(validatePin("0427"), null);
  assert.match(validatePin("12345"), /숫자 4자리/);
  assert.match(validatePin("12a4"), /숫자 4자리/);
});

test("비밀번호 원문 대신 scrypt 해시를 저장하고 검증한다", async () => {
  const stored = await hashPin("0427");
  assert.equal(stored.includes("0427"), false);
  assert.equal(await verifyPin("0427", stored), true);
  assert.equal(await verifyPin("0428", stored), false);
});
