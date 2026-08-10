import { clearSession, getCurrentUser, publicAccount, verifyPin } from "@/app/server/auth";
import { databaseErrorResponse, getSql } from "@/app/server/db";

export const runtime = "nodejs";

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

export async function GET() {
  try {
    const user = await getCurrentUser();
    if (!user) return Response.json({ error: "로그인이 필요해요." }, { status: 401 });
    return Response.json(publicAccount(user));
  } catch (error) {
    return databaseErrorResponse(error);
  }
}

export async function PUT(request: Request) {
  try {
    const user = await getCurrentUser();
    if (!user) return Response.json({ error: "로그인이 필요해요." }, { status: 401 });
    const body = await request.json().catch(() => ({}));
    if (!isPlainObject(body.progress) || !isPlainObject(body.portfolio)) {
      return Response.json({ error: "저장할 기록 형식이 올바르지 않아요." }, { status: 400 });
    }
    if (JSON.stringify(body).length > 1_500_000) {
      return Response.json({ error: "저장할 기록이 너무 커요." }, { status: 413 });
    }
    const sql = getSql();
    await sql`
      UPDATE turini_users
      SET progress = ${JSON.stringify(body.progress)}::jsonb,
          portfolio = ${JSON.stringify(body.portfolio)}::jsonb,
          updated_at = NOW()
      WHERE id = ${user.id}
    `;
    return Response.json({ ok: true });
  } catch (error) {
    return databaseErrorResponse(error);
  }
}

export async function DELETE(request: Request) {
  try {
    const user = await getCurrentUser();
    if (!user) return Response.json({ error: "로그인이 필요해요." }, { status: 401 });
    const body = await request.json().catch(() => ({}));
    const pin = typeof body.pin === "string" ? body.pin : "";
    if (!(await verifyPin(pin, user.pin_hash))) {
      return Response.json({ error: "비밀번호가 맞지 않아요." }, { status: 401 });
    }
    const sql = getSql();
    await sql`DELETE FROM turini_users WHERE id = ${user.id}`;
    await clearSession();
    return Response.json({ ok: true });
  } catch (error) {
    return databaseErrorResponse(error);
  }
}
