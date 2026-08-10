import { databaseErrorResponse, ensureSchema, getSql } from "@/app/server/db";
import {
  type AccountUser,
  createSession,
  normalizeUsername,
  publicAccount,
  validatePin,
  validateUsername,
  verifyPin,
} from "@/app/server/auth";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const username = typeof body.username === "string" ? body.username.trim() : "";
    const pin = typeof body.pin === "string" ? body.pin : "";
    const validationError = validateUsername(username) || validatePin(pin);
    if (validationError) return Response.json({ error: validationError }, { status: 400 });

    await ensureSchema();
    const sql = getSql();
    const rows = await sql`
      SELECT id, username, pin_hash, progress, portfolio, failed_attempts, locked_until
      FROM turini_users
      WHERE username_normalized = ${normalizeUsername(username)}
      LIMIT 1
    `;
    const user = rows[0] as AccountUser | undefined;
    if (!user) return Response.json({ error: "아이디 또는 비밀번호를 확인해 주세요." }, { status: 401 });

    if (user.locked_until && new Date(user.locked_until).getTime() > Date.now()) {
      return Response.json({ error: "비밀번호 입력을 여러 번 틀렸어요. 5분 후 다시 시도해 주세요." }, { status: 429 });
    }

    if (!(await verifyPin(pin, user.pin_hash))) {
      const nextAttempts = user.failed_attempts + 1;
      if (nextAttempts >= 5) {
        await sql`
          UPDATE turini_users
          SET failed_attempts = 0, locked_until = NOW() + INTERVAL '5 minutes'
          WHERE id = ${user.id}
        `;
      } else {
        await sql`
          UPDATE turini_users SET failed_attempts = ${nextAttempts}
          WHERE id = ${user.id}
        `;
      }
      return Response.json({ error: "아이디 또는 비밀번호를 확인해 주세요." }, { status: 401 });
    }

    await sql`
      UPDATE turini_users
      SET failed_attempts = 0, locked_until = NULL
      WHERE id = ${user.id}
    `;
    await createSession(user.id);
    return Response.json(publicAccount(user));
  } catch (error) {
    return databaseErrorResponse(error);
  }
}
