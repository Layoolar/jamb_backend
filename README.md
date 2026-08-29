# SabiPass — API

Express 5 + TypeScript + Drizzle → Postgres. No Supabase, no per-MAU billing,
no Docker in production.

Plan and checklist live in the frontend repo: `../jamb_frontend/PLAN.md`, `BUILD.md`.

## Setup

```bash
npm install
cp .env.example .env
# then fill in DATABASE_URL and JWT_SECRET
node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"

npm run db:migrate     # apply migrations
npm run seed           # 4 subjects + 48 starter questions
npm run dev            # http://localhost:4000
```

Verify the whole match engine end to end:

```bash
npm run smoke          # Phase 2 exit gate, exits non-zero on failure
```

## Local Postgres

**Ports 5432 and 5433 are both taken** by pre-existing native Postgres 13 and 18
installs on this machine, both password-protected. The dev database therefore runs
in a container on **55433** — a port far enough out to be unambiguous. Connecting
to 5433 silently reaches the native instance instead and fails with a confusing
`password authentication failed`.

```bash
docker run -d --name sabipass-pg \
  -e POSTGRES_PASSWORD=sabipass_dev -e POSTGRES_DB=sabipass \
  -p 55433:5432 postgres:18-alpine

# .env
DATABASE_URL=postgres://postgres:sabipass_dev@127.0.0.1:55433/sabipass
```

Use `127.0.0.1`, not `localhost` — the latter can resolve to `::1` and pick a
different listener than you expect when several are running.

Docker is for local convenience only. Production runs Postgres on the host via
the PGDG apt repo, with the app under systemd — one app and one database do not
need an orchestration layer.

## The two invariants

Everything else is ordinary CRUD. These two are what the app's integrity rests
on, and both are easy to break with an innocuous-looking change.

**1. Answer keys never leave the server early.** Every route parses its response
through a Zod schema on the way *out* (`src/lib/respond.ts`), and Zod drops keys
a schema does not declare. `correctIndex` appears in exactly **one** response
schema — `AnswerResult`. If a grep finds it in two, that is a bug:

```bash
grep -rn "correctIndex" src/schemas/
```

`MatchResult` also exposes keys, but only after the requesting player has
finished, and the opponent's choices only once *they* have finished too.

**2. Serving a question is idempotent.** `POST /matches/:id/question` stamps
`served_at` once. Reconnecting re-serves the same question with its **original**
deadline. Break this and force-quitting mid-question grants unlimited thinking
time — an exploit no amount of screen-capture blocking touches, and one that
never shows up in normal testing because nobody force-quits by accident.

## Endpoints

```
GET    /health

POST   /auth/signup            { email, password, username? }
POST   /auth/login             { email, password }
POST   /auth/oauth/:provider   google | apple — { idToken, username? }
POST   /auth/link/:provider    attach a provider to the signed-in account
POST   /auth/refresh           { refreshToken }  → rotates, detects reuse
POST   /auth/logout
GET    /auth/me
DELETE /auth/account           required by App Store 5.1.1(v)

GET    /subjects
POST   /questions/:id/report   { reason }  → auto-flags at 3 reports

GET    /matches                the player's live and recent matches
POST   /matches                { subjectSlug?, mode }
POST   /matches/join           { inviteCode? } — omit to use the open pool
POST   /matches/:id/question   idempotent serve
POST   /matches/:id/answer     { questionId, selectedIndex, flags }
GET    /matches/:id/result
```

## Design notes

- **Refresh tokens are opaque random strings, not JWTs.** They must be revocable,
  and only a stored record can be. We keep the SHA-256, never the token. Reuse of
  a spent token revokes the whole family — without that, a stolen refresh token
  is valid until it expires.
- **The quick-match pool is `SELECT … FOR UPDATE SKIP LOCKED`.** Two players
  racing for the same open duel cannot both claim it, and neither blocks. This is
  why there is no Redis.
- **Settlement holds a row lock on the match**, so two players finishing at the
  same moment cannot double-settle or double-count stats.
- **Strikes are client-reported and can only hurt the reporter**, so a hostile
  client gains nothing by lying about `app_away`. Flags are logged for analysis;
  nothing auto-bans in v1 — you would ban real users who took a phone call.
- **`content_format` exists but is always `'plain'` in v1.** Adding LaTeX for
  Maths and Physics later is a renderer change, not a migration.
- **Subjects are rows.** Nothing hardcodes a slug; adding a subject is an INSERT.

## Scripts

```bash
npm run seed                             # subjects + starter bank, idempotent
npm run import -- content/file.csv       # past questions → status='draft'
npm run import -- content/file.csv --live
# npm run generate:questions          # Phase 5 — not built yet
npm run db:studio                        # Drizzle Studio (content review UI)
npm run smoke                            # Phase 2 exit gate
```

Imports land as `draft` deliberately. Nothing reaches players until reviewed.
