import { databaseErrorResponse, ensureSchema, getSql } from "@/app/server/db";
import {
  createSession,
  hashPin,
  newUserId,
  normalizeUsername,
  validatePin,
  validateUsername,
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
    const id = newUserId();
    try {
      await sql`
        INSERT INTO turini_users (id, username, username_normalized, pin_hash)
        VALUES (${id}, ${username}, ${normalizeUsername(username)}, ${await hashPin(pin)})
      `;
    } catch (error) {
      const code = typeof error === "object" && error && "code" in error ? String(error.code) : "";
      if (code === "23505") return Response.json({ error: "이미 사용 중인 아이디예요. 다른 아이디를 입력해 주세요." }, { status: 409 });
      throw error;
    }
    await createSession(id);
    return Response.json({ account: { username }, progress: {}, portfolio: {} }, { status: 201 });
  } catch (error) {
    return databaseErrorResponse(error);
  }
}
