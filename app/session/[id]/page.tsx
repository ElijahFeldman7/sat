import { notFound, redirect } from "next/navigation";
import { ExamShell } from "@/components/exam/ExamShell";
import { requireUser } from "@/lib/session";
import { getDrillQuestions, getDrillSet, getHighlights } from "@/lib/db/queries";
import { loadDetails, toExamQuestion } from "@/lib/questions";
import type { ExamPayload } from "@/components/exam/types";

export const dynamic = "force-dynamic";

export default async function SessionPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const { id } = await params;

  // Two round trips instead of four: the set and its questions are independent
  // reads, as are the question bodies and this user's highlights.
  const [set, rows] = await Promise.all([getDrillSet(id, user.id), getDrillQuestions(id)]);

  if (!set) notFound();
  if (set.status === "complete") redirect(`/results/${id}`);

  const [details, highlights] = await Promise.all([
    loadDetails(rows),
    getHighlights(
      user.id,
      rows.map((r) => r.question_key),
    ),
  ]);

  const payload: ExamPayload = {
    set: {
      id: set.id,
      name: set.name,
      module: set.module,
      assessmentId: set.assessment_id,
      kind: set.kind,
      status: set.status,
      config: set.config,
      startedAt: set.started_at?.getTime() ?? null,
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
        body: detail ? toExamQuestion(detail) : null,
      };
    }),
  };

  return <ExamShell payload={payload} userName={user.name} highlights={highlights} />;
}
