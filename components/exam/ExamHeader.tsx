"use client";

import { CalculatorIcon, ChevronDown, HighlightIcon, MoreIcon, NotesIcon } from "./icons";
import { PacingIndicator } from "./PacingIndicator";

function formatClock(ms: number): string {
  const total = Math.max(0, Math.round(ms / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

export function ExamHeader({
  title,
  clockMs,
  clockHidden,
  onToggleClock,
  pacing,
  showCalculator,
  calculatorOpen,
  onToggleCalculator,
  onToggleDirections,
  highlightsOn,
  onToggleHighlights,
  onMore,
}: {
  title: string;
  clockMs: number;
  clockHidden: boolean;
  onToggleClock: () => void;
  pacing: { elapsedMs: number; budgetMs: number } | null;
  showCalculator: boolean;
  calculatorOpen: boolean;
  onToggleCalculator: () => void;
  onToggleDirections: () => void;
  highlightsOn: boolean;
  onToggleHighlights: () => void;
  onMore: () => void;
}) {
  return (
    <header className="bb-dash-b relative z-30 flex h-[78px] shrink-0 items-stretch bg-bb-band">
      {/* Left: section title + directions */}
      <div className="flex w-[34%] flex-col justify-center pl-[43px]">
        <h1 className="text-[22px] font-bold leading-[1.15] tracking-[-0.01em] text-bb-ink">
          {title}
        </h1>
        <button
          type="button"
          onClick={onToggleDirections}
          className="mt-[2px] flex w-fit items-center gap-[5px] text-[16px] leading-none text-bb-ink hover:underline"
        >
          Directions
          <ChevronDown className="h-[15px] w-[15px]" />
        </button>
      </div>

      {/* Center: clock + hide toggle + pacing */}
      <div className="flex flex-1 flex-col items-center justify-center">
        <div
          className={`text-[26px] font-normal leading-[1.1] tabular-nums text-bb-ink ${
            clockHidden ? "invisible" : ""
          }`}
        >
          {formatClock(clockMs)}
        </div>
        <div className="mt-[3px] flex items-center gap-[10px]">
          <button
            type="button"
            onClick={onToggleClock}
            className="rounded-full border border-bb-ink px-[13px] py-[2px] text-[14px] font-medium leading-[1.4] text-bb-ink hover:bg-white"
          >
            {clockHidden ? "Show" : "Hide"}
          </button>
          {pacing && <PacingIndicator {...pacing} />}
        </div>
      </div>

      {/* Right: tools */}
      <div className="flex w-[34%] items-center justify-end gap-[26px] pr-[40px]">
        {showCalculator && (
          <button
            type="button"
            onClick={onToggleCalculator}
            className={`flex flex-col items-center gap-[3px] text-[13px] leading-none ${
              calculatorOpen ? "text-bb-blue" : "text-bb-ink"
            }`}
            title="Calculator (K)"
          >
            <CalculatorIcon className="h-[21px] w-[21px]" />
            Calculator
          </button>
        )}
        <button
          type="button"
          onClick={onToggleHighlights}
          className={`flex flex-col items-center gap-[3px] text-[13px] leading-none ${
            highlightsOn ? "text-bb-blue" : "text-bb-ink"
          }`}
          title="Highlights &amp; Notes (H)"
        >
          <span className="flex items-end gap-[6px]">
            <HighlightIcon className="h-[21px] w-[21px]" />
            <NotesIcon className="h-[20px] w-[20px]" />
          </span>
          Highlights &amp; Notes
        </button>
        <button
          type="button"
          onClick={onMore}
          className="flex flex-col items-center gap-[3px] text-[13px] leading-none text-bb-ink"
        >
          <MoreIcon className="h-[21px] w-[21px]" />
          More
        </button>
      </div>
    </header>
  );
}
