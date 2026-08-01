import type { NextRequest } from "next/server";
import { handle } from "@/lib/api";
import { requireUser } from "@/lib/session";
import {
  getDrillQuestions,
  getDrillSet,
  markStarted,
  saveProgress,
  type ProgressPatch,
} from "@/lib/db/queries";
import { loadDetails, toExamQuestion } from "@/lib/questions";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const user = await requireUser();
    const { id } = await params;

    const [set, rows] = await Promise.all([getDrillSet(id, user.id), getDrillQuestions(id)]);
    if (!set) throw new Error("Drill set not found");

    const details = await loadDetails(rows);

    return {
      set: {
        id: set.id,
        name: set.name,
        module: set.module,
        assessmentId: set.assessment_id,
        kind: set.kind,
        status: set.status,
        config: set.config,
        startedAt: set.started_at,
      },
      questions: rows.map((row) => {
        const detail = details.get(row.question_key);
        return {
          idx: row.idx,
          key: row.question_key,
          skill: row.skill_name,
          domain: row.domain_name,
          difficulty: row.difficulty,
          userAnswer: row.user_answer,
          markedForReview: row.marked_for_review,
          crossedOut: row.crossed_out ?? [],
          timeSpentMs: row.time_spent_ms,
          // Correct answers are deliberately not sent to an active session.
          body: detail ? toExamQuestion(detail) : null,
        };
      }),
    };
  });
}

type PatchBody = ProgressPatch & { started?: boolean };

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const user = await requireUser();
    const { id } = await params;

    const set = await getDrillSet(id, user.id);
    if (!set) throw new Error("Drill set not found");

    const body = (await req.json()) as PatchBody | { updates: PatchBody[] };
    const updates = "updates" in body ? body.updates : [body];

    if (updates.some((u) => u.started)) await markStarted(id);
    await saveProgress(id, updates);

    return { ok: true };
  });
}
