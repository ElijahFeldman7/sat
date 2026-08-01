/**
 * Collapses the two question payload shapes (modern QBank + legacy disclosed
 * item) into one `NormalizedQuestion`.
 */
import type {
  NormalizedOption,
  NormalizedQuestion,
  RawDetailedQuestion,
  RawLegacyItem,
} from "./types";
import { LETTERS } from "./types";

/**
 * Whether an answer can actually be scored. A handful of legacy disclosed items
 * ship choices with no `correct_choice`, which would silently mark every
 * attempt wrong — those must never enter a drill.
 */
export function isGradable(q: NormalizedQuestion): boolean {
  return q.correctKeys.length > 0 || q.correctLetter !== null;
}

export function normalizeQBank(key: string, raw: RawDetailedQuestion): NormalizedQuestion {
  const options: NormalizedOption[] = (raw.answerOptions ?? []).map((opt, i) => ({
    id: opt.id,
    letter: LETTERS[i] ?? String(i + 1),
    html: opt.content,
  }));

  const type = raw.type === "spr" || options.length === 0 ? "spr" : "mcq";

  // mcq: `keys` holds the winning option id; `correct_answer` holds the letter.
  // spr: `keys` holds every accepted answer string.
  const correctKeys = raw.keys ?? [];
  let correctLetter: string | null = null;
  if (type === "mcq") {
    const byId = options.find((o) => correctKeys.includes(o.id));
    correctLetter = byId?.letter ?? raw.correct_answer?.[0] ?? null;
  }

  return {
    key,
    type,
    stem: raw.stem ?? "",
    stimulus: raw.stimulus ?? null,
    rationale: raw.rationale ?? "",
    options,
    correctKeys,
    correctLetter,
  };
}

export function normalizeLegacy(key: string, raw: RawLegacyItem): NormalizedQuestion {
  const choices = raw.answer?.choices ?? {};
  const letterKeys = Object.keys(choices).sort();

  const options: NormalizedOption[] = letterKeys.map((k, i) => ({
    id: k,
    letter: LETTERS[i] ?? k.toUpperCase(),
    html: choices[k].body,
  }));

  const type = options.length === 0 ? "spr" : "mcq";
  const correctChoice = raw.answer?.correct_choice ?? null;

  let correctKeys: string[] = [];
  let correctLetter: string | null = null;
  if (type === "mcq" && correctChoice) {
    const match = options.find((o) => o.id === correctChoice.toLowerCase());
    correctKeys = match ? [match.id] : [correctChoice];
    correctLetter = match?.letter ?? correctChoice.toUpperCase();
  } else if (correctChoice) {
    // Disclosed SPR items put the accepted answer(s) in correct_choice.
    correctKeys = correctChoice.split(",").map((s) => s.trim());
  }

  // Disclosed items keep the passage/setup in `body` and the question in `prompt`.
  return {
    key,
    type,
    stem: raw.prompt ?? "",
    stimulus: raw.body ?? null,
    rationale: raw.answer?.rationale ?? "",
    options,
    correctKeys,
    correctLetter,
  };
}
