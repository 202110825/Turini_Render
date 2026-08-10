import "server-only";

import { createHash, randomBytes, randomUUID } from "node:crypto";
import { cookies } from "next/headers";

import { ensureSchema, getSql } from "./db";

const COOKIE_NAME = "turini_session";
const SESSION_DAYS = 30;

export type AccountUser = {
  id: string;
  username: string;
  pin_hash: string;
  progress: Record<string, unknown>;
  portfolio: Record<string, unknown>;
  failed_attempts: number;
  locked_until: string | null;
};

export { hashPin, normalizeUsername, validatePin, validateUsername, verifyPin } from "../auth-utils";

function tokenHash(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export async function createSession(userId: string) {
  await ensureSchema();
  const sql = getSql();
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000);
  await sql`DELETE FROM turini_sessions WHERE expires_at <= NOW()`;
  await sql`
    INSERT INTO turini_sessions (token_hash, user_id, expires_at)
    VALUES (${tokenHash(token)}, ${userId}, ${expiresAt.toISOString()})
  `;
  const cookieStore = await cookies();
  cookieStore.set(COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
  });
}

export async function clearSession() {
  const cookieStore = await cookies();
  const token = cookieStore.get(COOKIE_NAME)?.value;
  if (token) {
    await ensureSchema();
    const sql = getSql();
    await sql`DELETE FROM turini_sessions WHERE token_hash = ${tokenHash(token)}`;
  }
  cookieStore.delete(COOKIE_NAME);
}

export async function getCurrentUser(): Promise<AccountUser | null> {
  const token = (await cookies()).get(COOKIE_NAME)?.value;
  if (!token) return null;
  await ensureSchema();
  const sql = getSql();
  const rows = await sql`
    SELECT u.id, u.username, u.pin_hash, u.progress, u.portfolio,
           u.failed_attempts, u.locked_until
    FROM turini_sessions s
    JOIN turini_users u ON u.id = s.user_id
    WHERE s.token_hash = ${tokenHash(token)}
      AND s.expires_at > NOW()
    LIMIT 1
  `;
  return (rows[0] as AccountUser | undefined) ?? null;
}

export function publicAccount(user: AccountUser) {
  return {
    account: { username: user.username },
    progress: user.progress || {},
    portfolio: user.portfolio || {},
  };
}

export function newUserId() {
  return randomUUID();
}
