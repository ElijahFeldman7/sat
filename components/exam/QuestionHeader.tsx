"use client";

import { AbcIcon, BookmarkIcon } from "./icons";

/** The gray strip above each question: number, Mark for Review, ABC toggle. */
export function QuestionHeader({
  number,
  marked,
  onToggleMark,
  crossOutMode,
  onToggleCrossOut,
}: {
  number: number;
  marked: boolean;
  onToggleMark: () => void;
  crossOutMode: boolean;
  onToggleCrossOut: () => void;
}) {
  return (
    <div className="bb-dash-b flex h-[35px] items-stretch bg-bb-strip pb-[2px]">
      <div className="flex w-[27px] items-center justify-center bg-bb-ink text-[16px] font-bold leading-none text-white">
        {number}
      </div>

      <button
        type="button"
        onClick={onToggleMark}
        className="ml-[11px] flex items-center gap-[7px] text-[16px] leading-none text-bb-ink hover:underline"
        title="Mark for Review (M)"
      >
        <BookmarkIcon
          filled={marked}
          className={`h-[18px] w-[18px] ${marked ? "text-bb-review" : "text-bb-ink"}`}
        />
        Mark for Review
      </button>

      <div className="flex-1" />

      <button
        type="button"
        onClick={onToggleCrossOut}
        title="Cross out answer choices (C)"
        className={`my-[3px] mr-[2px] flex w-[37px] items-center justify-center rounded-[5px] border ${
          crossOutMode
            ? "border-bb-blue bg-bb-blue text-white"
            : "border-bb-blue bg-white text-bb-blue hover:bg-bb-blue/10"
        }`}
      >
        <AbcIcon className="h-[18px] w-[26px]" />
      </button>
    </div>
  );
}
