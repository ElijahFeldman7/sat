"use client";

import { CalculatorIcon, ChevronDown, HighlightIcon, MoreIcon, NotesIcon } from "./icons";
import { MoreMenu, type MoreMenuItem } from "./MoreMenu";
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
  moreOpen,
  onToggleMore,
  moreItems,
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
  moreOpen: boolean;
  onToggleMore: () => void;
  moreItems: MoreMenuItem[];
}) {
  return (
    <header className="bb-dash-b relative z-30 flex h-[78px] shrink-0 items-stretch bg-bb-band">
      {/* Left: section title + directions */}
      <div className="flex min-w-0 flex-col justify-center pl-[18px] md:w-[32%] md:pl-[48px]">
        <h1 className="truncate text-[16px] font-medium leading-[1.15] tracking-[-0.01em] text-bb-ink md:text-[19px]">
          {title}
        </h1>
        <button
          type="button"
          onClick={onToggleDirections}
          className="mt-[10px] flex w-fit items-center gap-[5px] text-[13px] font-medium leading-none text-bb-ink hover:underline md:mt-[13px] md:text-[15px]"
        >
          Directions
          <ChevronDown className="h-[15px] w-[15px]" />
        </button>
      </div>

      {/* Center: clock + hide toggle + pacing. The clock is the one thing that
          must stay centred, so it keeps its own column at every width. */}
      <div className="flex flex-1 flex-col items-center justify-center">
        <div
          className={`text-[18px] font-normal leading-[1.1] tabular-nums text-bb-ink md:text-[22px] ${
            clockHidden ? "invisible" : ""
          }`}
        >
          {formatClock(clockMs)}
        </div>
        <div className="mt-[3px] flex items-center gap-[10px]">
          <button
            type="button"
            onClick={onToggleClock}
            className="rounded-full border border-bb-ink px-[13px] py-[2px] text-[13px] font-medium leading-[1.4] text-bb-ink hover:bg-white md:text-[14px]"
          >
            {clockHidden ? "Show" : "Hide"}
          </button>
          {pacing && <PacingIndicator {...pacing} />}
        </div>
      </div>

      {/* Right: tools. Labels drop away before the icons do. */}
      <div className="flex items-center justify-end gap-[18px] pr-[16px] md:w-[32%] md:gap-[38px] md:pr-[48px]">
        {showCalculator && (
          <ToolButton
            onClick={onToggleCalculator}
            active={calculatorOpen}
            label="Calculator"
            title="Calculator (K)"
          >
            <CalculatorIcon className="h-[21px] w-[21px]" />
          </ToolButton>
        )}

        <ToolButton
          onClick={onToggleHighlights}
          active={highlightsOn}
          label="Highlights & Notes"
          title="Highlights & Notes (H)"
        >
          <span className="flex items-end gap-[6px]">
            <HighlightIcon className="h-[21px] w-[21px]" />
            <NotesIcon className="h-[20px] w-[20px]" />
          </span>
        </ToolButton>

        <ToolButton
          id="exam-more-button"
          onClick={onToggleMore}
          active={moreOpen}
          label="More"
          expanded={moreOpen}
        >
          <MoreIcon className="h-[21px] w-[21px]" />
        </ToolButton>
      </div>

      {moreOpen && (
        <MoreMenu items={moreItems} onClose={onToggleMore} labelledBy="exam-more-button" />
      )}
    </header>
  );
}

/**
 * A header tool. Active state is an underline under the label rather than a
 * colour change — that is how Bluebook marks the open tool, and it survives the
 * label being hidden at narrow widths because the rule sits under the icon too.
 */
function ToolButton({
  id,
  onClick,
  active,
  label,
  title,
  expanded,
  children,
}: {
  id?: string;
  onClick: () => void;
  active: boolean;
  label: string;
  title?: string;
  expanded?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      id={id}
      type="button"
      onClick={onClick}
      title={title ?? label}
      aria-label={label}
      aria-pressed={expanded === undefined ? active : undefined}
      aria-expanded={expanded}
      aria-haspopup={expanded === undefined ? undefined : "menu"}
      className="flex flex-col items-center gap-[6px] text-[13px] leading-none text-bb-ink"
    >
      {children}
      <span
        className={`hidden whitespace-nowrap border-b-[1.5px] pb-[1px] sm:inline ${
          active ? "border-bb-ink font-bold" : "border-transparent"
        }`}
      >
        {label}
      </span>
      {/* Narrow screens hide the label, so the active rule moves under the icon. */}
      <span
        className={`h-[1.5px] w-[22px] sm:hidden ${active ? "bg-bb-ink" : "bg-transparent"}`}
      />
    </button>
  );
}
