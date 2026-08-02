"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { Card } from "@/components/Card";
import { localDay } from "@/lib/day";
import type { UserRow } from "@/lib/db/queries";
import { GoalHeatmap, type DayDatum } from "./GoalHeatmap";

const MIN = 5;
const MAX = 240;
const STEP = 5;

function fmtGoal(minutes: number): string {
  if (minutes < 60) return `${minutes} min`;
  const h = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest ? `${h}h ${rest}m` : `${h}h`;
}

function fmtSeconds(seconds: number): string {
  if (seconds < 60) return "—";
  return fmtGoal(Math.round(seconds / 60));
}

/** Stable per-user avatar tint, so the same person keeps the same colour. */
const TINTS = ["#384cc0", "#1d7a3e", "#b26a00", "#8a2d8a", "#0f6f86", "#c62828"];

function tint(id: string): string {
  let h = 0;
  for (const ch of id) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return TINTS[h % TINTS.length];
}

function initials(name: string | null, email: string | null): string {
  const source = name?.trim() || email?.trim() || "?";
  const parts = source.split(/[\s@._-]+/).filter(Boolean);
  return (parts[0]?.[0] ?? "?").toUpperCase() + (parts[1]?.[0]?.toUpperCase() ?? "");
}

export function SettingsView({
  initialGoal,
  data,
  serverTodaySeconds,
  users,
}: {
  initialGoal: number;
  data: DayDatum[];
  /** UTC-derived fallback, used only while hydrating. */
  serverTodaySeconds: number;
  users: UserRow[] | null;
}) {
  const [goal, setGoal] = useState(initialGoal);
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Debounced: dragging the slider fires an onChange per step, and each one
  // would otherwise be a round trip.
  useEffect(() => {
    if (goal === initialGoal && saveState === "idle") return;
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      setSaveState("saving");
      void fetch("/api/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dailyGoalMinutes: goal }),
      })
        .then((res) => {
          if (!res.ok) throw new Error("save failed");
          setSaveState("saved");
        })
        .catch(() => setSaveState("error"));
    }, 500);
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
    // saveState is deliberately not a dependency — it is set by this effect.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [goal, initialGoal]);

  /**
   * `daily_time` rows are keyed by the browser's local day, so only the browser
   * can pick today's. Served through useSyncExternalStore rather than an effect
   * so the hydrating render still matches what the server sent.
   */
  const todaySeconds = useSyncExternalStore(
    () => () => {},
    () => data.find((d) => d.day === localDay(Date.now()))?.seconds ?? 0,
    () => serverTodaySeconds,
  );

  const todayMinutes = Math.round(todaySeconds / 60);
  const pct = Math.min(100, Math.round((todayMinutes / goal) * 100));

  return (
    <div className="mx-auto w-full max-w-[880px] px-[20px] py-[24px] md:px-[40px] md:py-[34px]">
      <h1 className="text-[26px] font-bold leading-[1.15] tracking-[-0.02em] text-bb-ink md:text-[32px]">
        Settings
      </h1>

      <Card className="mt-[22px] p-[20px] md:p-[24px]">
        <div className="flex flex-wrap items-baseline justify-between gap-[8px]">
          <h2 className="text-[19px] font-bold text-bb-ink">Daily goal</h2>
          <span
            className={`text-[13px] ${saveState === "error" ? "text-[#c62828]" : "text-black/45"}`}
            role="status"
          >
            {saveState === "saving"
              ? "Saving…"
              : saveState === "saved"
                ? "Saved"
                : saveState === "error"
                  ? "Could not save"
                  : ""}
          </span>
        </div>
        <p className="mt-[6px] text-[15px] text-black/60">
          How long you want to spend practicing each day.
        </p>

        <div className="mt-[18px] flex items-center gap-[16px]">
          <input
            type="range"
            min={MIN}
            max={MAX}
            step={STEP}
            value={goal}
            onChange={(e) => setGoal(Number(e.target.value))}
            aria-label="Daily goal in minutes"
            aria-valuetext={fmtGoal(goal)}
            className="h-[4px] min-w-0 flex-1 accent-[#384cc0]"
          />
          <span className="w-[74px] shrink-0 text-right text-[22px] font-bold tabular-nums text-bb-ink">
            {fmtGoal(goal)}
          </span>
        </div>

        <div className="mt-[20px] border-t border-black/8 pt-[16px]">
          <div className="flex items-baseline justify-between text-[15px]">
            <span className="text-black/60">Today</span>
            <span className="tabular-nums text-bb-ink">
              {todayMinutes} of {goal} min
            </span>
          </div>
          <div className="mt-[8px] h-[10px] w-full overflow-hidden rounded-full bg-black/8">
            <div
              className="h-full rounded-full bg-bb-blue transition-[width]"
              style={{ width: `${pct}%` }}
            />
          </div>
        </div>
      </Card>

      <Card className="mt-[20px] p-[20px] md:p-[24px]">
        <h2 className="text-[19px] font-bold text-bb-ink">Goal history</h2>
        <p className="mt-[6px] text-[15px] text-black/60">
          Time on the platform each day, shaded against your goal.
        </p>
        <div className="mt-[18px]">
          <GoalHeatmap data={data} goalMinutes={goal} />
        </div>
      </Card>

      {users !== null && (
        <Card className="mt-[20px] p-[20px] md:p-[24px]">
          <div className="flex flex-wrap items-baseline justify-between gap-[8px]">
            <h2 className="text-[19px] font-bold text-bb-ink">Users</h2>
            <span className="text-[13px] tabular-nums text-black/45">
              {users.length.toLocaleString()} total
            </span>
          </div>
          <p className="mt-[6px] text-[15px] text-black/60">
            Everyone registered on the platform, newest first.
          </p>

          <div className="-mx-[20px] mt-[14px] overflow-x-auto px-[20px] md:mx-0 md:px-0 bb-scroll">
            <table className="w-full min-w-[560px] text-[15px]">
              <thead>
                <tr className="border-b border-black/12 text-left text-[13px] uppercase tracking-wide text-black/45">
                  <th className="pb-[8px] font-medium">Person</th>
                  <th className="w-[110px] pb-[8px] text-right font-medium">Joined</th>
                  <th className="w-[80px] pb-[8px] text-right font-medium">Drills</th>
                  <th className="w-[90px] pb-[8px] text-right font-medium">Time</th>
                </tr>
              </thead>
              <tbody>
                {users.map((u) => (
                  <tr key={u.id} className="border-b border-black/6">
                    <td className="py-[9px] pr-[12px]">
                      <span className="flex items-center gap-[10px]">
                        <span
                          aria-hidden
                          className="flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-full text-[12px] font-bold text-white"
                          style={{ background: tint(u.id) }}
                        >
                          {initials(u.name, u.email)}
                        </span>
                        <span className="min-w-0">
                          <span className="block truncate text-bb-ink">
                            {u.name ?? <span className="text-black/25">No name</span>}
                          </span>
                          <span className="block truncate text-[13px] text-black/50">
                            {u.email ?? "—"}
                          </span>
                        </span>
                      </span>
                    </td>
                    <td className="py-[9px] text-right tabular-nums text-black/60">{u.createdAt}</td>
                    <td className="py-[9px] text-right tabular-nums text-black/60">
                      {u.drillSets}
                    </td>
                    <td className="py-[9px] text-right tabular-nums text-black/60">
                      {fmtSeconds(u.seconds)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      <div className="h-[40px]" />
    </div>
  );
}
