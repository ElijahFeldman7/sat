import Link from "next/link";
import { AppShell } from "@/components/AppShell";
import { Card } from "@/components/Card";
import { requireUser } from "@/lib/session";
import { listDrillSets } from "@/lib/db/queries";
import { MODULES } from "@/lib/qbank/types";

export const dynamic = "force-dynamic";

function fmtDuration(ms: number): string {
  const total = Math.round(ms / 1000);
  const m = Math.floor(total / 60);
  return m > 0 ? `${m}m ${total % 60}s` : `${total}s`;
}

export default async function HistoryPage() {
  const user = await requireUser();
  const sets = await listDrillSets(user.id, 200);

  return (
    <AppShell active="/history" userName={user.name}>
      <div className="mx-auto w-full max-w-[1000px] px-[40px] py-[34px]">
        <h1 className="text-[32px] font-bold leading-[1.15] tracking-[-0.02em] text-bb-ink">
          Past sets
        </h1>

        {sets.length === 0 ? (
          <Card className="mt-[24px] p-[40px] text-center">
            <p className="text-[17px] text-black/60">You haven&rsquo;t built a drill yet.</p>
            <Link
              href="/drill/new"
              className="mt-[18px] inline-flex h-[42px] items-center rounded-full bg-bb-blue px-[24px] text-[16px] font-bold text-white hover:bg-bb-blue-hover"
            >
              Build your first drill
            </Link>
          </Card>
        ) : (
          <Card className="mt-[22px] divide-y divide-black/8">
            {sets.map((s) => {
              const done = s.status === "complete";
              const pct = done && s.total ? Math.round((s.correct / s.total) * 100) : null;
              return (
                <div key={s.id} className="flex items-center gap-[18px] px-[22px] py-[16px]">
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[17px] font-medium text-bb-ink">{s.name}</div>
                    <div className="mt-[3px] text-[14px] text-black/50">
                      {new Date(s.created_at).toLocaleString(undefined, {
                        month: "short",
                        day: "numeric",
                        hour: "numeric",
                        minute: "2-digit",
                      })}{" "}
                      · {MODULES[s.module].name} · {s.total} questions ·{" "}
                      {fmtDuration(s.time_ms ?? 0)}
                      {s.kind !== "topic" && ` · ${s.kind}`}
                    </div>
                  </div>

                  <div className="w-[92px] shrink-0 text-right">
                    {done ? (
                      <>
                        <div className="text-[18px] font-bold tabular-nums text-bb-ink">
                          {s.correct}/{s.total}
                        </div>
                        <div className="text-[13px] text-black/45">{pct}%</div>
                      </>
                    ) : (
                      <div className="text-[15px] text-black/50">
                        {s.answered}/{s.total} done
                      </div>
                    )}
                  </div>

                  <Link
                    href={done ? `/results/${s.id}` : `/session/${s.id}`}
                    className="shrink-0 rounded-full border border-bb-blue px-[18px] py-[8px] text-[14px] font-bold text-bb-blue hover:bg-bb-blue/5"
                  >
                    {done ? "Review" : "Resume"}
                  </Link>
                </div>
              );
            })}
          </Card>
        )}
      </div>
    </AppShell>
  );
}
