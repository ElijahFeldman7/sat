/**
 * Database schema, as a module rather than a .sql file read at runtime.
 *
 * Serverless bundlers trace imports, not files opened by a computed path, so a
 * `readFileSync` of schema.sql resolves in development and then throws ENOENT
 * once deployed. Keeping the DDL in TypeScript guarantees it ships.
 *
 * Every statement is idempotent.
 */

/**
 * Bump on every change to SCHEMA_SQL.
 *
 * `ready()` skips the DDL when the database already records this version, so a
 * new table that arrives without a bump is never created on a database that
 * already exists.
 *
 * 1 — initial schema
 * 2 — user_settings, daily_time (daily goal + time on platform)
 * 3 — drill_sets.kind accepts 'module' (full-length mock modules)
 */
export const SCHEMA_VERSION = 3;

export const SCHEMA_SQL = String.raw`
-- Schema for the SAT drill app.
--
-- Everything lives in a dedicated \`sat\` schema rather than \`public\`, so it is
-- never reachable through the Supabase Data API with the publishable key (the
-- app talks to Postgres directly as the owner role). RLS is enabled on every
-- table as defence in depth: with no policies, \`anon\`/\`authenticated\` see
-- nothing even if the schema were later exposed.

create schema if not exists sat;

revoke all on schema sat from anon, authenticated;
revoke all on all tables in schema sat from anon, authenticated;

-- ---------------------------------------------------------------------------

create table if not exists sat.users (
  id          text primary key,
  email       text,
  name        text,
  image       text,
  created_at  timestamptz not null default now()
);

-- One row per question in the bank. \`key\` is the external_id when present,
-- otherwise 'ibn:<IBN>' for legacy disclosed items.
create table if not exists sat.questions (
  key           text        not null,
  assessment_id integer     not null,
  module        text        not null check (module in ('math', 'rw')),
  external_id   text,
  ibn           text,
  uid           text,
  question_id   text,
  domain_code   text        not null,
  domain_name   text        not null,
  skill_name    text        not null,
  difficulty    text        not null check (difficulty in ('E', 'M', 'H')),
  score_band    integer,
  -- Questions currently in use on real exams. Never served; see
  -- availableQuestions() in queries.ts.
  is_live       boolean     not null default false,
  source        text        not null check (source in ('qbank', 'legacy')),
  created_date  timestamptz,
  updated_date  timestamptz,
  synced_at     timestamptz not null default now(),
  primary key (assessment_id, module, key)
);

-- Covers the drill-selection predicate: exam + module + live filter, then
-- topic and difficulty.
create index if not exists questions_pick_idx
  on sat.questions (assessment_id, module, skill_name, difficulty)
  where is_live = false;

create index if not exists questions_key_idx on sat.questions (key);

-- Cached question bodies, shared across exams (same key = same content).
create table if not exists sat.question_details (
  key               text primary key,
  type              text not null check (type in ('mcq', 'spr')),
  stem              text not null,
  stimulus          text,
  rationale         text not null,
  options           jsonb not null default '[]'::jsonb,
  correct_keys      jsonb not null default '[]'::jsonb,
  correct_letter    text,
  -- false when the bank ships no answer key for the item (some legacy
  -- disclosed items do). Ungradable questions never enter a drill.
  gradable          boolean not null default true,
  fetched_at        timestamptz not null default now()
);

create index if not exists question_details_ungradable_idx
  on sat.question_details (key) where gradable = false;

create table if not exists sat.drill_sets (
  id            uuid primary key,
  user_id       text not null references sat.users(id) on delete cascade,
  name          text not null,
  assessment_id integer not null,
  module        text not null check (module in ('math', 'rw')),
  kind          text not null default 'topic'
                  check (kind in ('topic', 'adaptive', 'srs', 'retake', 'module')),
  config        jsonb not null,
  status        text not null default 'active' check (status in ('active', 'complete')),
  created_at    timestamptz not null default now(),
  started_at    timestamptz,
  completed_at  timestamptz
);

create index if not exists drill_sets_user_idx on sat.drill_sets (user_id, created_at desc);

-- \`create table if not exists\` leaves an existing table's constraints alone, so
-- widening the set of kinds has to be spelled out for databases that already
-- have the table. Drop-then-add is idempotent; the name is the one Postgres
-- generates for the inline check above.
alter table sat.drill_sets drop constraint if exists drill_sets_kind_check;
alter table sat.drill_sets add constraint drill_sets_kind_check
  check (kind in ('topic', 'adaptive', 'srs', 'retake', 'module'));

create table if not exists sat.drill_questions (
  set_id            uuid not null references sat.drill_sets(id) on delete cascade,
  idx               integer not null,
  question_key      text not null,
  user_answer       text,
  is_correct        boolean,
  marked_for_review boolean not null default false,
  crossed_out       jsonb not null default '[]'::jsonb,
  time_spent_ms     integer not null default 0,
  answered_at       timestamptz,
  primary key (set_id, idx)
);

-- FK column index: Postgres does not create one automatically, and the
-- ON DELETE CASCADE from drill_sets needs it.
create index if not exists drill_questions_set_idx on sat.drill_questions (set_id);
create index if not exists drill_questions_key_idx on sat.drill_questions (question_key);

-- Leitner boxes for missed questions: box 0 => due tomorrow, then 3/7/21 days.
create table if not exists sat.srs_queue (
  user_id      text not null references sat.users(id) on delete cascade,
  question_key text not null,
  box          integer not null default 0,
  due_at       timestamptz not null,
  last_result  boolean,
  updated_at   timestamptz not null default now(),
  primary key (user_id, question_key)
);

create index if not exists srs_due_idx on sat.srs_queue (user_id, due_at);

create table if not exists sat.annotations (
  id           bigint generated always as identity primary key,
  user_id      text not null references sat.users(id) on delete cascade,
  question_key text not null,
  kind         text not null check (kind in ('highlight', 'note')),
  payload      jsonb not null,
  created_at   timestamptz not null default now(),
  unique (user_id, question_key, kind)
);

create table if not exists sat.sync_state (
  scope     text primary key,
  synced_at timestamptz not null
);

-- Which revision of this file the database has had applied. The single-row
-- constraint keeps it honest: there is one schema, so there is one version.
create table if not exists sat.schema_version (
  only_row   boolean primary key default true check (only_row),
  version    integer not null,
  applied_at timestamptz not null default now()
);

-- Per-user preferences. One row per user, created on first read.
create table if not exists sat.user_settings (
  user_id            text primary key references sat.users(id) on delete cascade,
  -- Daily practice target, in minutes. The heatmap on /settings colours each
  -- day by how much of this was met.
  daily_goal_minutes integer not null default 30
                       check (daily_goal_minutes between 5 and 240),
  updated_at         timestamptz not null default now()
);

-- Seconds of active time on the platform, bucketed by the student's *local*
-- day. The client sends the day key precisely because a UTC bucket would split
-- an evening session in two for anyone west of Greenwich.
create table if not exists sat.daily_time (
  user_id text not null references sat.users(id) on delete cascade,
  day     date not null,
  seconds integer not null default 0,
  primary key (user_id, day)
);

create index if not exists daily_time_user_day_idx on sat.daily_time (user_id, day desc);

-- ---------------------------------------------------------------------------
-- Defence in depth: no policies means no rows for anon/authenticated, while
-- the owner role the app connects as bypasses RLS.

alter table sat.users            enable row level security;
alter table sat.questions        enable row level security;
alter table sat.question_details enable row level security;
alter table sat.drill_sets       enable row level security;
alter table sat.drill_questions  enable row level security;
alter table sat.srs_queue        enable row level security;
alter table sat.annotations      enable row level security;
alter table sat.sync_state       enable row level security;
alter table sat.schema_version   enable row level security;
alter table sat.user_settings    enable row level security;
alter table sat.daily_time       enable row level security;
`;
