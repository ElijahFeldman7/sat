"use client";

import { useEffect, useRef } from "react";

export interface MoreMenuItem {
  label: string;
  icon: React.ReactNode;
  onSelect: () => void;
}

/**
 * The Bluebook "More" dropdown: a white panel anchored under the More button in
 * the header, one icon + label row per action. It is a popover rather than a
 * modal — no scrim, and clicking anywhere outside dismisses it — which is what
 * makes it feel attached to the button rather than interrupting the exam.
 */
export function MoreMenu({
  items,
  onClose,
  labelledBy,
}: {
  items: MoreMenuItem[];
  onClose: () => void;
  labelledBy?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Pointerdown, not click: the button's own click handler toggles the menu,
    // and a click listener here would fire first and close it, so reopening
    // would be impossible.
    const onPointerDown = (e: PointerEvent) => {
      const target = e.target as Node;
      if (ref.current?.contains(target)) return;
      if (labelledBy && document.getElementById(labelledBy)?.contains(target)) return;
      onClose();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("pointerdown", onPointerDown);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("keydown", onKey);
    };
  }, [labelledBy, onClose]);

  return (
    <div
      ref={ref}
      role="menu"
      aria-labelledby={labelledBy}
      className="bb-pop absolute right-[16px] top-full z-50 w-[266px] overflow-hidden rounded-[8px] bg-white py-[8px] shadow-[0_4px_24px_rgba(0,0,0,0.22)] md:right-[26px]"
    >
      {items.map((item) => (
        <button
          key={item.label}
          type="button"
          role="menuitem"
          onClick={() => {
            item.onSelect();
            onClose();
          }}
          className="flex h-[54px] w-full items-center gap-[16px] px-[22px] text-left text-[17px] text-bb-ink hover:bg-black/[0.05]"
        >
          <span className="flex h-[24px] w-[24px] shrink-0 items-center justify-center text-bb-ink">
            {item.icon}
          </span>
          {item.label}
        </button>
      ))}
    </div>
  );
}
