"use client";

import { useMemo, useState } from "react";
import { localDay } from "@/lib/day";

/**
 * Sequential ramp for "how much of the goal was met", stepped from the app's
 * brand blue and validated as an ordinal ramp (monotone lightness, ≥0.06 ΔL
 * between steps, lightest step clears 2:1 on white).
 */
const RAMP = ["#95adfb", "#6d8af3", "#4a63e3", "#3244ba"];
/** Zero is not a step on the ramp — no practice is a different thing from a little. */
const EMPTY = "#e9e9ec";

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export interface DayDatum {
  day: string;
  seconds: number;
}

interface Cell {
  day: string;
  date: Date;
  minutes: number;
  /** 0 = nothing, 1–4 = ramp step. */
  level: number;
  metGoal: boolean;
}

function fmtMinutes(m: number): string {
  if (m <= 0) return "no practice";
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  const rest = m % 60;
  return rest ? `${h}h ${rest}m` : `${h}h`;
}

/**
 * Calendar heatmap of daily practice against the goal — weeks as columns, days
 * as rows, the way a contribution graph reads.
 *
 * Colour encodes the fraction of the goal reached rather than raw minutes, so
 * moving the slider re-reads the same history against the new target instead of
 * needing new data.
 */
export function GoalHeatmap({
  data,
  goalMinutes,
  weeks = 26,
}: {
  data: DayDatum[];
  goalMinutes: number;
  weeks?: number;
}) {
  const [hover, setHover] = useState<Cell | null>(null);

  const { columns, metCount, activeCount } = useMemo(() => {
    const byDay = new Map(data.map((d) => [d.day, d.seconds]));

    // End on the Saturday of the current week so the last column is complete.
    const end = new Date();
    end.setHours(0, 0, 0, 0);
    end.setDate(end.getDate() + (6 - end.getDay()));

    const days: Cell[] = [];
    const total = weeks * 7;
    for (let i = total - 1; i >= 0; i--) {
      const date = new Date(end);
      date.setDate(end.getDate() - i);
      const key = localDay(date);
      const minutes = Math.round((byDay.get(key) ?? 0) / 60);
      const ratio = goalMinutes > 0 ? minutes / goalMinutes : 0;
      const level =
        minutes <= 0 ? 0 : ratio < 0.5 ? 1 : ratio < 1 ? 2 : ratio < 1.5 ? 3 : 4;
      days.push({ day: key, date, minutes, level, metGoal: ratio >= 1 });
    }

    // A column is labelled when its week opens a month the previous column
    // didn't already cover — otherwise adjacent weeks both claim the same
    // month and it gets printed twice.
    const cols: { cells: Cell[]; month: string }[] = [];
    let lastMonth = -1;
    for (let i = 0; i < days.length; i += 7) {
      const cells = days.slice(i, i + 7);
      const month = cells[0].date.getMonth();
      const label = month !== lastMonth ? MONTHS[month] : "";
      if (label) lastMonth = month;
      cols.push({ cells, month: label });
    }

    const today = localDay(new Date());
    const past = days.filter((d) => d.day <= today);
    return {
      columns: cols,
      metCount: past.filter((d) => d.metGoal).length,
      activeCount: past.filter((d) => d.minutes > 0).length,
    };
  }, [data, goalMinutes, weeks]);

  return (
    <div>
      <div className="flex flex-wrap items-baseline gap-x-[10px] gap-y-[2px]">
        <span className="text-[34px] font-bold leading-none tabular-nums text-bb-ink">
          {metCount}
        </span>
        <span className="text-[16px] text-black/60">
          {metCount === 1 ? "day" : "days"} hit your goal
          {activeCount > 0 && ` · ${activeCount} ${activeCount === 1 ? "day" : "days"} practiced`}
        </span>
      </div>

      <div className="relative mt-[16px]">
        <div className="-mx-[4px] overflow-x-auto px-[4px] pb-[4px] bb-scroll">
          <div className="inline-flex gap-[3px]">
            <div className="mr-[4px] flex shrink-0 flex-col gap-[3px] pt-[18px]">
              {WEEKDAYS.map((d, i) => (
                <div
                  key={d}
                  className="h-[13px] text-[10px] leading-[13px] text-black/45"
                  aria-hidden="true"
                >
                  {i % 2 === 1 ? d : ""}
                </div>
              ))}
            </div>

            {columns.map((col) => {
              return (
                <div key={col.cells[0].day} className="flex shrink-0 flex-col gap-[3px]">
                  <div className="h-[18px] text-[10px] leading-[18px] text-black/45">
                    {col.month}
                  </div>
                  {col.cells.map((cell) => {
                    const future = cell.date > new Date();
                    return (
                      <button
                        key={cell.day}
                        type="button"
                        tabIndex={-1}
                        aria-label={`${cell.day}: ${fmtMinutes(cell.minutes)}${
                          cell.metGoal ? ", goal met" : ""
                        }`}
                        onMouseEnter={() => setHover(cell)}
                        onMouseLeave={() => setHover(null)}
                        onFocus={() => setHover(cell)}
                        onBlur={() => setHover(null)}
                        className="h-[13px] w-[13px] rounded-[3px] transition-transform hover:scale-125"
                        style={{
                          background: future
                            ? "transparent"
                            : cell.level === 0
                              ? EMPTY
                              : RAMP[cell.level - 1],
                          outline: cell.metGoal ? "1.5px solid #1e1e1e" : "none",
                          outlineOffset: "-1.5px",
                        }}
                      />
                    );
                  })}
                </div>
              );
            })}
          </div>
        </div>

        {hover && (
          <div
            role="status"
            className="pointer-events-none mt-[8px] inline-block rounded-[6px] bg-bb-ink px-[10px] py-[5px] text-[13px] text-white"
          >
            {hover.date.toLocaleDateString(undefined, {
              weekday: "short",
              month: "short",
              day: "numeric",
            })}{" "}
            — {fmtMinutes(hover.minutes)}
            {hover.metGoal && " · goal met"}
          </div>
        )}
      </div>

      {/* Legend */}
      <div className="mt-[14px] flex flex-wrap items-center gap-[10px] text-[12px] text-black/55">
        <span className="flex items-center gap-[4px]">
          Less
          <span className="h-[13px] w-[13px] rounded-[3px]" style={{ background: EMPTY }} />
          {RAMP.map((c) => (
            <span key={c} className="h-[13px] w-[13px] rounded-[3px]" style={{ background: c }} />
          ))}
          More
        </span>
        <span className="flex items-center gap-[5px]">
          <span
            className="h-[13px] w-[13px] rounded-[3px]"
            style={{ background: RAMP[2], outline: "1.5px solid #1e1e1e", outlineOffset: "-1.5px" }}
          />
          goal met
        </span>
      </div>
    </div>
  );
}
