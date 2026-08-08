import type { Difficulty, ModuleKey, NormalizedQuestion } from "@/lib/qbank/types";
import { isGradable } from "@/lib/qbank/normalize";
import { all, boolArray, get, ready, run, sql, uuidv7 } from "./index";

// ---------------------------------------------------------------------------
// Users
// ---------------------------------------------------------------------------

export async function upsertUser(u: {
  id: string;
  email?: string | null;
  name?: string | null;
  image?: string | null;
}) {
  await run(
    `INSERT INTO users (id, email, name, image) VALUES (?,?,?,?)
     ON CONFLICT (id) DO UPDATE SET
       email = excluded.email, name = excluded.name, image = excluded.image`,
    [u.id, u.email ?? null, u.name ?? null, u.image ?? null],
  );
}

/** Total number of registered users. */
export async function countUsers(): Promise<number> {
  const row = await get<{ n: string }>(`SELECT COUNT(*) AS n FROM users`);
  return Number(row?.n ?? 0);
}

export interface UserRow {
  id: string;
  email: string | null;
  name: string | null;
  createdAt: string;
  drillSets: number;
  seconds: number;
}

/** Every user with their activity totals, newest sign-up first. */
export async function listUsers(limit = 500): Promise<UserRow[]> {
  const rows = await all<{
    id: string;
    email: string | null;
    name: string | null;
    created_at: string;
    drill_sets: string;
    seconds: string;
  }>(
    `SELECT u.id, u.email, u.name,
            to_char(u.created_at, 'YYYY-MM-DD') AS created_at,
            (SELECT COUNT(*) FROM drill_sets d WHERE d.user_id = u.id) AS drill_sets,
            (SELECT COALESCE(SUM(t.seconds), 0) FROM daily_time t WHERE t.user_id = u.id) AS seconds
     FROM users u
     ORDER BY u.created_at DESC
     LIMIT ?`,
    [limit],
  );
  return rows.map((r) => ({
    id: r.id,
    email: r.email,
    name: r.name,
    createdAt: r.created_at,
    drillSets: Number(r.drill_sets),
    seconds: Number(r.seconds),
  }));
}

// ---------------------------------------------------------------------------
// Question selection
// ---------------------------------------------------------------------------

export interface QuestionFilter {
  assessmentId: number;
  module: ModuleKey;
  skills?: string[];
  difficulties?: Difficulty[];
  /** Legacy disclosed items have no external_id; math-only and opt-in. */
  includeLegacy?: boolean;
  /** Skip anything this user has already been served. */
  excludeSeenFor?: string | null;
}

/**
 * THE single place questions are selected from.
 *
 * Every path into the `questions` table goes through here so that
 * `is_live = false` — excluding questions currently in use on real exams — can
 * never be forgotten. Do not query `questions` for drill content anywhere else.
 */
function availableQuestions(filter: QuestionFilter, extraSql = "", extraParams: unknown[] = []) {
  const where: string[] = [
    "q.is_live = false", // non-negotiable: never serve an active item
    // Items the bank ships with no answer key can't be scored; once we've seen
    // one we stop offering it.
    "NOT EXISTS (SELECT 1 FROM question_details qd WHERE qd.key = q.key AND qd.gradable = false)",
    "q.assessment_id = ?",
    "q.module = ?",
  ];
  const params: unknown[] = [filter.assessmentId, filter.module];

  if (!filter.includeLegacy) {
    where.push("q.source = 'qbank'");
  }

  if (filter.skills?.length) {
    where.push("q.skill_name = ANY(?)");
    params.push(filter.skills);
  }

  if (filter.difficulties?.length) {
    where.push("q.difficulty = ANY(?)");
    params.push(filter.difficulties);
  }

  if (filter.excludeSeenFor) {
    where.push(`NOT EXISTS (
      SELECT 1 FROM drill_questions dq
      JOIN drill_sets ds ON ds.id = dq.set_id
      WHERE ds.user_id = ? AND dq.question_key = q.key
    )`);
    params.push(filter.excludeSeenFor);
  }

  return {
    // The join is to one row at most (`key` is the detail table's primary key),
    // so it cannot change a count — it only carries the cached question type
    // along, which is what lets a module blueprint aim for its share of
    // student-produced responses without fetching every candidate first.
    sql: `FROM questions q
          LEFT JOIN question_details qd ON qd.key = q.key
          WHERE ${where.join(" AND ")} ${extraSql}`,
    params: [...params, ...extraParams],
  };
}

export interface CandidateRow {
  key: string;
  skill_name: string;
  domain_code: string;
  domain_name: string;
  difficulty: Difficulty;
  source: string;
  ibn: string | null;
  external_id: string | null;
  /** 'mcq' | 'spr' when the body has been cached, null when it hasn't. */
  known_type: "mcq" | "spr" | null;
}

export async function countAvailable(filter: QuestionFilter): Promise<number> {
  const { sql: from, params } = availableQuestions(filter);
  const row = await get<{ n: string }>(`SELECT COUNT(*) AS n ${from}`, params);
  return Number(row?.n ?? 0);
}

export async function listCandidates(
  filter: QuestionFilter,
  limit = 2000,
): Promise<CandidateRow[]> {
  const { sql: from, params } = availableQuestions(filter, "ORDER BY RANDOM() LIMIT ?", [limit]);
  return all<CandidateRow>(
    `SELECT q.key, q.skill_name, q.domain_code, q.domain_name, q.difficulty,
            q.source, q.ibn, q.external_id, qd.type AS known_type ${from}`,
    params,
  );
}

/** Round-robins across skills so a multi-topic drill is evenly spread. */
export function pickBalanced(candidates: CandidateRow[], count: number): CandidateRow[] {
  const bySkill = new Map<string, CandidateRow[]>();
  for (const c of candidates) {
    const bucket = bySkill.get(c.skill_name);
    if (bucket) bucket.push(c);
    else bySkill.set(c.skill_name, [c]);
  }

  const buckets = [...bySkill.values()];
  const picked: CandidateRow[] = [];
  let round = 0;
  while (picked.length < count) {
    let took = false;
    for (const bucket of buckets) {
      if (round < bucket.length && picked.length < count) {
        picked.push(bucket[round]);
        took = true;
      }
    }
    if (!took) break;
    round++;
  }

  // Shuffle so questions of one topic don't arrive in a block.
  for (let i = picked.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [picked[i], picked[j]] = [picked[j], picked[i]];
  }
  return picked;
}

// ---------------------------------------------------------------------------
// Topics (drill picker)
// ---------------------------------------------------------------------------

export interface SkillStatRow {
  skill_name: string;
  attempted: number;
  correct: number;
  median_ms: number | null;
}

export async function skillStats(
  userId: string,
  assessmentId: number,
  module: ModuleKey,
): Promise<SkillStatRow[]> {
  const rows = await all<{
    skill_name: string;
    attempted: string;
    correct: string;
    median_ms: string | null;
  }>(
    `SELECT q.skill_name,
            COUNT(*) AS attempted,
            COUNT(*) FILTER (WHERE dq.is_correct) AS correct,
            percentile_cont(0.5) WITHIN GROUP (ORDER BY dq.time_spent_ms) AS median_ms
     FROM drill_questions dq
     JOIN drill_sets ds ON ds.id = dq.set_id
     JOIN questions q ON q.key = dq.question_key
                     AND q.assessment_id = ds.assessment_id
                     AND q.module = ds.module
     WHERE ds.user_id = ? AND ds.assessment_id = ? AND ds.module = ?
       AND dq.is_correct IS NOT NULL
     GROUP BY q.skill_name`,
    [userId, assessmentId, module],
  );

  return rows.map((r) => ({
    skill_name: r.skill_name,
    attempted: Number(r.attempted),
    correct: Number(r.correct),
    median_ms: r.median_ms === null ? null : Number(r.median_ms),
  }));
}

export interface TopicSkill {
  name: string;
  total: number;
  available: number;
  attempted: number;
  correct: number;
  accuracy: number | null;
  /** Median seconds this student has spent per question here; null if new. */
  medianSeconds: number | null;
  /** The same median split by difficulty — a hard item costs more than an easy one. */
  medianByDifficulty: Partial<Record<Difficulty, number>>;
}

export interface SkillTimeMedian {
  skill_name: string;
  difficulty: Difficulty | null;
  seconds: number;
}

/**
 * Median seconds per question, per skill and per skill×difficulty.
 *
 * A `null` difficulty row is the skill's median across all difficulties, used
 * when the student has no history at the specific difficulty being drilled.
 * Median rather than mean throughout: one walked-away-from question would drag
 * an average far past anything the student actually needs.
 */
export async function skillTimeMedians(
  userId: string,
  assessmentId: number,
  module: ModuleKey,
): Promise<SkillTimeMedian[]> {
  const rows = await all<{ skill_name: string; difficulty: Difficulty | null; median_ms: string }>(
    `WITH times AS (
       SELECT q.skill_name, q.difficulty, dq.time_spent_ms
       FROM drill_questions dq
       JOIN drill_sets ds ON ds.id = dq.set_id
       JOIN questions q ON q.key = dq.question_key
                       AND q.assessment_id = ds.assessment_id
                       AND q.module = ds.module
       WHERE ds.user_id = ? AND ds.assessment_id = ? AND ds.module = ?
         AND dq.time_spent_ms > 0
     )
     SELECT skill_name, difficulty,
            percentile_cont(0.5) WITHIN GROUP (ORDER BY time_spent_ms) AS median_ms
     FROM times GROUP BY GROUPING SETS ((skill_name), (skill_name, difficulty))`,
    [userId, assessmentId, module],
  );
  return rows
    .map((r) => ({
      skill_name: r.skill_name,
      difficulty: r.difficulty,
      seconds: Math.max(1, Math.round(Number(r.median_ms) / 1000)),
    }))
    .filter((r) => Number.isFinite(r.seconds));
}

export interface TopicDomain {
  code: string;
  name: string;
  skills: TopicSkill[];
}

/**
 * Per-skill pool sizes and accuracy for the drill picker.
 *
 * Deliberately one query: the aggregates themselves run in a couple of
 * milliseconds, so what the picker actually waits on is network round trips to
 * the database. Totals, unseen counts and per-skill stats are therefore rolled
 * into a single statement instead of three.
 */
export async function topicTree(
  userId: string,
  assessmentId: number,
  module: ModuleKey,
  opts: { includeLegacy: boolean; excludeSeen: boolean },
): Promise<TopicDomain[]> {
  const sourceFilter = opts.includeLegacy ? "" : "AND q.source = 'qbank'";

  // Timings need GROUPING SETS, which would force the shape of the query above
  // — cheaper to run the two in parallel than to contort either.
  const timings = skillTimeMedians(userId, assessmentId, module);

  const rows = await all<{
    domain_code: string;
    domain_name: string;
    skill_name: string;
    total: string;
    unseen: string;
    attempted: string;
    correct: string;
  }>(
    `WITH pool AS (
       SELECT q.key, q.domain_code, q.domain_name, q.skill_name
       FROM questions q
       LEFT JOIN question_details qd ON qd.key = q.key AND qd.gradable = false
       WHERE q.is_live = false AND qd.key IS NULL
         AND q.assessment_id = ? AND q.module = ? ${sourceFilter}
     ),
     seen AS (
       SELECT DISTINCT dq.question_key
       FROM drill_questions dq
       JOIN drill_sets ds ON ds.id = dq.set_id
       WHERE ds.user_id = ? AND ds.assessment_id = ? AND ds.module = ?
     ),
     stats AS (
       SELECT q.skill_name,
              COUNT(*) AS attempted,
              COUNT(*) FILTER (WHERE dq.is_correct) AS correct
       FROM drill_questions dq
       JOIN drill_sets ds ON ds.id = dq.set_id
       JOIN questions q ON q.key = dq.question_key
                       AND q.assessment_id = ds.assessment_id
                       AND q.module = ds.module
       WHERE ds.user_id = ? AND ds.assessment_id = ? AND ds.module = ?
         AND dq.is_correct IS NOT NULL
       GROUP BY q.skill_name
     )
     SELECT p.domain_code, p.domain_name, p.skill_name,
            COUNT(*) AS total,
            COUNT(*) FILTER (WHERE s.question_key IS NULL) AS unseen,
            COALESCE(MAX(st.attempted), 0) AS attempted,
            COALESCE(MAX(st.correct), 0) AS correct
     FROM pool p
     LEFT JOIN seen s ON s.question_key = p.key
     LEFT JOIN stats st ON st.skill_name = p.skill_name
     GROUP BY p.domain_code, p.domain_name, p.skill_name
     ORDER BY p.domain_code, p.skill_name`,
    [assessmentId, module, userId, assessmentId, module, userId, assessmentId, module],
  );

  const overall = new Map<string, number>();
  const byDifficulty = new Map<string, Partial<Record<Difficulty, number>>>();
  for (const t of await timings) {
    if (t.difficulty === null) {
      overall.set(t.skill_name, t.seconds);
    } else {
      const bucket = byDifficulty.get(t.skill_name) ?? {};
      bucket[t.difficulty] = t.seconds;
      byDifficulty.set(t.skill_name, bucket);
    }
  }

  const domains = new Map<string, TopicDomain>();
  for (const row of rows) {
    let domain = domains.get(row.domain_code);
    if (!domain) {
      domain = { code: row.domain_code, name: row.domain_name, skills: [] };
      domains.set(row.domain_code, domain);
    }
    const attempted = Number(row.attempted);
    const correct = Number(row.correct);
    domain.skills.push({
      name: row.skill_name,
      total: Number(row.total),
      available: opts.excludeSeen ? Number(row.unseen) : Number(row.total),
      attempted,
      correct,
      accuracy: attempted > 0 ? correct / attempted : null,
      medianSeconds: overall.get(row.skill_name) ?? null,
      medianByDifficulty: byDifficulty.get(row.skill_name) ?? {},
    });
  }

  return [...domains.values()];
}

// ---------------------------------------------------------------------------
// Question detail cache
// ---------------------------------------------------------------------------

interface DetailRow {
  key: string;
  type: string;
  stem: string;
  stimulus: string | null;
  rationale: string;
  options: NormalizedQuestion["options"];
  correct_keys: string[];
  correct_letter: string | null;
}

function toNormalized(row: DetailRow): NormalizedQuestion {
  return {
    key: row.key,
    type: row.type as NormalizedQuestion["type"],
    stem: row.stem,
    stimulus: row.stimulus,
    rationale: row.rationale,
    options: row.options,
    correctKeys: row.correct_keys,
    correctLetter: row.correct_letter,
  };
}

/** Batched cache read — one round trip for a whole drill. */
export async function getCachedDetails(keys: string[]): Promise<Map<string, NormalizedQuestion>> {
  if (keys.length === 0) return new Map();
  const rows = await all<DetailRow>(
    `SELECT key, type, stem, stimulus, rationale, options, correct_keys, correct_letter
     FROM question_details WHERE key = ANY(?)`,
    [keys],
  );
  return new Map(rows.map((r) => [r.key, toNormalized(r)]));
}

/**
 * Bytes of question HTML per INSERT. Legacy disclosed items inline their
 * diagrams as base64 and run to half a megabyte each, so a batch has to be
 * split by weight rather than by row count or a backfill overruns the
 * pooler's message limit.
 */
const DETAIL_CHUNK_BYTES = 4 * 1024 * 1024;

/** One statement per batch rather than a round trip per question. */
export async function cacheDetails(questions: NormalizedQuestion[]) {
  if (questions.length === 0) return;

  let chunk: NormalizedQuestion[] = [];
  let bytes = 0;
  for (const q of questions) {
    const weight = q.stem.length + (q.stimulus?.length ?? 0) + q.rationale.length;
    if (chunk.length && bytes + weight > DETAIL_CHUNK_BYTES) {
      await insertDetails(chunk);
      chunk = [];
      bytes = 0;
    }
    chunk.push(q);
    bytes += weight;
  }
  if (chunk.length) await insertDetails(chunk);
}

async function insertDetails(questions: NormalizedQuestion[]) {
  await sql()`
    INSERT INTO question_details
      (key, type, stem, stimulus, rationale, options, correct_keys, correct_letter, gradable, fetched_at)
    SELECT key, type, stem, stimulus, rationale,
           options::jsonb, correct_keys::jsonb, correct_letter,
           gradable::boolean, now()
    FROM UNNEST(
      ${questions.map((q) => q.key)}::text[],
      ${questions.map((q) => q.type)}::text[],
      ${questions.map((q) => q.stem)}::text[],
      ${questions.map((q) => q.stimulus)}::text[],
      ${questions.map((q) => q.rationale)}::text[],
      ${questions.map((q) => JSON.stringify(q.options))}::text[],
      ${questions.map((q) => JSON.stringify(q.correctKeys))}::text[],
      ${questions.map((q) => q.correctLetter)}::text[],
      ${boolArray(questions.map((q) => isGradable(q)))}::text[]
    ) AS t(key, type, stem, stimulus, rationale, options, correct_keys, correct_letter, gradable)
    ON CONFLICT (key) DO UPDATE SET
      type = excluded.type, stem = excluded.stem, stimulus = excluded.stimulus,
      rationale = excluded.rationale, options = excluded.options,
      correct_keys = excluded.correct_keys, correct_letter = excluded.correct_letter,
      gradable = excluded.gradable, fetched_at = excluded.fetched_at
  `;
}

// ---------------------------------------------------------------------------
// Drill sets
// ---------------------------------------------------------------------------

export type TimingMode = "per-question" | "total" | "untimed";

export interface DrillConfig {
  timingMode: TimingMode;
  /** seconds, when timingMode === 'per-question' */
  secondsPerQuestion?: number;
  /** seconds, when timingMode === 'total' */
  totalSeconds?: number;
  /**
   * Per-question seconds for specific skills, when timingMode is
   * 'per-question'. The pacing ring reads this first so a topic the student is
   * slow on gets its own budget; `secondsPerQuestion` is the fallback.
   */
  secondsPerSkill?: Record<string, number>;
  skills: string[];
  difficulties: Difficulty[];
  includeLegacy: boolean;
  excludeSeen: boolean;
  /** Set on `kind: 'module'` drills — which test-form blueprint built this. */
  blueprintId?: string;
}

export interface DrillSetRow {
  id: string;
  user_id: string;
  name: string;
  assessment_id: number;
  module: ModuleKey;
  kind: string;
  config: DrillConfig;
  status: string;
  created_at: Date;
  started_at: Date | null;
  completed_at: Date | null;
}

export async function createDrillSet(input: {
  userId: string;
  name: string;
  assessmentId: number;
  module: ModuleKey;
  kind: string;
  config: DrillConfig;
  questionKeys: string[];
}): Promise<string> {
  const id = uuidv7();

  await sql().begin(async (tx) => {
    await tx`
      INSERT INTO drill_sets (id, user_id, name, assessment_id, module, kind, config, status)
      VALUES (${id}, ${input.userId}, ${input.name}, ${input.assessmentId},
              ${input.module}, ${input.kind}, ${sql().json({ ...input.config })}, 'active')
    `;
    await tx`
      INSERT INTO drill_questions (set_id, idx, question_key)
      SELECT ${id}::uuid, idx, key FROM UNNEST(
        ${input.questionKeys.map((_, i) => i)}::int[],
        ${input.questionKeys}::text[]
      ) AS t(idx, key)
    `;
  });

  return id;
}

export async function getDrillSet(id: string, userId: string): Promise<DrillSetRow | undefined> {
  return get<DrillSetRow>("SELECT * FROM drill_sets WHERE id = ? AND user_id = ?", [id, userId]);
}

export interface DrillQuestionRow {
  idx: number;
  question_key: string;
  /** Alias of `question_key` so rows satisfy `QuestionRef` directly. */
  key: string;
  user_answer: string | null;
  is_correct: boolean | null;
  marked_for_review: boolean;
  crossed_out: string[];
  time_spent_ms: number;
  answered_at: Date | null;
  skill_name: string;
  domain_name: string;
  difficulty: Difficulty;
  source: string;
  ibn: string | null;
  external_id: string | null;
}

/**
 * Scoped by owner, not just by set id. The join already passes through
 * `drill_sets`, so the ownership check is free — and it means a caller cannot
 * read another account's questions even if it forgets to check the set first.
 */
export async function getDrillQuestions(
  setId: string,
  userId: string,
): Promise<DrillQuestionRow[]> {
  return all<DrillQuestionRow>(
    `SELECT dq.*, dq.question_key AS key,
            q.skill_name, q.domain_name, q.difficulty, q.source, q.ibn, q.external_id
     FROM drill_questions dq
     JOIN drill_sets ds ON ds.id = dq.set_id
     JOIN questions q ON q.key = dq.question_key
                     AND q.assessment_id = ds.assessment_id
                     AND q.module = ds.module
     WHERE dq.set_id = ? AND ds.user_id = ?
     ORDER BY dq.idx`,
    [setId, userId],
  );
}

export interface ProgressPatch {
  idx: number;
  userAnswer?: string | null;
  markedForReview?: boolean;
  crossedOut?: string[];
  timeSpentMs?: number;
}

/**
 * Applies a batch of answer/mark/cross-out/time updates in one statement.
 * COALESCE keeps fields the client didn't send.
 */
export async function saveProgress(setId: string, patches: ProgressPatch[]) {
  if (patches.length === 0) return;

  await sql()`
    UPDATE drill_questions dq SET
      user_answer       = CASE WHEN p.set_answer::boolean THEN p.user_answer ELSE dq.user_answer END,
      answered_at       = CASE WHEN p.set_answer::boolean
                               THEN CASE WHEN p.user_answer IS NULL OR p.user_answer = ''
                                         THEN NULL ELSE now() END
                               ELSE dq.answered_at END,
      marked_for_review = COALESCE(p.marked_for_review::boolean, dq.marked_for_review),
      crossed_out       = COALESCE(p.crossed_out::jsonb, dq.crossed_out),
      time_spent_ms     = GREATEST(COALESCE(p.time_spent_ms, dq.time_spent_ms), dq.time_spent_ms)
    FROM (
      SELECT * FROM UNNEST(
        ${patches.map((p) => p.idx)}::int[],
        ${boolArray(patches.map((p) => p.userAnswer !== undefined))}::text[],
        ${patches.map((p) => p.userAnswer ?? null)}::text[],
        ${boolArray(patches.map((p) => p.markedForReview))}::text[],
        ${patches.map((p) => (p.crossedOut ? JSON.stringify(p.crossedOut) : null))}::text[],
        ${patches.map((p) => (p.timeSpentMs === undefined ? null : Math.round(p.timeSpentMs)))}::int[]
      ) AS t(idx, set_answer, user_answer, marked_for_review, crossed_out, time_spent_ms)
    ) p
    WHERE dq.set_id = ${setId}::uuid AND dq.idx = p.idx
  `;
}

export interface DeletedSet {
  questions: number;
  /** Review-queue entries dropped because no other set covers those questions. */
  srsEntries: number;
  /** Highlights and notes dropped on the same rule. */
  annotations: number;
  /** Practice seconds subtracted from the day the set was worked. */
  seconds: number;
}

/**
 * Deletes a set and everything downstream of it, in one transaction.
 *
 * Scoped by user throughout, so an id guessed from someone else's URL touches
 * nothing; returns null when nothing matched. `drill_questions` goes by cascade.
 * Review scheduling and annotations are keyed by question rather than by set, so
 * they are only dropped for questions no *remaining* set of this user covers —
 * a question you have also practised elsewhere keeps its box and its highlights.
 *
 * `day` is the student's local day the set was worked, which only the browser
 * can compute (see `localDay`). Given one, the set's recorded time is subtracted
 * from that day's total. It is an approximation in both directions: `daily_time`
 * counts idle-gated wall-clock time across the whole app, not per-set time, and
 * a set worked across midnight lands entirely on one day. Clamped at zero so it
 * can never push a day negative.
 */
export async function deleteDrillSet(
  setId: string,
  userId: string,
  day?: string | null,
): Promise<DeletedSet | null> {
  await ready();

  return sql().begin(async (tx) => {
    const [set] = await tx<{ id: string }[]>`
      SELECT id FROM drill_sets WHERE id = ${setId}::uuid AND user_id = ${userId}
    `;
    if (!set) return null;

    const rows = await tx<{ question_key: string; time_spent_ms: number }[]>`
      SELECT question_key, time_spent_ms FROM drill_questions WHERE set_id = ${setId}::uuid
    `;
    const keys = rows.map((r) => r.question_key);
    const seconds = Math.round(rows.reduce((sum, r) => sum + r.time_spent_ms, 0) / 1000);

    // First, so the "no remaining set" checks below see the world without it.
    await tx`DELETE FROM drill_sets WHERE id = ${setId}::uuid AND user_id = ${userId}`;

    let srsEntries = 0;
    let annotations = 0;
    if (keys.length > 0) {
      const orphaned = await tx<{ question_key: string }[]>`
        SELECT k AS question_key FROM UNNEST(${keys}::text[]) AS k
        WHERE k NOT IN (
          SELECT dq.question_key FROM drill_questions dq
          JOIN drill_sets ds ON ds.id = dq.set_id
          WHERE ds.user_id = ${userId}
        )
      `;
      const orphanKeys = orphaned.map((r) => r.question_key);

      if (orphanKeys.length > 0) {
        const dropped = await tx`
          DELETE FROM srs_queue
          WHERE user_id = ${userId} AND question_key = ANY(${orphanKeys}::text[])
        `;
        srsEntries = dropped.count;

        const notes = await tx`
          DELETE FROM annotations
          WHERE user_id = ${userId} AND question_key = ANY(${orphanKeys}::text[])
        `;
        annotations = notes.count;
      }
    }

    if (day && seconds > 0) {
      await tx`
        UPDATE daily_time SET seconds = GREATEST(0, seconds - ${seconds})
        WHERE user_id = ${userId} AND day = ${day}::date
      `;
    }

    return { questions: keys.length, srsEntries, annotations, seconds };
  });
}

export async function markStarted(setId: string) {
  await run("UPDATE drill_sets SET started_at = COALESCE(started_at, now()) WHERE id = ?::uuid", [
    setId,
  ]);
}

export async function completeDrillSet(
  setId: string,
  results: { idx: number; isCorrect: boolean }[],
) {
  await sql().begin(async (tx) => {
    await tx`
      UPDATE drill_questions dq
      SET is_correct = p.is_correct::boolean
      FROM (
        SELECT * FROM UNNEST(
          ${results.map((r) => r.idx)}::int[],
          ${boolArray(results.map((r) => r.isCorrect))}::text[]
        ) AS t(idx, is_correct)
      ) p
      WHERE dq.set_id = ${setId}::uuid AND dq.idx = p.idx
    `;
    await tx`
      UPDATE drill_sets SET status = 'complete', completed_at = now() WHERE id = ${setId}::uuid
    `;
  });
}

export interface DrillSetSummary extends DrillSetRow {
  total: number;
  correct: number;
  answered: number;
  time_ms: number;
}

export async function listDrillSets(userId: string, limit = 50): Promise<DrillSetSummary[]> {
  const rows = await all<
    DrillSetRow & { total: string; correct: string; answered: string; time_ms: string }
  >(
    `SELECT ds.*,
            COUNT(dq.idx) AS total,
            COUNT(*) FILTER (WHERE dq.is_correct) AS correct,
            COUNT(*) FILTER (WHERE dq.user_answer IS NOT NULL AND dq.user_answer <> '') AS answered,
            COALESCE(SUM(dq.time_spent_ms), 0) AS time_ms
     FROM drill_sets ds
     LEFT JOIN drill_questions dq ON dq.set_id = ds.id
     WHERE ds.user_id = ?
     GROUP BY ds.id
     ORDER BY ds.created_at DESC
     LIMIT ?`,
    [userId, limit],
  );

  return rows.map((r) => ({
    ...r,
    total: Number(r.total),
    correct: Number(r.correct),
    answered: Number(r.answered),
    time_ms: Number(r.time_ms),
  }));
}

// ---------------------------------------------------------------------------
// Spaced repetition
// ---------------------------------------------------------------------------

const BOX_DAYS = [1, 3, 7, 21];

/**
 * Leitner update for a whole submitted set. A first-try-correct question never
 * enters the queue; a wrong answer resets to box 0; a correct answer on a
 * queued question advances a box and graduates out of the last one.
 */
export async function updateSrsBatch(
  userId: string,
  results: { questionKey: string; correct: boolean }[],
) {
  if (results.length === 0) return;

  await sql().begin(async (tx) => {
    await tx`
      INSERT INTO srs_queue (user_id, question_key, box, due_at, last_result, updated_at)
      SELECT ${userId}, p.question_key, 0,
             now() + (${BOX_DAYS[0]} || ' days')::interval, false, now()
      FROM (
        SELECT * FROM UNNEST(
          ${results.map((r) => r.questionKey)}::text[],
          ${boolArray(results.map((r) => r.correct))}::text[]
        ) AS t(question_key, correct)
      ) p
      WHERE p.correct::boolean = false
      ON CONFLICT (user_id, question_key) DO UPDATE SET
        box = 0,
        due_at = now() + (${BOX_DAYS[0]} || ' days')::interval,
        last_result = false,
        updated_at = now()
    `;

    // Correct answers only matter for questions already in the queue.
    await tx`
      UPDATE srs_queue s SET
        box = LEAST(s.box + 1, ${BOX_DAYS.length - 1}),
        due_at = now() + ((${BOX_DAYS}::int[])[LEAST(s.box + 1, ${BOX_DAYS.length - 1}) + 1] || ' days')::interval,
        last_result = true,
        updated_at = now()
      FROM (
        SELECT * FROM UNNEST(
          ${results.map((r) => r.questionKey)}::text[],
          ${boolArray(results.map((r) => r.correct))}::text[]
        ) AS t(question_key, correct)
      ) p
      WHERE s.user_id = ${userId} AND s.question_key = p.question_key AND p.correct::boolean = true
    `;

    // Graduated: answered correctly while already in the final box.
    await tx`
      DELETE FROM srs_queue
      WHERE user_id = ${userId} AND box >= ${BOX_DAYS.length - 1} AND last_result = true
    `;
  });
}

export async function dueSrsKeys(
  userId: string,
  assessmentId: number,
  module: ModuleKey,
  limit = 50,
): Promise<string[]> {
  // Joins through `questions` with the same is_live guard as availableQuestions.
  const rows = await all<{ question_key: string }>(
    `SELECT s.question_key
     FROM srs_queue s
     JOIN questions q ON q.key = s.question_key AND q.assessment_id = ? AND q.module = ?
     WHERE s.user_id = ? AND s.due_at <= now() AND q.is_live = false
     ORDER BY s.due_at ASC
     LIMIT ?`,
    [assessmentId, module, userId, limit],
  );
  return rows.map((r) => r.question_key);
}

export async function srsDueCount(userId: string): Promise<number> {
  const row = await get<{ n: string }>(
    `SELECT COUNT(DISTINCT s.question_key) AS n FROM srs_queue s
     JOIN questions q ON q.key = s.question_key
     WHERE s.user_id = ? AND s.due_at <= now() AND q.is_live = false`,
    [userId],
  );
  return Number(row?.n ?? 0);
}

// ---------------------------------------------------------------------------
// Stats
// ---------------------------------------------------------------------------

export interface OverallStats {
  module: ModuleKey;
  attempted: number;
  correct: number;
}

export async function overallStats(
  userId: string,
  assessmentId: number,
): Promise<OverallStats[]> {
  const rows = await all<{ module: ModuleKey; attempted: string; correct: string }>(
    `SELECT ds.module,
            COUNT(*) AS attempted,
            COUNT(*) FILTER (WHERE dq.is_correct) AS correct
     FROM drill_questions dq
     JOIN drill_sets ds ON ds.id = dq.set_id
     WHERE ds.user_id = ? AND ds.assessment_id = ? AND dq.is_correct IS NOT NULL
     GROUP BY ds.module`,
    [userId, assessmentId],
  );
  return rows.map((r) => ({
    module: r.module,
    attempted: Number(r.attempted),
    correct: Number(r.correct),
  }));
}

/** Median answer time per skill, for the rushed/slow flags on results. */
export async function skillMedians(
  userId: string,
  skillNames: string[],
): Promise<Map<string, number>> {
  if (skillNames.length === 0) return new Map();
  const rows = await all<{ skill_name: string; median_ms: string | null }>(
    `SELECT q.skill_name,
            percentile_cont(0.5) WITHIN GROUP (ORDER BY dq.time_spent_ms) AS median_ms
     FROM drill_questions dq
     JOIN drill_sets ds ON ds.id = dq.set_id
     JOIN questions q ON q.key = dq.question_key
                     AND q.assessment_id = ds.assessment_id
                     AND q.module = ds.module
     WHERE ds.user_id = ? AND q.skill_name = ANY(?) AND dq.time_spent_ms > 0
     GROUP BY q.skill_name`,
    [userId, skillNames],
  );
  return new Map(rows.map((r) => [r.skill_name, Number(r.median_ms ?? 0)]));
}

export async function dailyActivity(userId: string, days = 30) {
  const rows = await all<{ day: string; attempted: string; correct: string }>(
    `SELECT to_char(dq.answered_at AT TIME ZONE 'UTC', 'YYYY-MM-DD') AS day,
            COUNT(*) AS attempted,
            COUNT(*) FILTER (WHERE dq.is_correct) AS correct
     FROM drill_questions dq
     JOIN drill_sets ds ON ds.id = dq.set_id
     WHERE ds.user_id = ?
       AND dq.answered_at IS NOT NULL
       AND dq.answered_at >= now() - (? || ' days')::interval
     GROUP BY day ORDER BY day`,
    [userId, days],
  );
  return rows.map((r) => ({
    day: r.day,
    attempted: Number(r.attempted),
    correct: Number(r.correct),
  }));
}

// ---------------------------------------------------------------------------
// Annotations (passage highlights)
// ---------------------------------------------------------------------------

/**
 * A question's highlighted markup, one blob per region: the passage and the
 * question itself are both highlightable and are stored separately, since they
 * render into different panes. `html` is the passage's, under its original name
 * so rows written before the question was highlightable still load.
 */
export interface HighlightPayload {
  html?: string | null;
  stem?: string | null;
}

export async function saveHighlight(
  userId: string,
  questionKey: string,
  payload: HighlightPayload | null,
) {
  const empty = !payload || (!payload.html && !payload.stem);
  if (empty) {
    await run(
      "DELETE FROM annotations WHERE user_id = ? AND question_key = ? AND kind = 'highlight'",
      [userId, questionKey],
    );
    return;
  }
  await run(
    `INSERT INTO annotations (user_id, question_key, kind, payload)
     VALUES (?, ?, 'highlight', ?::text::jsonb)
     ON CONFLICT (user_id, question_key, kind) DO UPDATE SET payload = excluded.payload`,
    [userId, questionKey, JSON.stringify({ html: payload.html ?? null, stem: payload.stem ?? null })],
  );
}

export async function getHighlights(
  userId: string,
  questionKeys: string[],
): Promise<Record<string, HighlightPayload>> {
  if (questionKeys.length === 0) return {};
  const rows = await all<{ question_key: string; payload: HighlightPayload }>(
    `SELECT question_key, payload FROM annotations
     WHERE user_id = ? AND kind = 'highlight' AND question_key = ANY(?)`,
    [userId, questionKeys],
  );
  return Object.fromEntries(
    rows.map((r) => [
      r.question_key,
      { html: r.payload.html ?? null, stem: r.payload.stem ?? null },
    ]),
  );
}

// ---------------------------------------------------------------------------
// Settings and time on platform
// ---------------------------------------------------------------------------

export const DEFAULT_GOAL_MINUTES = 30;
export const MIN_GOAL_MINUTES = 5;
export const MAX_GOAL_MINUTES = 240;

/** Daily practice target in minutes, falling back to the default when unset. */
export async function getDailyGoal(userId: string): Promise<number> {
  const row = await get<{ daily_goal_minutes: number }>(
    "SELECT daily_goal_minutes FROM user_settings WHERE user_id = ?",
    [userId],
  );
  return row?.daily_goal_minutes ?? DEFAULT_GOAL_MINUTES;
}

export async function setDailyGoal(userId: string, minutes: number): Promise<number> {
  // Clamped rather than rejected: the column has a CHECK constraint, and a
  // slider that snaps to the nearest legal value beats a 500.
  const clamped = Math.min(
    MAX_GOAL_MINUTES,
    Math.max(MIN_GOAL_MINUTES, Math.round(minutes) || DEFAULT_GOAL_MINUTES),
  );
  await run(
    `INSERT INTO user_settings (user_id, daily_goal_minutes, updated_at)
     VALUES (?, ?, now())
     ON CONFLICT (user_id) DO UPDATE
       SET daily_goal_minutes = excluded.daily_goal_minutes, updated_at = now()`,
    [userId, clamped],
  );
  return clamped;
}

/**
 * Adds active seconds to a local day. `day` is the client's own YYYY-MM-DD so
 * the buckets line up with the calendar the student is looking at.
 */
export async function addDailyTime(userId: string, day: string, seconds: number): Promise<void> {
  if (seconds <= 0) return;
  await run(
    `INSERT INTO daily_time (user_id, day, seconds)
     VALUES (?, ?::date, ?)
     ON CONFLICT (user_id, day) DO UPDATE SET seconds = daily_time.seconds + excluded.seconds`,
    [userId, day, seconds],
  );
}

export interface DayTime {
  day: string;
  seconds: number;
}

/** Seconds per day over the last `days` days, most recent last. */
export async function dailyTime(userId: string, days = 182): Promise<DayTime[]> {
  const rows = await all<{ day: string; seconds: number }>(
    `SELECT to_char(day, 'YYYY-MM-DD') AS day, seconds
     FROM daily_time
     WHERE user_id = ? AND day >= (current_date - (? || ' days')::interval)
     ORDER BY day`,
    [userId, days],
  );
  return rows.map((r) => ({ day: r.day, seconds: Number(r.seconds) }));
}
