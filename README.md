# Giknew (Phase 1 Skeleton)

Early scaffold based on `story.md`.

## Quick Start
1. Copy `.env.example` to `.env` and fill values.
2. Provide a Postgres instance and set `DATABASE_URL`.
3. Install deps and generate Prisma client.
4. Run dev server.

## Commands
Implemented commands: `/start`, `/help`, `/linkgithub`, `/unlink`, `/mode`, `/ask`, `/exportmeta`, `/purge`, `/isolationdiag`.

## Development
1. Copy `.env.example` to `.env` and fill values.
2. Install dependencies and generate Prisma client:

```bash
npm install
npm run prisma:generate
```

3. Start the app locally:

```bash
npm run dev
```

4. Quick smoke test (runs the app and a synthetic /start update):

```bash
npm run smoke
```

## Notes
- Streaming is behind `STREAMING_ENABLED` env flag. `/ask` uses typing & placeholders when responses take >5s.
- Concurrency guards: per-user default 5, global default 25 (configurable via env `AI_USER_CONCURRENCY`, `AI_GLOBAL_CONCURRENCY`).
