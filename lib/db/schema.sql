-- Schema for the SAT drill app.
--
-- Everything lives in a dedicated `sat` schema rather than `public`, so it is
-- never reachable through the Supabase Data API with the publishable key (the
-- app talks to Postgres directly as the owner role). RLS is enabled on every
-- table as defence in depth: with no policies, `anon`/`authenticated` see
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

-- One row per question in the bank. `key` is the external_id when present,
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
                  check (kind in ('topic', 'adaptive', 'srs', 'retake')),
  config        jsonb not null,
  status        text not null default 'active' check (status in ('active', 'complete')),
  created_at    timestamptz not null default now(),
  started_at    timestamptz,
  completed_at  timestamptz
);

create index if not exists drill_sets_user_idx on sat.drill_sets (user_id, created_at desc);

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
