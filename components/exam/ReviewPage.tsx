"use client";

import { Legend, NavBox, type NavItem } from "./QuestionNav";

/** The "Check Your Work" screen (screenshot 3). */
export function ReviewPage({
  title,
  items,
  currentIdx,
  onJump,
}: {
  title: string;
  items: NavItem[];
  currentIdx: number;
  onJump: (idx: number) => void;
}) {
  const unanswered = items.filter((i) => !i.answered).length;

  return (
    <div className="h-full overflow-y-auto bg-[#f7f7f7] bb-scroll">
      <div className="mx-auto w-full max-w-[980px] px-[40px] pt-[36px]">
        <h1 className="text-center text-[40px] font-bold leading-[1.15] tracking-[-0.015em] text-bb-ink">
          Check Your Work
        </h1>

        <p className="mt-[44px] text-center text-[19px] leading-[32px] text-bb-ink">
          On test day, you won&rsquo;t be able to move on to the next module until time expires.
          <br />
          For these practice questions, you can click <strong>Next</strong>{" "}
          when you&rsquo;re ready to move on.
        </p>

        <div className="mx-auto mt-[46px] w-[730px] max-w-full rounded-[8px] bg-white px-[40px] pb-[38px] pt-[30px] shadow-[0_2px_12px_rgba(0,0,0,0.13)]">
          <div className="flex items-center justify-between pb-[16px]">
            <h2 className="text-[19px] font-bold text-bb-ink">{title}</h2>
            <Legend showCurrent={false} />
          </div>

          <div className="border-t border-black/15 pt-[34px]">
            <div className="flex flex-wrap gap-x-[24px] gap-y-[28px]">
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
        </div>

        <p className="mt-[26px] pb-[40px] text-center text-[16px] text-black/60">
          {unanswered === 0
            ? "Every question is answered. Click Submit when you're ready."
            : `${unanswered} question${unanswered === 1 ? "" : "s"} still unanswered.`}
        </p>
      </div>
    </div>
  );
}
