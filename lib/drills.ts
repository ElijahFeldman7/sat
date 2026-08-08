import type { Difficulty, ModuleKey } from "@/lib/qbank/types";
import { MODULES } from "@/lib/qbank/types";
import {
  blueprintSlots,
  type BlueprintSlot,
  type ModuleBlueprint,
} from "@/lib/qbank/blueprint";
import {
  createDrillSet,
  dueSrsKeys,
  listCandidates,
  pickBalanced,
  skillStats,
  skillTimeMedians,
  topicTree,
  type CandidateRow,
  type DrillConfig,
} from "@/lib/db/queries";
import { all } from "@/lib/db/index";
import { loadDetails, type QuestionRef } from "@/lib/questions";
import { isGradable } from "@/lib/qbank/normalize";

export interface CreateDrillInput {
  assessmentId: number;
  module: ModuleKey;
  skills: string[];
  difficulties: Difficulty[];
  count: number;
  timingMode: DrillConfig["timingMode"];
  secondsPerQuestion?: number;
  totalSeconds?: number;
  secondsPerSkill?: Record<string, number>;
  includeLegacy: boolean;
  excludeSeen: boolean;
  kind?: string;
  name?: string;
}

/**
 * Per-question budgets for a set of questions, from the student's own medians.
 *
 * Used when the caller supplied none — Weak Spots and Review Misses are one
 * click with no pacing dialog, so without this they fell back to a flat 75s for
 * everyone. Keys are `skill|difficulty` where there is history at that
 * difficulty and `skill` otherwise, which is the order the exam reads them in.
 */
export async function medianBudgets(
  userId: string,
  assessmentId: number,
  module: ModuleKey,
  picked: { skill_name: string; difficulty: Difficulty }[],
): Promise<Record<string, number> | undefined> {
  const medians = await skillTimeMedians(userId, assessmentId, module);
  if (medians.length === 0) return undefined;

  const wanted = new Set(picked.map((p) => `${p.skill_name}|${p.difficulty}`));
  const skills = new Set(picked.map((p) => p.skill_name));

  const out: Record<string, number> = {};
  for (const m of medians) {
    if (m.difficulty === null) {
      if (skills.has(m.skill_name)) out[m.skill_name] = m.seconds;
    } else if (wanted.has(`${m.skill_name}|${m.difficulty}`)) {
      out[`${m.skill_name}|${m.difficulty}`] = m.seconds;
    }
  }
  return Object.keys(out).length ? out : undefined;
}

/** Wilson lower bound — ranks a 2/3 skill below a 40/60 one, as it should. */
export function wilsonLowerBound(correct: number, total: number): number {
  if (total === 0) return 0;
  const z = 1.96;
  const p = correct / total;
  const denom = 1 + (z * z) / total;
  const centre = p + (z * z) / (2 * total);
  const margin = z * Math.sqrt((p * (1 - p) + (z * z) / (4 * total)) / total);
  return (centre - margin) / denom;
}

/**
 * Picks `count` questions and fetches their bodies, replacing any that turn out
 * to be unfetchable or ungradable (some legacy disclosed items ship without an
 * answer key). Retries against the remaining pool until the count is met.
 */
async function pickGradable(candidates: CandidateRow[], count: number): Promise<CandidateRow[]> {
  const remaining = [...candidates];
  const chosen: CandidateRow[] = [];

  for (let round = 0; round < 4 && chosen.length < count && remaining.length > 0; round++) {
    const batch = pickBalanced(remaining, count - chosen.length);
    if (batch.length === 0) break;

    const batchKeys = new Set(batch.map((b) => b.key));
    for (let i = remaining.length - 1; i >= 0; i--) {
      if (batchKeys.has(remaining[i].key)) remaining.splice(i, 1);
    }

    const details = await loadDetails(batch);
    for (const candidate of batch) {
      const detail = details.get(candidate.key);
      if (detail && isGradable(detail)) chosen.push(candidate);
    }
  }

  return chosen.slice(0, count);
}

function defaultName(input: CreateDrillInput): string {
  const moduleName = MODULES[input.module].name;
  if (input.kind === "adaptive") return `Weak Spots · ${moduleName}`;
  if (input.kind === "srs") return `Review Misses · ${moduleName}`;
  if (input.skills.length === 1) return input.skills[0];
  if (input.skills.length === 0) return `Mixed ${moduleName}`;
  return `${input.skills.length} topics · ${moduleName}`;
}

/**
 * Selects questions, prefetches their bodies into the cache, and persists the
 * set. Question selection always runs through `listCandidates`, which excludes
 * live/active items.
 */
export async function createDrill(userId: string, input: CreateDrillInput) {
  const candidates = await listCandidates({
    assessmentId: input.assessmentId,
    module: input.module,
    skills: input.skills.length ? input.skills : undefined,
    difficulties: input.difficulties.length ? input.difficulties : undefined,
    includeLegacy: input.includeLegacy && input.module === "math",
    excludeSeenFor: input.excludeSeen ? userId : null,
  });

  if (candidates.length === 0) {
    throw new Error(
      "No questions match those filters. Try adding difficulties or turning off 'unseen only'.",
    );
  }

  const picked = await pickGradable(candidates, Math.min(input.count, candidates.length));

  if (picked.length === 0) {
    throw new Error("Could not load any questions from the question bank. Try again.");
  }

  const secondsPerSkill =
    input.secondsPerSkill ??
    (await medianBudgets(userId, input.assessmentId, input.module, picked));

  const config: DrillConfig = {
    timingMode: input.timingMode,
    secondsPerQuestion: input.secondsPerQuestion,
    totalSeconds: input.totalSeconds,
    secondsPerSkill,
    skills: input.skills,
    difficulties: input.difficulties,
    includeLegacy: input.includeLegacy,
    excludeSeen: input.excludeSeen,
  };

  const id = await createDrillSet({
    userId,
    name: input.name ?? defaultName(input),
    assessmentId: input.assessmentId,
    module: input.module,
    kind: input.kind ?? "topic",
    config,
    questionKeys: picked.map((p) => p.key),
  });

  return { id, count: picked.length, requested: input.count };
}

// ---------------------------------------------------------------------------
// Mock modules
// ---------------------------------------------------------------------------

const DIFFICULTY_ORDER: Difficulty[] = ["E", "M", "H"];

/**
 * Candidates bucketed by `domain|difficulty`, with each bucket dealt round-robin
 * across its skills.
 *
 * Without the interleave a domain's whole quota can land on one skill — eight
 * Craft and Structure questions that are all Words in Context is not what the
 * real module looks like, even though the domain total is right.
 */
/** How many of the least-recently-seen questions a repeat is drawn from. */
const RESAMPLE_WINDOW = 5;

const bucketKey = (skill: string, difficulty: Difficulty) => `${skill}|${difficulty}`;

/**
 * Buckets the pool by skill and difficulty, each bucket in the order a slot
 * should take from it: questions the student has never seen first, then the ones
 * seen longest ago.
 *
 * The repeat end is not strictly oldest-first. The oldest few are shuffled among
 * themselves, so a student who exhausts a thin skill — Cross-Text Connections
 * has a hundred-odd questions and a module wants one — does not get the same
 * question in the same place every time.
 */
function bucketPool(candidates: CandidateRow[]): Map<string, CandidateRow[]> {
  const buckets = new Map<string, CandidateRow[]>();
  for (const c of candidates) {
    const key = bucketKey(c.skill_name, c.difficulty);
    const bucket = buckets.get(key);
    if (bucket) bucket.push(c);
    else buckets.set(key, [c]);
  }

  for (const [key, bucket] of buckets) {
    const unseen = shuffle(bucket.filter((c) => !c.last_seen_at));
    const seen = bucket
      .filter((c) => c.last_seen_at)
      .sort((a, b) => a.last_seen_at!.getTime() - b.last_seen_at!.getTime());

    buckets.set(key, [
      ...unseen,
      ...shuffle(seen.slice(0, RESAMPLE_WINDOW)),
      ...seen.slice(RESAMPLE_WINDOW),
    ]);
  }
  return buckets;
}

function shuffle<T>(items: T[]): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/**
 * Which difficulties to try when the wanted one is exhausted: down first, then
 * up. A module that asks for a hard question and cannot get one is better served
 * by a medium than by an easy, and better by either than by dropping the skill.
 */
function difficultyLadder(want: Difficulty): Difficulty[] {
  const i = DIFFICULTY_ORDER.indexOf(want);
  return [...DIFFICULTY_ORDER.slice(0, i).reverse(), ...DIFFICULTY_ORDER.slice(i + 1)];
}

/**
 * Bucket keys to try for one slot, best first.
 *
 * The skill is what the blueprint is really asking for, so it is the last thing
 * given up: the exact cell, then the same skill at another difficulty, then a
 * sibling skill in the same domain, and only then anything at all. Inside a
 * bucket the ordering already prefers questions the student has not seen, so
 * repeating the one seen longest ago comes before changing the module's shape.
 */
function fallbackOrder(
  slot: ModuleSlot,
  skillsByDomain: Map<string, string[]>,
  allSkills: string[],
): string[] {
  const inDomain = skillsByDomain.get(slot.domain) ?? [];
  // A slot with no skill of its own — a Math blueprint, which only fixes the
  // domain — treats every skill in its domain as first choice.
  const own = slot.skill ? [slot.skill] : inDomain;
  const siblings = inDomain.filter((s) => !own.includes(s));
  const rest = allSkills.filter((s) => !own.includes(s) && !siblings.includes(s));
  const others = difficultyLadder(slot.difficulty);

  const tiers = [own, siblings, rest];
  return tiers.flatMap((skills) => [
    ...skills.map((s) => bucketKey(s, slot.difficulty)),
    ...skills.flatMap((s) => others.map((d) => bucketKey(s, d))),
  ]);
}

interface ModuleSlot extends BlueprintSlot {
  /** Math modules put a fixed share of grid-ins at the end of the module. */
  wantSpr: boolean;
}

/** Marks `sprShare` of the slots as student-produced, spread over the module. */
function markSprSlots(slots: BlueprintSlot[], sprShare: number): ModuleSlot[] {
  const target = Math.round(slots.length * sprShare);
  const picked = new Set<number>();
  const order = slots.map((_, i) => i).sort(() => Math.random() - 0.5);
  for (const i of order.slice(0, target)) picked.add(i);
  return slots.map((s, i) => ({ ...s, wantSpr: picked.has(i) }));
}

/**
 * Fills a blueprint's slots from the candidate pool.
 *
 * `taken` carries across calls so the retry pass — which runs after the bodies
 * come back and some turn out to be ungradable — never re-offers a question the
 * module already holds or has already rejected.
 */
function fillSlots(
  slots: ModuleSlot[],
  pool: Map<string, CandidateRow[]>,
  skillsByDomain: Map<string, string[]>,
  allSkills: string[],
  taken: Set<string>,
): (CandidateRow | null)[] {
  return slots.map((slot) => {
    const keys = fallbackOrder(slot, skillsByDomain, allSkills);

    /*
     * The bucket is the outer loop and the question type the inner one, so the
     * blueprint's own quota always outranks a preference for grid-in or
     * multiple-choice: within a bucket the wanted type wins, but wanting it is
     * never a reason to take a question from a different skill.
     *
     * Getting this the other way round is invisible against a warm cache — when
     * `known_type` is known for most of the pool the exact bucket satisfies the
     * strict pass anyway — and quietly wrecks the composition against a cold
     * one, where the handful of questions with a cached type get picked from
     * whatever skill happens to have them.
     */
    for (const key of keys) {
      const bucket = pool.get(key) ?? [];
      for (const strict of [true, false]) {
        for (const candidate of bucket) {
          if (taken.has(candidate.key)) continue;
          if (strict) {
            // An unknown type is a maybe: it loses the strict pass, and is
            // taken on the loose one.
            const isSpr = candidate.known_type === "spr";
            if (candidate.known_type === null || isSpr !== slot.wantSpr) continue;
          }
          taken.add(candidate.key);
          return candidate;
        }
      }
    }
    return null;
  });
}

/**
 * Builds one module of a digital SAT section against its published blueprint:
 * the right number of questions, split across content domains and difficulties
 * the way a real form is, ordered the way Bluebook orders them, on the real
 * clock.
 *
 * Questions come from the same pool every other drill draws on, and record
 * attempts the same way, so a mock module feeds topic accuracy, pacing medians
 * and the review queue exactly as a hand-built drill does.
 */
export async function createModuleDrill(
  userId: string,
  input: {
    assessmentId: number;
    blueprint: ModuleBlueprint;
    includeLegacy: boolean;
    excludeSeen: boolean;
  },
) {
  const { blueprint: bp } = input;

  /*
   * The whole pool, unfiltered and unsampled. A blueprint asks for a set number
   * of each skill, so a random truncation is exactly what would starve a small
   * quota; and questions the student has already seen are ranked rather than
   * excluded, so a thin skill can repeat its least-recent question instead of
   * being quietly replaced by a different skill.
   */
  const candidates = await listCandidates(
    {
      assessmentId: input.assessmentId,
      module: bp.module,
      includeLegacy: input.includeLegacy && bp.module === "math",
    },
    { limit: null, lastSeenFor: input.excludeSeen ? userId : null },
  );

  if (candidates.length < bp.questions) {
    throw new Error(
      `Not enough ${MODULES[bp.module].name} questions in the bank for a full module.`,
    );
  }

  const pool = bucketPool(candidates);
  const skillsByDomain = new Map<string, string[]>();
  for (const c of candidates) {
    const skills = skillsByDomain.get(c.domain_code) ?? [];
    if (!skills.includes(c.skill_name)) skills.push(c.skill_name);
    skillsByDomain.set(c.domain_code, skills);
  }
  const allSkills = [...new Set(candidates.map((c) => c.skill_name))];

  const slots = markSprSlots(blueprintSlots(bp), bp.sprShare);
  const taken = new Set<string>();

  const filled = fillSlots(slots, pool, skillsByDomain, allSkills, taken);
  const details = await loadDetails(filled.filter((c): c is CandidateRow => c !== null));

  /** A slot is only done when its question came back and can be scored. */
  const usableAt = (c: CandidateRow | null) => {
    const detail = c && details.get(c.key);
    return !!detail && isGradable(detail);
  };

  // Some items fail to fetch, and a few legacy ones ship with no answer key.
  // Re-run just the slots that came back unusable, against the same pool.
  for (let round = 0; round < 3; round++) {
    const bad = filled.map((c, i) => ({ c, i })).filter(({ c }) => !usableAt(c));
    if (bad.length === 0) break;

    const replacements = fillSlots(
      bad.map(({ i }) => slots[i]),
      pool,
      skillsByDomain,
      allSkills,
      taken,
    );
    const fresh = replacements.filter((c): c is CandidateRow => c !== null);
    if (fresh.length === 0) break;

    const more = await loadDetails(fresh);
    for (const [key, value] of more) details.set(key, value);
    bad.forEach(({ i }, n) => {
      if (replacements[n]) filled[i] = replacements[n];
    });
  }

  const usable = filled.filter((c): c is CandidateRow => usableAt(c));

  if (usable.length === 0) {
    throw new Error("Could not load any questions from the question bank. Try again.");
  }

  /*
   * On-screen order. Reading and Writing runs whole domains at a time and, inside
   * a domain, whole skills at a time in the sequence the real section uses —
   * Words in Context, then Text Structure and Purpose, then Cross-Text
   * Connections, and so on — easiest first within a skill. Math mixes domains,
   * climbs in difficulty, and keeps every grid-in for the end of the module,
   * which is exactly where Bluebook puts them.
   */
  const skillRank = new Map(
    bp.domains.flatMap((d) => (d.skills ?? []).map((s, i) => [s.name, i] as const)),
  );

  const ordered = [...usable].sort((a, b) => {
    if (bp.module === "rw") {
      const byDomain = bp.order.indexOf(a.domain_code) - bp.order.indexOf(b.domain_code);
      if (byDomain !== 0) return byDomain;
      const bySkill =
        (skillRank.get(a.skill_name) ?? 99) - (skillRank.get(b.skill_name) ?? 99);
      if (bySkill !== 0) return bySkill;
    } else {
      const aSpr = details.get(a.key)!.type === "spr";
      const bSpr = details.get(b.key)!.type === "spr";
      if (aSpr !== bSpr) return aSpr ? 1 : -1;
    }

    return (
      DIFFICULTY_ORDER.indexOf(a.difficulty) - DIFFICULTY_ORDER.indexOf(b.difficulty)
    );
  });

  const config: DrillConfig = {
    // One block for the whole module, like the real thing. No per-skill budgets:
    // the point of a mock is the test's pacing, not the student's usual pace.
    timingMode: "total",
    totalSeconds: bp.seconds,
    secondsPerQuestion: Math.round(bp.seconds / bp.questions),
    skills: [],
    difficulties: [],
    includeLegacy: input.includeLegacy,
    excludeSeen: input.excludeSeen,
    blueprintId: bp.id,
  };

  const id = await createDrillSet({
    userId,
    name: bp.label,
    assessmentId: input.assessmentId,
    module: bp.module,
    kind: "module",
    config,
    questionKeys: ordered.map((c) => c.key),
  });

  return { id, count: ordered.length, requested: bp.questions };
}

/** The skills to target for an adaptive drill, weakest first. */
export async function weakestSkills(
  userId: string,
  assessmentId: number,
  module: ModuleKey,
  limit = 4,
): Promise<string[]> {
  const stats = (await skillStats(userId, assessmentId, module)).filter((s) => s.attempted >= 3);

  if (stats.length >= 2) {
    return stats
      .map((s) => ({ name: s.skill_name, score: wilsonLowerBound(s.correct, s.attempted) }))
      .sort((a, b) => a.score - b.score)
      .slice(0, limit)
      .map((s) => s.name);
  }

  // Not enough history yet — target whatever hasn't been touched.
  const attempted = new Set(stats.map((s) => s.skill_name));
  const untouched = (
    await topicTree(userId, assessmentId, module, {
      includeLegacy: module === "math",
      excludeSeen: true,
    })
  )
    .flatMap((d) => d.skills)
    .filter((s) => !attempted.has(s.name) && s.available > 0)
    .map((s) => s.name);

  return untouched.slice(0, limit);
}

/** Builds an SRS drill from questions that are due today. */
export async function createSrsDrill(
  userId: string,
  assessmentId: number,
  module: ModuleKey,
  count: number,
  timing: Pick<
    CreateDrillInput,
    "timingMode" | "secondsPerQuestion" | "totalSeconds" | "secondsPerSkill"
  >,
) {
  const keys = await dueSrsKeys(userId, assessmentId, module, count);
  if (keys.length === 0) throw new Error("Nothing is due for review yet. Keep drilling!");

  // `is_live` is boolean; comparing it to 0 is a SQLite leftover that Postgres
  // rejects outright, which took every review drill down with it.
  const refs = await all<QuestionRef & { skill_name: string; difficulty: Difficulty }>(
    `SELECT key, source, external_id, ibn, skill_name, difficulty FROM questions
     WHERE is_live = false AND assessment_id = ? AND module = ?
       AND key IN (${keys.map(() => "?").join(",")})`,
    [assessmentId, module, ...keys],
  );

  const details = await loadDetails(refs);
  const usable = refs.filter((r) => {
    const detail = details.get(r.key);
    return detail && isGradable(detail);
  });
  if (usable.length === 0) throw new Error("Could not load the questions due for review.");

  const config: DrillConfig = {
    timingMode: timing.timingMode,
    secondsPerQuestion: timing.secondsPerQuestion,
    totalSeconds: timing.totalSeconds,
    secondsPerSkill:
      timing.secondsPerSkill ?? (await medianBudgets(userId, assessmentId, module, usable)),
    skills: [],
    difficulties: [],
    includeLegacy: true,
    excludeSeen: false,
  };

  const id = await createDrillSet({
    userId,
    name: `Review Misses · ${MODULES[module].name}`,
    assessmentId,
    module,
    kind: "srs",
    config,
    questionKeys: usable.map((r) => r.key),
  });

  return { id, count: usable.length, requested: count };
}
