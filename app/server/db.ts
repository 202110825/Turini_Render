import "server-only";

import { neon } from "@neondatabase/serverless";

let schemaPromise: Promise<void> | null = null;

export function getSql() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error("DATABASE_URL_NOT_CONFIGURED");
  }
  return neon(databaseUrl);
}

export function ensureSchema() {
  if (!schemaPromise) {
    schemaPromise = (async () => {
      const sql = getSql();
      await sql`
        CREATE TABLE IF NOT EXISTS turini_users (
          id TEXT PRIMARY KEY,
          username VARCHAR(20) NOT NULL,
          username_normalized VARCHAR(20) NOT NULL UNIQUE,
          pin_hash TEXT NOT NULL,
          progress JSONB NOT NULL DEFAULT '{}'::jsonb,
          portfolio JSONB NOT NULL DEFAULT '{}'::jsonb,
          failed_attempts INTEGER NOT NULL DEFAULT 0,
          locked_until TIMESTAMPTZ,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
      `;
      await sql`
        CREATE TABLE IF NOT EXISTS turini_sessions (
          token_hash CHAR(64) PRIMARY KEY,
          user_id TEXT NOT NULL REFERENCES turini_users(id) ON DELETE CASCADE,
          expires_at TIMESTAMPTZ NOT NULL,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
      `;
      await sql`
        CREATE INDEX IF NOT EXISTS turini_sessions_user_id_idx
        ON turini_sessions(user_id)
      `;
      await sql`
        CREATE INDEX IF NOT EXISTS turini_sessions_expires_at_idx
        ON turini_sessions(expires_at)
      `;
    })().catch((error) => {
      schemaPromise = null;
      throw error;
    });
  }
  return schemaPromise;
}

export function databaseErrorResponse(error: unknown) {
  const message = error instanceof Error ? error.message : "";
  if (message === "DATABASE_URL_NOT_CONFIGURED") {
    return Response.json(
      { error: "서버 데이터베이스가 아직 연결되지 않았어요. Render에 DATABASE_URL을 설정해 주세요." },
      { status: 503 },
    );
  }
  console.error("Turini database error", error);
  return Response.json({ error: "서버 저장소에 연결하지 못했어요. 잠시 후 다시 시도해 주세요." }, { status: 503 });
}
