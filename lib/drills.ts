import type { Difficulty, ModuleKey } from "@/lib/qbank/types";
import { MODULES } from "@/lib/qbank/types";
import {
  createDrillSet,
  dueSrsKeys,
  listCandidates,
  pickBalanced,
  skillStats,
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
  includeLegacy: boolean;
  excludeSeen: boolean;
  kind?: string;
  name?: string;
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

  const config: DrillConfig = {
    timingMode: input.timingMode,
    secondsPerQuestion: input.secondsPerQuestion,
    totalSeconds: input.totalSeconds,
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
  timing: Pick<CreateDrillInput, "timingMode" | "secondsPerQuestion" | "totalSeconds">,
) {
  const keys = await dueSrsKeys(userId, assessmentId, module, count);
  if (keys.length === 0) throw new Error("Nothing is due for review yet. Keep drilling!");

  const refs = await all<QuestionRef>(
    `SELECT key, source, external_id, ibn FROM questions
     WHERE is_live = 0 AND assessment_id = ? AND module = ?
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
