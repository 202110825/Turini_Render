# Turini Render Edition

Render settings:
- Build Command: `npm ci && npm run build`
- Start Command: `npm start`
- Node: `22.13.0`
- Root Directory: blank
- Required environment variable: `DATABASE_URL` (Neon pooled connection string)

This edition runs the Next.js UI and account API together on Render. User IDs,
encrypted 4-digit PINs, diagnosis results, learning progress, and portfolio state
are stored in PostgreSQL instead of browser storage.
