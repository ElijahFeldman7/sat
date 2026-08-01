import type { NextRequest } from "next/server";
import { handle } from "@/lib/api";
import { requireUser } from "@/lib/session";
import {
  completeDrillSet,
  getDrillQuestions,
  getDrillSet,
  updateSrsBatch,
} from "@/lib/db/queries";
import { loadDetails } from "@/lib/questions";
import { gradeAnswer } from "@/lib/qbank/grade";

export const runtime = "nodejs";
export const maxDuration = 120;

export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const user = await requireUser();
    const { id } = await params;

    const [set, rows] = await Promise.all([getDrillSet(id, user.id), getDrillQuestions(id)]);
    if (!set) throw new Error("Drill set not found");

    const details = await loadDetails(rows);

    const results = rows.map((row) => {
      const detail = details.get(row.question_key);
      return {
        idx: row.idx,
        questionKey: row.question_key,
        isCorrect: detail ? gradeAnswer(row.user_answer, detail) : false,
      };
    });

    await completeDrillSet(id, results);

    // Wrong answers enter (or reset) the spaced-repetition queue; right ones
    // that were already queued advance a box.
    await updateSrsBatch(
      user.id,
      results.map((r) => ({ questionKey: r.questionKey, correct: r.isCorrect })),
    );

    return { correct: results.filter((r) => r.isCorrect).length, total: results.length };
  });
}
