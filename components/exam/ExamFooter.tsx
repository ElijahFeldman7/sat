"use client";

import { ChevronUp } from "./icons";

export function ExamFooter({
  userName,
  current,
  total,
  navOpen,
  onToggleNav,
  onBack,
  onNext,
  nextLabel = "Next",
  showBack = true,
  children,
}: {
  userName: string;
  current: number;
  total: number;
  navOpen: boolean;
  onToggleNav: () => void;
  onBack: () => void;
  onNext: () => void;
  nextLabel?: string;
  showBack?: boolean;
  children?: React.ReactNode;
}) {
  return (
    <footer className="bb-dash-t relative z-30 flex h-[60px] shrink-0 items-center bg-bb-band pt-[2px]">
      <div className="flex w-[30%] items-center pl-[43px] text-[17px] font-bold text-bb-ink">
        {userName}
      </div>

      <div className="relative flex flex-1 items-center justify-center">
        {children}
        <button
          type="button"
          onClick={onToggleNav}
          className="flex h-[38px] items-center gap-[9px] rounded-[8px] bg-bb-ink px-[17px] text-[16px] font-bold leading-none text-white"
        >
          Question {current} of {total}
          <ChevronUp
            className={`h-[16px] w-[16px] transition-transform ${navOpen ? "rotate-180" : ""}`}
          />
        </button>
      </div>

      <div className="flex w-[30%] items-center justify-end gap-[13px] pr-[40px]">
        {showBack && (
          <button
            type="button"
            onClick={onBack}
            className="h-[38px] rounded-full bg-bb-blue px-[26px] text-[16px] font-bold leading-none text-white hover:bg-bb-blue-hover"
          >
            Back
          </button>
        )}
        <button
          type="button"
          onClick={onNext}
          className="h-[38px] rounded-full bg-bb-blue px-[26px] text-[16px] font-bold leading-none text-white hover:bg-bb-blue-hover"
        >
          {nextLabel}
        </button>
      </div>
    </footer>
  );
}
