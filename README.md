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

## Question sources

| | Math | Reading & Writing |
|---|---|---|
| SAT | 942 | 746 |
| PSAT/NMSQT & PSAT 10 | 849 | 746 |
| PSAT 8/9 | 689 | 561 |

Counts are non-live, gradable items. Math includes legacy disclosed items
(toggleable); a minority of those ship without an answer key, so they are marked
ungradable on first fetch and never offered again.

## Layout

```
lib/qbank/        TypeScript port of the College Board client, normalizer, grader
lib/db/           schema.sql, Postgres client, every query, catalog sync
components/exam/  the Bluebook replica
app/              routes and API handlers
scripts/          verify.ts (end-to-end checks), shoot.mjs (screenshots), dev-session.ts
```

## Verifying

```bash
npx tsx --env-file=.env scripts/verify.ts
```

Syncs the catalog and asserts the live-item guard, selection filters, question
normalization for both sources, grading (including SPR fraction/decimal
equivalence), and that no live or ungradable question can reach a drill.
