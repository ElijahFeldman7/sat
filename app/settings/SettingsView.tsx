"use client";

import { useEffect, useRef, useState } from "react";
import { Card } from "@/components/Card";
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

export function SettingsView({
  initialGoal,
  data,
  todaySeconds,
  userCount,
}: {
  initialGoal: number;
  data: DayDatum[];
  todaySeconds: number;
  userCount: number | null;
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
          How long you want to spend practising each day.
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

      {userCount !== null && (
        <Card className="mt-[20px] p-[20px] md:p-[24px]">
          <h2 className="text-[19px] font-bold text-bb-ink">Users</h2>
          <p className="mt-[6px] text-[15px] text-black/60">
            Total accounts registered on the platform.
          </p>
          <p className="mt-[14px] text-[32px] font-bold tabular-nums leading-none text-bb-ink">
            {userCount.toLocaleString()}
          </p>
        </Card>
      )}

      <div className="h-[40px]" />
    </div>
  );
}
