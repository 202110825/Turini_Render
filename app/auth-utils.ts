import { randomBytes, scrypt as scryptCallback, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";

const scrypt = promisify(scryptCallback);

export function normalizeUsername(value: string) {
  return value.trim().toLocaleLowerCase("ko-KR");
}

export function validateUsername(value: string) {
  const username = value.trim();
  if (username.length < 3 || username.length > 20) return "아이디는 3~20자로 입력해 주세요.";
  if (!/^[가-힣a-zA-Z0-9_-]+$/u.test(username)) return "아이디에는 한글, 영문, 숫자, 밑줄, 하이픈만 사용할 수 있어요.";
  return null;
}

export function validatePin(value: string) {
  return /^\d{4}$/.test(value) ? null : "비밀번호는 숫자 4자리로 입력해 주세요.";
}

export async function hashPin(pin: string) {
  const salt = randomBytes(16);
  const derived = (await scrypt(pin, salt, 32)) as Buffer;
  return `scrypt$${salt.toString("hex")}$${derived.toString("hex")}`;
}

export async function verifyPin(pin: string, stored: string) {
  const [algorithm, saltHex, hashHex] = stored.split("$");
  if (algorithm !== "scrypt" || !saltHex || !hashHex) return false;
  const expected = Buffer.from(hashHex, "hex");
  const actual = (await scrypt(pin, Buffer.from(saltHex, "hex"), expected.length)) as Buffer;
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}
