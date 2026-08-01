import Link from "next/link";
import { AppShell } from "@/components/AppShell";
import { Card } from "@/components/Card";
import { requireUser } from "@/lib/session";
import { ensureCatalog } from "@/lib/db/sync";
import { listDrillSets, overallStats, skillStats, srsDueCount } from "@/lib/db/queries";
import { wilsonLowerBound } from "@/lib/drills";
import { DEFAULT_ASSESSMENT_ID, MODULES, type ModuleKey } from "@/lib/qbank/types";
import { QuickDrillButton } from "./QuickDrillButton";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const user = await requireUser();
  await ensureCatalog();

  const assessmentId = DEFAULT_ASSESSMENT_ID;
  const [stats, due, recent, mathSkills, rwSkills] = await Promise.all([
    overallStats(user.id, assessmentId),
    srsDueCount(user.id),
    listDrillSets(user.id, 5),
    skillStats(user.id, assessmentId, "math"),
    skillStats(user.id, assessmentId, "rw"),
  ]);

  const weakest = (
    [
      ["math", mathSkills],
      ["rw", rwSkills],
    ] as [ModuleKey, typeof mathSkills][]
  )
    .flatMap(([m, skills]) =>
      skills
        .filter((s) => s.attempted >= 3)
        .map((s) => ({
          module: m,
          name: s.skill_name,
          accuracy: s.correct / s.attempted,
          score: wilsonLowerBound(s.correct, s.attempted),
        })),
    )
    .sort((a, b) => a.score - b.score)
    .slice(0, 3);

  const totalAttempted = stats.reduce((n, s) => n + s.attempted, 0);
  const totalCorrect = stats.reduce((n, s) => n + s.correct, 0);
  const activeSet = recent.find((s) => s.status === "active");

  return (
    <AppShell active="/dashboard" userName={user.name}>
      <div className="mx-auto w-full max-w-[1120px] px-[20px] py-[26px] md:px-[40px] md:py-[38px]">
        <h1 className="text-[26px] font-bold leading-[1.15] tracking-[-0.02em] text-bb-ink md:text-[34px]">
          {greeting()}, {user.name.split(" ")[0]}.
        </h1>
        <p className="mt-[8px] text-[16px] text-black/60 md:text-[17px]">
          {totalAttempted === 0
            ? "Start with a topic drill — pick the skills you want to work on."
            : `${totalCorrect} of ${totalAttempted} correct across all your practice (${Math.round(
                (totalCorrect / totalAttempted) * 100,
              )}%).`}
        </p>

        {activeSet && (
          <Card className="mt-[24px] flex flex-col gap-[14px] border-l-[5px] border-bb-blue px-[20px] py-[18px] sm:flex-row sm:items-center sm:justify-between sm:px-[24px]">
            <div className="min-w-0">
              <div className="text-[17px] font-bold text-bb-ink">
                You have a drill in progress
              </div>
              <div className="mt-[3px] truncate text-[15px] text-black/60">
                {activeSet.name} · {activeSet.answered} of {activeSet.total} answered
              </div>
            </div>
            <Link
              href={`/session/${activeSet.id}`}
              className="h-[40px] shrink-0 rounded-full bg-bb-blue px-[24px] text-center text-[16px] font-bold leading-[40px] text-white hover:bg-bb-blue-hover"
            >
              Resume
            </Link>
          </Card>
        )}

        {/* Primary actions */}
        <div className="mt-[26px] grid grid-cols-1 gap-[16px] sm:grid-cols-2 md:gap-[20px] lg:grid-cols-3">
          <Card className="flex flex-col p-[20px] sm:col-span-2 md:p-[24px] lg:col-span-1">
            <h2 className="text-[20px] font-bold text-bb-ink">Drill by Topic</h2>
            <p className="mt-[8px] flex-1 text-[15px] leading-[1.5] text-black/60">
              Choose any combination of skills and difficulties, then set your pacing.
            </p>
            <Link
              href="/drill/new"
              className="mt-[18px] inline-flex h-[42px] w-fit items-center rounded-full bg-bb-blue px-[22px] text-[16px] font-bold text-white hover:bg-bb-blue-hover"
            >
              Build a drill
            </Link>
          </Card>

          <Card className="flex flex-col p-[20px] md:p-[24px]">
            <h2 className="text-[20px] font-bold text-bb-ink">Weak Spots</h2>
            {weakest.length ? (
              <ul className="mt-[10px] flex-1 space-y-[6px] text-[15px] text-black/70">
                {weakest.map((w) => (
                  <li key={`${w.module}:${w.name}`} className="flex justify-between gap-3">
                    <span className="truncate">{w.name}</span>
                    <span className="shrink-0 tabular-nums text-black/50">
                      {Math.round(w.accuracy * 100)}%
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-[8px] flex-1 text-[15px] leading-[1.5] text-black/60">
                Answer a few questions and this will target whatever you&rsquo;re weakest at.
              </p>
            )}
            <QuickDrillButton
              className="mt-[18px]"
              label="Drill weak spots"
              body={{ kind: "adaptive", module: weakest[0]?.module ?? "math", count: 10 }}
            />
          </Card>

          <Card className="flex flex-col p-[20px] md:p-[24px]">
            <h2 className="text-[20px] font-bold text-bb-ink">Review Misses</h2>
            <p className="mt-[8px] flex-1 text-[15px] leading-[1.5] text-black/60">
              {due > 0
                ? `${due} question${due === 1 ? "" : "s"} you missed ${due === 1 ? "is" : "are"} due for another attempt.`
                : "Missed questions come back on a 1 / 3 / 7 / 21-day schedule."}
            </p>
            <QuickDrillButton
              className="mt-[18px]"
              label={due > 0 ? `Review ${Math.min(due, 15)} now` : "Nothing due"}
              disabled={due === 0}
              body={{ kind: "srs", module: "math", count: 15 }}
            />
          </Card>
        </div>

        {/* Module summary */}
        <div className="mt-[28px] grid grid-cols-1 gap-[16px] md:grid-cols-2 md:gap-[20px]">
          {(["math", "rw"] as ModuleKey[]).map((m) => {
            const s = stats.find((x) => x.module === m);
            const pct = s && s.attempted ? Math.round((s.correct / s.attempted) * 100) : null;
            return (
              <Card key={m} className="p-[20px] md:p-[24px]">
                <div className="flex items-baseline justify-between">
                  <h2 className="text-[19px] font-bold text-bb-ink">{MODULES[m].name}</h2>
                  <span className="text-[15px] text-black/50">
                    {s ? `${s.attempted} answered` : "not started"}
                  </span>
                </div>
                <div className="mt-[14px] h-[10px] w-full overflow-hidden rounded-full bg-black/8">
                  <div
                    className="h-full rounded-full bg-bb-blue transition-[width]"
                    style={{ width: `${pct ?? 0}%` }}
                  />
                </div>
                <div className="mt-[10px] text-[15px] text-black/60">
                  {pct === null ? "No attempts yet" : `${pct}% correct`}
                </div>
              </Card>
            );
          })}
        </div>

        {recent.length > 0 && (
          <div className="mt-[28px]">
            <div className="flex items-baseline justify-between">
              <h2 className="text-[20px] font-bold text-bb-ink">Recent sets</h2>
              <Link href="/history" className="text-[15px] text-bb-blue hover:underline">
                View all
              </Link>
            </div>
            <Card className="mt-[12px] divide-y divide-black/8">
              {recent.map((s) => (
                <Link
                  key={s.id}
                  href={s.status === "complete" ? `/results/${s.id}` : `/session/${s.id}`}
                  className="flex items-center justify-between gap-[12px] px-[18px] py-[15px] hover:bg-black/[0.02] md:px-[22px]"
                >
                  <div className="min-w-0">
                    <div className="truncate text-[16px] font-medium text-bb-ink">{s.name}</div>
                    <div className="mt-[2px] text-[14px] text-black/50">
                      {new Date(s.created_at).toLocaleDateString()} · {s.total} questions
                    </div>
                  </div>
                  <div className="shrink-0 pl-4 text-[16px] tabular-nums text-black/70">
                    {s.status === "complete" ? `${s.correct}/${s.total}` : "In progress"}
                  </div>
                </Link>
              ))}
            </Card>
          </div>
        )}
      </div>
    </AppShell>
  );
}

function greeting(): string {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 18) return "Good afternoon";
  return "Good evening";
}
