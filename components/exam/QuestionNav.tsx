"use client";

import { CloseIcon, FlagIcon, PinIcon } from "./icons";
import type { ExamQuestionState } from "./types";

export interface NavItem {
  idx: number;
  answered: boolean;
  marked: boolean;
}

export function toNavItems(questions: ExamQuestionState[]): NavItem[] {
  return questions.map((q) => ({
    idx: q.idx,
    answered: !!q.userAnswer,
    marked: q.markedForReview,
  }));
}

export function Legend({ showCurrent }: { showCurrent: boolean }) {
  return (
    <div className="flex items-center justify-center gap-[26px] text-[16px] text-bb-ink">
      {showCurrent && (
        <span className="flex items-center gap-[7px]">
          <PinIcon className="h-[17px] w-[17px]" />
          Current
        </span>
      )}
      <span className="flex items-center gap-[7px]">
        <span className="h-[17px] w-[17px] border-[1.5px] border-dashed border-bb-ink" />
        Unanswered
      </span>
      <span className="flex items-center gap-[7px]">
        <FlagIcon className="h-[17px] w-[17px] text-bb-review" />
        For Review
      </span>
    </div>
  );
}

/** A single number box in the nav grid. */
export function NavBox({
  item,
  isCurrent,
  onClick,
}: {
  item: NavItem;
  isCurrent: boolean;
  onClick: () => void;
}) {
  return (
    <div className="relative">
      {isCurrent && (
        <PinIcon className="absolute -top-[19px] left-1/2 h-[17px] w-[17px] -translate-x-1/2 text-bb-ink" />
      )}
      {item.marked && (
        <FlagIcon className="absolute -right-[6px] -top-[7px] z-10 h-[15px] w-[15px] text-bb-review" />
      )}
      <button
        type="button"
        onClick={onClick}
        className={`flex h-[38px] w-[38px] items-center justify-center text-[19px] font-bold leading-none text-bb-blue ${
          item.answered
            ? "bg-bb-blue text-white"
            : "border-[1.5px] border-dashed border-bb-ink bg-white"
        }`}
      >
        {item.idx + 1}
      </button>
    </div>
  );
}

/** Popover anchored above the footer's "Question n of m" pill. */
export function QuestionNavPopover({
  title,
  items,
  currentIdx,
  onJump,
  onClose,
  onReviewPage,
}: {
  title: string;
  items: NavItem[];
  currentIdx: number;
  onJump: (idx: number) => void;
  onClose: () => void;
  onReviewPage: () => void;
}) {
  return (
    <div className="bb-pop absolute bottom-[52px] left-1/2 z-40 w-[620px] -translate-x-1/2">
      <div className="rounded-[6px] border border-black/10 bg-white px-[26px] pb-[22px] pt-[18px] shadow-[0_4px_20px_rgba(0,0,0,0.22)]">
        <div className="relative flex items-center justify-center pb-[14px]">
          <h2 className="text-[19px] font-bold text-bb-ink">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="absolute right-0 text-bb-ink hover:opacity-70"
          >
            <CloseIcon className="h-[20px] w-[20px]" />
          </button>
        </div>

        <div className="border-t border-black/15 pb-[16px] pt-[13px]">
          <Legend showCurrent />
        </div>

        <div className="border-t border-black/15 pt-[28px]">
          <div className="flex flex-wrap justify-center gap-x-[18px] gap-y-[26px]">
            {items.map((item) => (
              <NavBox
                key={item.idx}
                item={item}
                isCurrent={item.idx === currentIdx}
                onClick={() => onJump(item.idx)}
              />
            ))}
          </div>
        </div>

        <div className="mt-[24px] flex justify-center">
          <button
            type="button"
            onClick={onReviewPage}
            className="rounded-full border-[1.5px] border-bb-blue px-[20px] py-[7px] text-[16px] font-bold leading-none text-bb-blue hover:bg-bb-blue/5"
          >
            Go to Review Page
          </button>
        </div>
      </div>

      {/* Arrow tail pointing down at the footer pill */}
      <div
        className="absolute -bottom-[15px] left-1/2 h-0 w-0 -translate-x-1/2"
        style={{
          borderLeft: "17px solid transparent",
          borderRight: "17px solid transparent",
          borderTop: "16px solid #fff",
        }}
      />
    </div>
  );
}
