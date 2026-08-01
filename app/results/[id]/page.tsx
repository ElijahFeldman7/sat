import { notFound, redirect } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import { requireUser } from "@/lib/session";
import { getDrillQuestions, getDrillSet, skillMedians } from "@/lib/db/queries";
import { loadDetails } from "@/lib/questions";
import { MODULES } from "@/lib/qbank/types";
import { ResultsView, type ResultQuestion } from "./ResultsView";

export const dynamic = "force-dynamic";

export default async function ResultsPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const { id } = await params;

  const [set, rows] = await Promise.all([getDrillSet(id, user.id), getDrillQuestions(id, user.id)]);

  if (!set) notFound();
  if (set.status !== "complete") redirect(`/session/${id}`);

  // Medians span this user's whole history, so the "slow"/"rushed" flags mean
  // something relative to their own pace. One query for every skill in the set.
  const [details, medians] = await Promise.all([
    loadDetails(rows),
    skillMedians(user.id, [...new Set(rows.map((r) => r.skill_name))]),
  ]);

  const questions: ResultQuestion[] = rows.map((row) => {
    const detail = details.get(row.question_key);
    const med = medians.get(row.skill_name) ?? 0;
    const isCorrect = row.is_correct === true;

    let pace: ResultQuestion["pace"] = null;
    if (med > 0 && row.time_spent_ms > 0) {
      if (row.time_spent_ms > med * 2) pace = "slow";
      else if (!isCorrect && row.time_spent_ms < med * 0.4) pace = "rushed";
    }

    const chosen = detail?.options.find((o) => o.id === row.user_answer);

    return {
      idx: row.idx,
      key: row.question_key,
      skill: row.skill_name,
      domain: row.domain_name,
      difficulty: row.difficulty,
      isCorrect,
      timeSpentMs: row.time_spent_ms,
      pace,
      userAnswer: row.user_answer,
      userAnswerLabel: chosen ? chosen.letter : row.user_answer,
      type: detail?.type ?? "mcq",
      stem: detail?.stem ?? "",
      stimulus: detail?.stimulus ?? null,
      rationale: detail?.rationale ?? "",
      options: detail?.options ?? [],
      correctKeys: detail?.correctKeys ?? [],
      correctLetter: detail?.correctLetter ?? null,
    };
  });

  const correct = questions.filter((q) => q.isCorrect).length;
  const totalMs = rows.reduce((n, r) => n + r.time_spent_ms, 0);

  return (
    <AppShell userName={user.name}>
      <ResultsView
        setId={set.id}
        name={set.name}
        moduleName={MODULES[set.module].name}
        correct={correct}
        total={questions.length}
        totalMs={totalMs}
        questions={questions}
      />
    </AppShell>
  );
}
