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
scripts/          verify.ts (end-to-end checks), backfill.ts, shoot.mjs, dev-session.ts
```

## Verifying

```bash
npx tsx --env-file=.env scripts/verify.ts
```

Syncs the catalog and asserts the live-item guard, selection filters, question
normalization for both sources, grading (including SPR fraction/decimal
equivalence), and that no live or ungradable question can reach a drill.

## Backfilling

```bash
npx tsx --env-file=.env scripts/backfill.ts
```

Downloads every non-live question body so gradability is known before a drill
asks for it. Skip this and the per-skill counts overstate the pool — an item is
only found to be missing its answer key when a drill happens to draw it. The run
is resumable; `--refetch` re-downloads bodies that are already cached.
