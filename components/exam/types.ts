import type { Difficulty, ModuleKey } from "@/lib/qbank/types";
import type { DrillConfig } from "@/lib/db/queries";

export interface ExamQuestionBody {
  key: string;
  type: "mcq" | "spr";
  stem: string;
  stimulus: string | null;
  options: { id: string; letter: string; html: string }[];
}

export interface ExamQuestionState {
  idx: number;
  key: string;
  skill: string;
  domain: string;
  difficulty: Difficulty;
  userAnswer: string | null;
  markedForReview: boolean;
  crossedOut: string[];
  timeSpentMs: number;
  body: ExamQuestionBody | null;
}

export interface ExamSet {
  id: string;
  name: string;
  module: ModuleKey;
  assessmentId: number;
  kind: string;
  status: string;
  config: DrillConfig;
  startedAt: number | null;
}

export interface ExamPayload {
  set: ExamSet;
  questions: ExamQuestionState[];
}
