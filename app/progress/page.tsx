import { AppShell } from "@/components/AppShell";
import { Card } from "@/components/Card";
import { requireUser } from "@/lib/session";
import { ensureCatalog } from "@/lib/db/sync";
import { dailyActivity, overallStats, skillStats, srsDueCount, topicTree } from "@/lib/db/queries";
import { DEFAULT_ASSESSMENT_ID, MODULES, type ModuleKey } from "@/lib/qbank/types";

export const dynamic = "force-dynamic";

export default async function ProgressPage() {
  const user = await requireUser();
  await ensureCatalog();

  const assessmentId = DEFAULT_ASSESSMENT_ID;
  const [overall, activity, due, ...moduleData] = await Promise.all([
    overallStats(user.id, assessmentId),
    dailyActivity(user.id, 30),
    srsDueCount(user.id),
    ...(["math", "rw"] as ModuleKey[]).map(async (m) => ({
      module: m,
      stats: new Map(
        (await skillStats(user.id, assessmentId, m)).map((s) => [s.skill_name, s]),
      ),
      domains: await topicTree(user.id, assessmentId, m, {
        includeLegacy: m === "math",
        excludeSeen: false,
      }),
    })),
  ]);

  const modules = moduleData;

  const byDay = new Map(activity.map((a) => [a.day, a]));
  const days = Array.from({ length: 30 }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() - (29 - i));
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
      d.getDate(),
    ).padStart(2, "0")}`;
    return { key, ...(byDay.get(key) ?? { attempted: 0, correct: 0 }) };
  });
  const maxDay = Math.max(1, ...days.map((d) => d.attempted));

  return (
    <AppShell active="/progress" userName={user.name}>
      <div className="mx-auto w-full max-w-[1000px] px-[20px] py-[24px] md:px-[40px] md:py-[34px]">
        <h1 className="text-[26px] font-bold leading-[1.15] tracking-[-0.02em] text-bb-ink md:text-[32px]">
          Progress
        </h1>

        <div className="mt-[22px] grid grid-cols-1 gap-[16px] sm:grid-cols-2 md:gap-[20px] lg:grid-cols-3">
          {(["math", "rw"] as ModuleKey[]).map((m) => {
            const s = overall.find((x) => x.module === m);
            const pct = s?.attempted ? Math.round((s.correct / s.attempted) * 100) : 0;
            return (
              <Card key={m} className="flex items-center gap-[16px] p-[20px] md:gap-[20px] md:p-[24px]">
                <Ring pct={pct} />
                <div>
                  <div className="text-[17px] font-bold text-bb-ink">{MODULES[m].name}</div>
                  <div className="mt-[3px] text-[15px] text-black/55">
                    {s ? `${s.correct} of ${s.attempted} correct` : "No attempts yet"}
                  </div>
                </div>
              </Card>
            );
          })}
          <Card className="flex flex-col justify-center p-[20px] md:p-[24px]">
            <div className="text-[32px] font-bold leading-none tabular-nums text-bb-ink">
              {due}
            </div>
            <div className="mt-[6px] text-[15px] text-black/55">
              missed question{due === 1 ? "" : "s"} due for review
            </div>
          </Card>
        </div>

        {/* Activity strip */}
        <Card className="mt-[20px] p-[20px] md:p-[24px]">
          <h2 className="text-[19px] font-bold text-bb-ink">Last 30 days</h2>
          <div className="mt-[16px] flex items-end gap-[4px]">
            {days.map((d) => (
              <div
                key={d.key}
                title={`${d.key}: ${d.attempted} answered, ${d.correct} correct`}
                className="flex-1"
              >
                <div
                  className="w-full rounded-[2px] bg-bb-blue"
                  style={{
                    height: `${Math.max(d.attempted ? 4 : 2, (d.attempted / maxDay) * 60)}px`,
                    opacity: d.attempted ? 1 : 0.12,
                  }}
                />
              </div>
            ))}
          </div>
        </Card>

        {/* Per-skill tables */}
        {modules.map(({ module, domains, stats }) => (
          <Card key={module} className="mt-[20px] p-[20px] md:p-[24px]">
            <h2 className="text-[19px] font-bold text-bb-ink">{MODULES[module].name} by skill</h2>
            <div className="-mx-[20px] mt-[14px] overflow-x-auto px-[20px] md:mx-0 md:px-0 bb-scroll">
            <table className="w-full min-w-[520px] text-[15px]">
              <thead>
                <tr className="border-b border-black/12 text-left text-[13px] uppercase tracking-wide text-black/45">
                  <th className="pb-[8px] font-medium">Skill</th>
                  <th className="w-[90px] pb-[8px] text-right font-medium">Done</th>
                  <th className="w-[90px] pb-[8px] text-right font-medium">Correct</th>
                  <th className="w-[180px] pb-[8px] pl-[16px] font-medium">Accuracy</th>
                  <th className="w-[90px] pb-[8px] text-right font-medium">Avg time</th>
                </tr>
              </thead>
              <tbody>
                {domains.flatMap((domain) => [
                  <tr key={domain.code}>
                    <td
                      colSpan={5}
                      className="pt-[16px] pb-[6px] text-[13px] font-bold uppercase tracking-wide text-black/45"
                    >
                      {domain.name}
                    </td>
                  </tr>,
                  ...domain.skills.map((skill) => {
                    const stat = stats.get(skill.name);
                    const acc = stat?.attempted ? stat.correct / stat.attempted : null;
                    return (
                      <tr key={skill.name} className="border-b border-black/6">
                        <td className="py-[9px] pr-[12px] text-bb-ink">{skill.name}</td>
                        <td className="py-[9px] text-right tabular-nums text-black/60">
                          {stat?.attempted ?? 0}
                        </td>
                        <td className="py-[9px] text-right tabular-nums text-black/60">
                          {stat?.correct ?? 0}
                        </td>
                        <td className="py-[9px] pl-[16px]">
                          {acc === null ? (
                            <span className="text-black/25">—</span>
                          ) : (
                            <span className="flex items-center gap-[10px]">
                              <span className="h-[6px] flex-1 overflow-hidden rounded-full bg-black/10">
                                <span
                                  className="block h-full rounded-full"
                                  style={{
                                    width: `${acc * 100}%`,
                                    background:
                                      acc >= 0.8 ? "#1d7a3e" : acc >= 0.6 ? "#b26a00" : "#c62828",
                                  }}
                                />
                              </span>
                              <span className="w-[36px] text-right tabular-nums text-black/60">
                                {Math.round(acc * 100)}%
                              </span>
                            </span>
                          )}
                        </td>
                        <td className="py-[9px] text-right tabular-nums text-black/60">
                          {stat?.median_ms ? `${Math.round(stat.median_ms / 1000)}s` : "—"}
                        </td>
                      </tr>
                    );
                  }),
                ])}
              </tbody>
            </table>
            </div>
          </Card>
        ))}

        <div className="h-[40px]" />
      </div>
    </AppShell>
  );
}

function Ring({ pct }: { pct: number }) {
  const R = 26;
  const CIRC = 2 * Math.PI * R;
  const color = pct >= 80 ? "#1d7a3e" : pct >= 60 ? "#b26a00" : "#384cc0";
  return (
    <svg width="66" height="66" viewBox="0 0 66 66" className="shrink-0">
      <g transform="rotate(-90 33 33)">
        <circle cx="33" cy="33" r={R} fill="none" stroke="#e6e6e6" strokeWidth="7" />
        <circle
          cx="33"
          cy="33"
          r={R}
          fill="none"
          stroke={color}
          strokeWidth="7"
          strokeLinecap="round"
          strokeDasharray={CIRC}
          strokeDashoffset={CIRC * (1 - pct / 100)}
        />
      </g>
      <text
        x="33"
        y="38"
        textAnchor="middle"
        fontSize="17"
        fontWeight="700"
        fill="#1e1e1e"
      >
        {pct}
      </text>
    </svg>
  );
}
