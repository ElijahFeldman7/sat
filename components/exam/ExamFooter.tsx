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
      <div className="hidden w-[30%] items-center truncate pl-[43px] text-[17px] font-bold text-bb-ink md:flex">
        {userName}
      </div>

      <div className="relative flex min-w-0 flex-1 items-center justify-center pl-[14px] md:pl-0">
        {children}
        <button
          type="button"
          onClick={onToggleNav}
          className="flex h-[38px] items-center gap-[9px] whitespace-nowrap rounded-[8px] bg-bb-ink px-[12px] text-[14px] font-bold leading-none text-white md:px-[17px] md:text-[16px]"
        >
          Question {current} of {total}
          <ChevronUp
            className={`h-[16px] w-[16px] transition-transform ${navOpen ? "rotate-180" : ""}`}
          />
        </button>
      </div>

      <div className="flex shrink-0 items-center justify-end gap-[8px] pr-[14px] md:w-[30%] md:gap-[13px] md:pr-[40px]">
        {showBack && (
          <button
            type="button"
            onClick={onBack}
            className="h-[38px] rounded-full bg-bb-blue px-[16px] text-[15px] font-bold leading-none text-white hover:bg-bb-blue-hover md:px-[26px] md:text-[16px]"
          >
            Back
          </button>
        )}
        <button
          type="button"
          onClick={onNext}
          className="h-[38px] rounded-full bg-bb-blue px-[16px] text-[15px] font-bold leading-none text-white hover:bg-bb-blue-hover md:px-[26px] md:text-[16px]"
        >
          {nextLabel}
        </button>
      </div>
    </footer>
  );
}
