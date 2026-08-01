"use client";

import { QuestionHtmlInline } from "./QuestionHtml";

/**
 * Answer choices. Geometry matches the reference screenshots exactly:
 * 46px min height, 1px #505050 border, 8px radius, 16px gap, and a 30px-wide
 * cross-out gutter to the right of the box.
 */
export function ChoiceList({
  options,
  selected,
  crossedOut,
  crossOutMode,
  onSelect,
  onToggleCrossOut,
  reveal,
  correctIds,
}: {
  options: { id: string; letter: string; html: string }[];
  selected: string | null;
  crossedOut: string[];
  crossOutMode: boolean;
  onSelect: (id: string) => void;
  onToggleCrossOut: (id: string) => void;
  reveal?: boolean;
  correctIds?: string[];
}) {
  return (
    <div className="flex flex-col gap-[16px]">
      {options.map((opt) => {
        const isSelected = selected === opt.id;
        const isCrossed = crossedOut.includes(opt.id);
        const isCorrect = reveal && correctIds?.includes(opt.id);
        const isWrongPick = reveal && isSelected && !isCorrect;

        // Crossed-out choices and the read-only results view do nothing when
        // clicked, so neither should advertise a click.
        const interactive = !reveal && !isCrossed;

        let borderClass = "border-bb-border";
        let ring = "";
        if (isCorrect) {
          borderClass = "border-[#1d7a3e]";
          ring = "shadow-[inset_0_0_0_1px_#1d7a3e]";
        } else if (isWrongPick) {
          borderClass = "border-[#c62828]";
          ring = "shadow-[inset_0_0_0_1px_#c62828]";
        } else if (isSelected) {
          borderClass = "border-bb-blue";
          ring = "shadow-[inset_0_0_0_1px_var(--color-bb-blue)]";
        } else if (isCrossed) {
          borderClass = "border-black/20";
        }

        return (
          <div key={opt.id} className="flex items-stretch gap-[16px]">
            <button
              type="button"
              onClick={() => onSelect(opt.id)}
              // A stray pixel of drag across selectable text cancels the click,
              // which is why only the letter felt reliable. Nothing here is
              // worth selecting mid-exam, and images must not start a drag.
              className={`relative flex min-h-[46px] flex-1 items-center gap-[16px] rounded-[8px] border bg-white px-[13px] py-[9px] text-left transition-[border-color,box-shadow,background-color] duration-75 [&_img]:pointer-events-none ${borderClass} ${ring} ${
                interactive ? "select-none hover:border-bb-ink hover:bg-[#f0f0f0]" : ""
              }`}
            >
              <span
                className={`flex h-[26px] w-[26px] shrink-0 items-center justify-center rounded-full border text-[15px] font-medium leading-none ${
                  isCorrect
                    ? "border-[#1d7a3e] bg-[#1d7a3e] text-white"
                    : isWrongPick
                      ? "border-[#c62828] bg-[#c62828] text-white"
                      : isSelected
                        ? "border-bb-blue bg-bb-blue text-white"
                        : "border-bb-ink text-bb-ink"
                } ${isCrossed ? "opacity-40" : ""}`}
              >
                {opt.letter}
              </span>
              <span className={`flex-1 ${isCrossed ? "opacity-40" : ""}`}>
                <QuestionHtmlInline html={opt.html} />
              </span>

              {/* One rule straight across the whole box, edge to edge — not a
                  text-decoration, which would stop at the end of the words and
                  fade along with them. */}
              {isCrossed && (
                <span className="pointer-events-none absolute inset-x-0 top-1/2 h-[1.5px] -translate-y-1/2 bg-bb-ink" />
              )}
            </button>

            {/* Cross-out gutter. Once a choice is struck through, the control
                stops offering the action and becomes the way back out of it —
                so it reads "Undo" rather than a struck letter. */}
            <span className="flex w-[46px] shrink-0 items-center justify-center">
              {crossOutMode &&
                (isCrossed ? (
                  <button
                    type="button"
                    onClick={() => onToggleCrossOut(opt.id)}
                    aria-label={`Undo cross out ${opt.letter}`}
                    className="text-[14px] font-medium leading-none text-bb-ink underline underline-offset-2 hover:text-bb-blue"
                  >
                    Undo
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => onToggleCrossOut(opt.id)}
                    aria-label={`Cross out ${opt.letter}`}
                    className="relative flex h-[22px] w-[22px] items-center justify-center rounded-full border border-bb-ink text-[13px] font-medium leading-none text-bb-ink hover:bg-black/5"
                  >
                    {opt.letter}
                    <span className="absolute left-[-2px] right-[-2px] top-1/2 h-[1.5px] -translate-y-1/2 bg-bb-ink" />
                  </button>
                ))}
            </span>
          </div>
        );
      })}
    </div>
  );
}
