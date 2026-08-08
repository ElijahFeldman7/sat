# SAT Drill

Targeted SAT / PSAT practice built on the real College Board question bank, in an
exam interface that replicates Bluebook.

**Questions currently in use on live exams are never served.** The lookup
endpoint reports which items are active; those are flagged `is_live` at sync
time and excluded in exactly one place — `availableQuestions()` in
`lib/db/queries.ts` — which every selection path goes through.

## Setup

```bash
npm install
npm run dev          # http://localhost:3000
```

`.env` needs:

| Variable | Purpose |
|---|---|
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | Google sign-in. Redirect URI: `http://localhost:3000/api/auth/callback/google` |
| `AUTH_SECRET` | Auth.js session signing (`openssl rand -base64 32`) |
| `AUTH_URL` | `http://localhost:3000` |
| `POOLER_URL` | Supabase **pooler** connection string — preferred |
| `CONNECTION_STRING` | Direct database host — fallback only; it is IPv6-only |

The schema is created automatically on first query. Everything lives in a `sat`
schema that is not exposed to the Supabase Data API, with RLS enabled on every
table as defence in depth.

### Which database you are on

`.env` holds the live project's credentials. `.env.local` sits on top of it and
is loaded last, so day-to-day work runs against a throwaway Postgres on your own
machine and nothing you do while building touches real accounts:

```
# .env.local  (git-ignored)
POOLER_URL=postgresql://<you>@127.0.0.1:5432/sat_local
CONNECTION_STRING=postgresql://<you>@127.0.0.1:5432/sat_local
```

Create the database once with `createdb sat_local`; the schema builds itself on
the first query, and the catalog syncs on the first drill. Supabase's schema
revokes from the `anon` and `authenticated` roles, so a plain Postgres needs them
to exist:

```sql
CREATE ROLE anon NOLOGIN;
CREATE ROLE authenticated NOLOGIN;
```

Every process prints what it connected to on its first query —
`[db] local → 127.0.0.1/sat_local` — so it is never a guess. To work against the
real database, rename the override: `mv .env.local .env.local.off`.

The verification scripts write test data and refuse to run against anything but a
local database; `ALLOW_REMOTE_WRITES=1` overrides that if you mean it.

### Signing in locally

Google is not needed to click around. With `AUTH_SECRET` and a database URL set,
`next dev` running:

```
http://localhost:3000/api/dev-login
```

signs in a fixed `dev-local-user` and redirects to the dashboard
(`?next=/history` to land elsewhere). Only `GOOGLE_CLIENT_ID` /
`GOOGLE_CLIENT_SECRET` are optional in that case; the route answers 404 under
`NODE_ENV=production`, so it exists only under `next dev`.

**Bump `SCHEMA_VERSION` in `lib/db/schema.ts` whenever you add to `SCHEMA_SQL`.**
`ready()` compares it against the version recorded in the database and only then
runs the DDL — without a bump, a new table is never created on a database that
already exists.

## Features

- **Drill by topic** — any combination of the 27 skills across Math and Reading
  & Writing, filtered by difficulty, for SAT / PSAT-NMSQT / PSAT 8/9.
- **Pacing** — per-question budget with a ring that turns amber then red and
  counts overtime, or a single total-time budget, or untimed. The ring never
  interrupts you.
- **Weak spots** — one-click drill over your lowest-accuracy skills, ranked by
  Wilson lower bound so a 2/3 doesn't outrank a 40/60.
- **Review misses** — wrong answers enter a Leitner queue and resurface on a
  1 / 3 / 7 / 21-day schedule.
- **Unseen only** by default, with per-skill counts of what's left.
- **Results** keep the answer and explanation hidden until you ask, and flag
  questions you rushed or spent 2× your own median on.
- **Bluebook parity** — Mark for Review, answer cross-out, passage highlighting,
  the question-nav popover, the Check Your Work page, and keyboard shortcuts
  (`A`–`D`, `←`/`→`, `M`, `C`, `H`, `K`).
- **Desmos** on Math, docked in its own column so opening it shifts the exam
  rather than covering it.
- **Daily goal** — set a practice target on `/settings` and see a calendar
  heatmap of which days hit it. Time is counted only while the tab is visible
  *and* you have interacted in the last two minutes, so an idle tab earns
  nothing (`components/TimeTracker.tsx`).
- **Mobile** — the app chrome collapses to a fixed bar with a full-screen menu,
  and the exam stacks its two panes.

## Question sources

| | Math | Reading & Writing |
|---|---|---|
| SAT | 865 | 746 |
| PSAT/NMSQT & PSAT 10 | 777 | 746 |
| PSAT 8/9 | 637 | 561 |

Counts are non-live, gradable items. The non-live catalog matches the educator
question bank exactly — same `lookup` / `get-questions` requests the site makes,
same `mathLiveItems` / `readingLiveItems` sets behind its "Exclude Active
Questions" toggle. Math also includes the legacy disclosed items (toggleable);
81 of those ship without an answer key, which is the entire gap between what the
bank lists and what is counted above.

## Layout

```
lib/qbank/        TypeScript port of the College Board client, normalizer, grader
lib/db/           schema, Postgres client, every query, catalog sync
components/       app chrome — AppShell/AppNav, TimeTracker
components/exam/  the Bluebook replica
app/              routes and API handlers
scripts/          verify*.ts|mts (checks), backfill.ts, shoot.mjs, dev-session.ts
```

## Verifying

```bash
npm run verify            # catalog sync, live-item guard, selection, grading
npm run verify:module     # mock modules built from the bank, to the blueprint
npm run verify:blueprint  # blueprint allocation, no database needed
npm run verify:marks      # passage highlighting's range surgery, in jsdom
```

`verify` syncs the catalog and asserts the live-item guard, selection filters,
question normalization for both sources, grading (including SPR fraction/decimal
equivalence), and that no live or ungradable question can reach a drill.

`verify:module` builds real mock modules and checks the pool can serve every
skill quota, in the section's order, and still can after a dozen builds.

Every script that reads the database goes through the same `.env` + `.env.local`
pair as the app, so the local override applies to all of them.

## Backfilling

```bash
npm run backfill
```

Downloads every non-live question body so gradability is known before a drill
asks for it. Skip this and the per-skill counts overstate the pool — an item is
only found to be missing its answer key when a drill happens to draw it. The run
is resumable; `--refetch` re-downloads bodies that are already cached.
