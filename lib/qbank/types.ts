/**
 * Types mirroring the College Board QBank API, ported from
 * ../projects/collegeboard-qbank-api/schemas.py
 */

export type ModuleKey = "math" | "rw";
export type Difficulty = "E" | "M" | "H";
export type QuestionType = "mcq" | "spr";
export type QuestionSource = "qbank" | "legacy";

/** asmtEventId values returned by the lookup endpoint. */
export const ASSESSMENTS = [
  { id: 99, name: "SAT", short: "SAT" },
  { id: 100, name: "PSAT/NMSQT & PSAT 10", short: "PSAT/NMSQT" },
  { id: 102, name: "PSAT 8/9", short: "PSAT 8/9" },
] as const;

export const DEFAULT_ASSESSMENT_ID = 99;

/** `test` values for the get-questions endpoint. */
export const MODULES: Record<ModuleKey, { testId: number; name: string; lookupKey: string }> = {
  rw: { testId: 1, name: "Reading and Writing", lookupKey: "R&W" },
  math: { testId: 2, name: "Math", lookupKey: "Math" },
};

export const DIFFICULTY_LABELS: Record<Difficulty, string> = {
  E: "Easy",
  M: "Medium",
  H: "Hard",
};

export interface Skill {
  id: number;
  name: string;
}

export interface Domain {
  id: number;
  /** Human-readable, e.g. "Algebra". Matches `primary_class_cd_desc` on summaries. */
  name: string;
  /** `primaryClassCd`, e.g. "H". This is what get-questions wants in `domain`. */
  code: string;
  skills: Skill[];
}

export interface Catalog {
  domains: Record<ModuleKey, Domain[]>;
  liveItems: Record<ModuleKey, Set<string>>;
}

/** One row from get-questions. */
export interface QuestionSummary {
  external_id: string | null;
  ibn: string | null;
  uId: string;
  questionId: string;
  primary_class_cd: string;
  primary_class_cd_desc: string;
  skill_cd: string;
  skill_desc: string;
  difficulty: Difficulty;
  score_band_range_cd: number;
  createDate: number;
  updateDate: number;
}

export interface AnswerOption {
  id: string;
  content: string;
}

/** Raw get-question response. */
export interface RawDetailedQuestion {
  type: QuestionType;
  stem: string;
  stimulus?: string | null;
  rationale: string;
  keys: string[];
  answerOptions?: AnswerOption[] | null;
  correct_answer?: string[] | null;
  externalid?: string;
}

/** Raw disclosed-item response from saic.collegeboard.org. */
export interface RawLegacyItem {
  item_id: string;
  section: string;
  prompt: string;
  body?: string | null;
  answer: {
    style: string;
    choices?: Record<string, { body: string }> | null;
    correct_choice?: string | null;
    rationale: string;
  };
}

export interface NormalizedOption {
  /** Stable id used as the stored answer value. */
  id: string;
  /** A / B / C / D */
  letter: string;
  html: string;
}

/**
 * One canonical shape covering both the modern QBank payload and the
 * legacy disclosed-item payload.
 */
export interface NormalizedQuestion {
  key: string;
  type: QuestionType;
  stem: string;
  stimulus: string | null;
  rationale: string;
  options: NormalizedOption[];
  /** For mcq: option ids and/or letters. For spr: accepted answer strings. */
  correctKeys: string[];
  /** Letter of the correct choice when known (mcq only). */
  correctLetter: string | null;
}

export const LETTERS = ["A", "B", "C", "D", "E", "F"];
