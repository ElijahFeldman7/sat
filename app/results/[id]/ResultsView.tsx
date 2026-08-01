"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Card } from "@/components/Card";
import { ChoiceList } from "@/components/exam/ChoiceList";
import { QuestionHtml } from "@/components/exam/QuestionHtml";
import { SprInput } from "@/components/exam/SprInput";
import { ChevronDown } from "@/components/exam/icons";
import { DIFFICULTY_LABELS, type Difficulty } from "@/lib/qbank/types";

export interface ResultQuestion {
  idx: number;
  key: string;
  skill: string;
  domain: string;
  difficulty: Difficulty;
  isCorrect: boolean;
  timeSpentMs: number;
  pace: "slow" | "rushed" | null;
  userAnswer: string | null;
  userAnswerLabel: string | null;
  type: "mcq" | "spr";
  stem: string;
  stimulus: string | null;
  rationale: string;
  options: { id: string; letter: string; html: string }[];
  correctKeys: string[];
  correctLetter: string | null;
}

function fmtDuration(ms: number): string {
  const total = Math.round(ms / 1000);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return m > 0 ? `${m}m ${s}s` : `${s}s`;
}

export function ResultsView({
  setId,
  name,
  moduleName,
  correct,
  total,
  totalMs,
  questions,
}: {
  setId: string;
  name: string;
  moduleName: string;
  correct: number;
  total: number;
  totalMs: number;
  questions: ResultQuestion[];
}) {
  const [revealed, setRevealed] = useState<Set<number>>(new Set());

  const bySkill = useMemo(() => {
    const map = new Map<string, { correct: number; total: number }>();
    for (const q of questions) {
      const entry = map.get(q.skill) ?? { correct: 0, total: 0 };
      entry.total++;
      if (q.isCorrect) entry.correct++;
      map.set(q.skill, entry);
    }
    return [...map.entries()].sort((a, b) => a[1].correct / a[1].total - b[1].correct / b[1].total);
  }, [questions]);

  const flagged = questions.filter((q) => q.pace);
  const pct = total ? Math.round((correct / total) * 100) : 0;

  function toggle(idx: number) {
    setRevealed((prev) => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx);
      else next.add(idx);
      return next;
    });
  }

  const allRevealed = revealed.size === questions.length;

  return (
    <div className="mx-auto w-full max-w-[1000px] px-[20px] py-[24px] md:px-[40px] md:py-[34px]">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-[24px] font-bold leading-[1.15] tracking-[-0.02em] text-bb-ink md:text-[32px]">
            {name}
          </h1>
          <p className="mt-[6px] text-[16px] text-black/55">
            {moduleName} · {fmtDuration(totalMs)} · {fmtDuration(totalMs / Math.max(1, total))} per
            question
          </p>
        </div>
        <div className="text-right">
          <div className="text-[34px] font-bold leading-none tabular-nums text-bb-ink md:text-[42px]">
            {correct}
            <span className="text-black/35">/{total}</span>
          </div>
          <div className="mt-[4px] text-[16px] text-black/55">{pct}% correct</div>
        </div>
      </div>

      {/* Per-skill breakdown */}
      <Card className="mt-[24px] p-[18px] md:p-[24px]">
        <h2 className="text-[19px] font-bold text-bb-ink">By topic</h2>
        <ul className="mt-[14px] space-y-[11px]">
          {bySkill.map(([skill, s]) => {
            const acc = s.correct / s.total;
            return (
              <li key={skill} className="flex items-center gap-[14px]">
                <span className="min-w-0 flex-1 truncate text-[15px] text-bb-ink">{skill}</span>
                <span className="hidden h-[7px] w-[120px] overflow-hidden rounded-full bg-black/10 sm:block lg:w-[180px]">
                  <span
                    className="block h-full rounded-full"
                    style={{
                      width: `${acc * 100}%`,
                      background: acc >= 0.8 ? "#1d7a3e" : acc >= 0.6 ? "#b26a00" : "#c62828",
                    }}
                  />
                </span>
                <span className="w-[52px] text-right text-[15px] tabular-nums text-black/60">
                  {s.correct}/{s.total}
                </span>
              </li>
            );
          })}
        </ul>
      </Card>

      {flagged.length > 0 && (
        <Card className="mt-[20px] p-[18px] md:p-[24px]">
          <h2 className="text-[19px] font-bold text-bb-ink">Pacing flags</h2>
          <ul className="mt-[12px] space-y-[8px] text-[15px]">
            {flagged.map((q) => (
              <li key={q.idx} className="flex items-center gap-[10px]">
                <span
                  className={`rounded-full px-[9px] py-[2px] text-[12px] font-bold uppercase tracking-wide ${
                    q.pace === "slow"
                      ? "bg-[#fff2dd] text-[#8a5200]"
                      : "bg-[#fdecec] text-[#c62828]"
                  }`}
                >
                  {q.pace}
                </span>
                <span className="text-bb-ink">Question {q.idx + 1}</span>
                <span className="text-black/50">
                  {q.skill} · {fmtDuration(q.timeSpentMs)}
                </span>
              </li>
            ))}
          </ul>
          <p className="mt-[12px] text-[14px] text-black/45">
            &ldquo;Slow&rdquo; is over 2× your median for that topic; &ldquo;rushed&rdquo; is a
            wrong answer in under 40% of it.
          </p>
        </Card>
      )}

      {/* Question review */}
      <div className="mt-[30px] flex items-baseline justify-between">
        <h2 className="text-[22px] font-bold text-bb-ink">Review questions</h2>
        <button
          type="button"
          onClick={() =>
            setRevealed(allRevealed ? new Set() : new Set(questions.map((q) => q.idx)))
          }
          className="text-[15px] text-bb-blue hover:underline"
        >
          {allRevealed ? "Hide all answers" : "Reveal all answers"}
        </button>
      </div>
      <p className="mt-[4px] text-[15px] text-black/50">
        Answers and explanations stay hidden until you ask for them — try the question again first.
      </p>

      <div className="mt-[16px] space-y-[14px] pb-[50px]">
        {questions.map((q) => {
          const open = revealed.has(q.idx);
          const correctIds = q.options
            .filter((o) => q.correctKeys.includes(o.id) || o.letter === q.correctLetter)
            .map((o) => o.id);

          return (
            <Card key={q.idx} className="overflow-hidden">
              <div className="flex items-center gap-[14px] border-b border-black/8 px-[22px] py-[14px]">
                <span
                  className={`flex h-[28px] w-[28px] shrink-0 items-center justify-center rounded-full text-[15px] font-bold text-white ${
                    q.isCorrect ? "bg-[#1d7a3e]" : "bg-[#c62828]"
                  }`}
                >
                  {q.idx + 1}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[16px] font-medium text-bb-ink">{q.skill}</div>
                  <div className="mt-[2px] text-[13px] text-black/45">
                    {q.domain} · {DIFFICULTY_LABELS[q.difficulty]} · {fmtDuration(q.timeSpentMs)}
                    {q.userAnswerLabel ? ` · you answered ${q.userAnswerLabel}` : " · skipped"}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => toggle(q.idx)}
                  className="flex shrink-0 items-center gap-[7px] rounded-full border border-bb-blue px-[16px] py-[7px] text-[14px] font-bold text-bb-blue hover:bg-bb-blue/5"
                >
                  {open ? "Hide" : "Reveal answer & explanation"}
                  <ChevronDown
                    className={`h-[14px] w-[14px] transition-transform ${open ? "rotate-180" : ""}`}
                  />
                </button>
              </div>

              <div className="px-[22px] py-[20px]">
                {q.stimulus && (
                  <div className="mb-[18px] border-l-[3px] border-black/12 pl-[16px]">
                    <QuestionHtml html={q.stimulus} />
                  </div>
                )}
                <QuestionHtml html={q.stem} />

                <div className="mt-[18px]">
                  {q.type === "mcq" ? (
                    <ChoiceList
                      options={q.options}
                      selected={q.userAnswer}
                      crossedOut={[]}
                      crossOutMode={false}
                      onSelect={() => {}}
                      onToggleCrossOut={() => {}}
                      reveal={open}
                      correctIds={open ? correctIds : []}
                    />
                  ) : (
                    <SprInput
                      value={q.userAnswer ?? ""}
                      onChange={() => {}}
                      reveal={open}
                      correctKeys={open ? q.correctKeys : []}
                      isCorrect={q.isCorrect}
                    />
                  )}
                </div>

                {open && q.rationale && (
                  <div className="mt-[22px] rounded-[8px] bg-bb-strip p-[18px]">
                    <h3 className="mb-[10px] text-[15px] font-bold uppercase tracking-wide text-black/55">
                      Explanation
                    </h3>
                    <QuestionHtml html={q.rationale} />
                  </div>
                )}
              </div>
            </Card>
          );
        })}
      </div>

      <div className="flex gap-[14px] pb-[50px]">
        <Link
          href="/drill/new"
          className="h-[46px] rounded-full bg-bb-blue px-[26px] text-[16px] font-bold leading-[46px] text-white hover:bg-bb-blue-hover"
        >
          New drill
        </Link>
        <Link
          href="/history"
          className="h-[46px] rounded-full border border-black/20 px-[26px] text-[16px] font-bold leading-[46px] text-bb-ink hover:bg-black/5"
        >
          Past sets
        </Link>
        <span className="sr-only">{setId}</span>
      </div>
    </div>
  );
}
