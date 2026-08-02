/**
 * Answer grading.
 *
 * MCQ is an id/letter match. SPR follows the real SAT rule: an answer counts if
 * it equals an accepted key exactly, is numerically equal to one (so 65/4 and
 * 16.25 both pass), or truncates/rounds to one at that key's precision.
 */
import type { NormalizedQuestion } from "./types";

/** Strips formatting noise so "$1,200 " and "1200" compare equal. */
export function normalizeAnswerText(input: string): string {
  return input
    .trim()
    .toLowerCase()
    .replace(/[−–—]/g, "-") // unicode minus / dashes
    .replace(/[\s,$%]/g, "")
    .replace(/^\+/, "");
}

/** Parses a decimal, a fraction like "-3/17", or a mixed number. Null if not numeric. */
export function parseNumeric(input: string): number | null {
  const s = normalizeAnswerText(input);
  if (!s) return null;

  const fraction = /^(-?)(\d*\.?\d+)\/(\d*\.?\d+)$/.exec(s);
  if (fraction) {
    const denom = Number(fraction[3]);
    if (denom === 0) return null;
    const value = Number(fraction[2]) / denom;
    return fraction[1] === "-" ? -value : value;
  }

  if (!/^-?(\d+\.?\d*|\.\d+)$/.test(s)) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

function decimalPlaces(s: string): number {
  const dot = s.indexOf(".");
  return dot === -1 ? 0 : s.length - dot - 1;
}

function nearlyEqual(a: number, b: number): boolean {
  return Math.abs(a - b) <= 1e-9 * Math.max(1, Math.abs(a), Math.abs(b));
}

export function gradeSpr(userAnswer: string, correctKeys: string[]): boolean {
  const user = normalizeAnswerText(userAnswer);
  if (!user) return false;

  if (correctKeys.some((k) => normalizeAnswerText(k) === user)) return true;

  const userValue = parseNumeric(user);
  if (userValue === null) return false;

  const userPlaces = decimalPlaces(user);

  for (const key of correctKeys) {
    const keyValue = parseNumeric(key);
    if (keyValue === null) continue;
    if (nearlyEqual(userValue, keyValue)) return true;

    // Accept the student's extra precision: 0.17647 should match a .1764
    // (truncated) or .1765 (rounded) key.
    const places = decimalPlaces(normalizeAnswerText(key));
    if (places > 0) {
      const factor = 10 ** places;
      const truncated = Math.trunc(userValue * factor) / factor;
      const rounded = Math.round(userValue * factor) / factor;
      if (nearlyEqual(truncated, keyValue) || nearlyEqual(rounded, keyValue)) return true;
    }

    // The other direction, and the one the real exam actually specifies: the
    // key is exact — usually a fraction, so it has no decimal places of its own
    // — and the student gave the rounded or truncated decimal. -49/150 has to
    // accept -0.327 and -0.326. Three places is the exam's stated minimum for
    // an answer that does not terminate, so a lazier 0.33 for 1/3 stays wrong.
    if (userPlaces >= 3) {
      const factor = 10 ** userPlaces;
      const truncated = Math.trunc(keyValue * factor) / factor;
      const rounded = Math.round(keyValue * factor) / factor;
      if (nearlyEqual(truncated, userValue) || nearlyEqual(rounded, userValue)) return true;
    }
  }

  return false;
}

export function gradeMcq(userAnswer: string, question: NormalizedQuestion): boolean {
  if (!userAnswer) return false;
  if (question.correctKeys.includes(userAnswer)) return true;

  const chosen = question.options.find((o) => o.id === userAnswer);
  if (!chosen) return false;
  if (question.correctLetter && chosen.letter === question.correctLetter) return true;
  return question.correctKeys.includes(chosen.letter);
}

export function gradeAnswer(userAnswer: string | null, question: NormalizedQuestion): boolean {
  if (userAnswer == null || userAnswer === "") return false;
  return question.type === "spr"
    ? gradeSpr(userAnswer, question.correctKeys)
    : gradeMcq(userAnswer, question);
}
