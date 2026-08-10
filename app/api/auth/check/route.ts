import { ensureSchema, databaseErrorResponse, getSql } from "@/app/server/db";
import { normalizeUsername, validateUsername } from "@/app/server/auth";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const username = new URL(request.url).searchParams.get("username") || "";
    const validationError = validateUsername(username);
    if (validationError) return Response.json({ error: validationError }, { status: 400 });
    await ensureSchema();
    const sql = getSql();
    const rows = await sql`
      SELECT 1 FROM turini_users
      WHERE username_normalized = ${normalizeUsername(username)}
      LIMIT 1
    `;
    return Response.json({ available: rows.length === 0 });
  } catch (error) {
    return databaseErrorResponse(error);
  }
}
