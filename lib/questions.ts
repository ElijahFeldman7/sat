import { fetchLegacyItem, fetchQuestion, mapConcurrent } from "@/lib/qbank/client";
import { normalizeLegacy, normalizeQBank } from "@/lib/qbank/normalize";
import type { NormalizedQuestion } from "@/lib/qbank/types";
import { cacheDetails, getCachedDetails } from "@/lib/db/queries";

export interface QuestionRef {
  key: string;
  source: string;
  external_id: string | null;
  ibn: string | null;
}

async function fetchDetail(ref: QuestionRef): Promise<NormalizedQuestion> {
  if (ref.source === "legacy" || !ref.external_id) {
    if (!ref.ibn) throw new Error(`Question ${ref.key} has neither external_id nor ibn`);
    return normalizeLegacy(ref.key, await fetchLegacyItem(ref.ibn));
  }
  return normalizeQBank(ref.key, await fetchQuestion(ref.external_id));
}

/**
 * Returns question bodies, hitting the cache first so review pages and past
 * sets never re-fetch (and stay stable if the bank changes).
 */
export async function loadDetails(refs: QuestionRef[]): Promise<Map<string, NormalizedQuestion>> {
  if (refs.length === 0) return new Map();

  const out = await getCachedDetails(refs.map((r) => r.key));
  const missing = refs.filter((r) => !out.has(r.key));
  if (missing.length === 0) return out;

  const results = await mapConcurrent(missing, fetchDetail, 10);
  const fetched: NormalizedQuestion[] = [];

  results.forEach((result, i) => {
    if (result.status === "fulfilled") {
      fetched.push(result.value);
      out.set(missing[i].key, result.value);
    } else {
      console.error(`Failed to fetch question ${missing[i].key}:`, result.reason);
    }
  });

  // One round trip for the whole batch.
  await cacheDetails(fetched);
  return out;
}

/** Body of a question with the answer stripped — what the exam UI receives. */
export interface ExamQuestion {
  key: string;
  type: "mcq" | "spr";
  stem: string;
  stimulus: string | null;
  options: { id: string; letter: string; html: string }[];
}

export function toExamQuestion(q: NormalizedQuestion): ExamQuestion {
  return {
    key: q.key,
    type: q.type,
    stem: q.stem,
    stimulus: q.stimulus,
    options: q.options,
  };
}
