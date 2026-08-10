import { clearSession } from "@/app/server/auth";
import { databaseErrorResponse } from "@/app/server/db";

export const runtime = "nodejs";

export async function POST() {
  try {
    await clearSession();
    return Response.json({ ok: true });
  } catch (error) {
    return databaseErrorResponse(error);
  }
}
