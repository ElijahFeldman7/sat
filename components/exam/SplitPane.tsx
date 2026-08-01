"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { GrabberIcon } from "./icons";

/**
 * Stimulus left / question right, split by a draggable rule carrying the
 * Bluebook grabber handle at vertical centre.
 *
 * Below `md` the two panes stack and each scrolls on its own — a side-by-side
 * split at phone width leaves neither column wide enough to read. The drag
 * ratio is published as a custom property so it only takes effect once the
 * panes are actually side by side.
 */
export function SplitPane({
  left,
  right,
  singleColumn,
}: {
  left: React.ReactNode;
  right: React.ReactNode;
  singleColumn?: boolean;
}) {
  const [ratio, setRatio] = useState(0.5);
  const containerRef = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);

  const onPointerMove = useCallback((e: PointerEvent) => {
    if (!dragging.current || !containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const next = (e.clientX - rect.left) / rect.width;
    setRatio(Math.min(0.75, Math.max(0.25, next)));
  }, []);

  useEffect(() => {
    const stop = () => {
      dragging.current = false;
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };
    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", stop);
    return () => {
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", stop);
    };
  }, [onPointerMove]);

  if (singleColumn) {
    return (
      <div className="h-full overflow-y-auto bb-scroll">
        <div className="mx-auto h-full max-w-[720px] px-[20px] pt-[18px] md:px-[40px] md:pt-[24px]">
          {right}
        </div>
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className="flex h-full min-h-0 flex-col md:flex-row"
      style={{ "--split": `${ratio * 100}%` } as React.CSSProperties}
    >
      <div className="h-[42%] w-full shrink-0 overflow-y-auto bb-scroll md:h-full md:w-[var(--split)]">
        <div className="px-[20px] pb-[20px] pt-[16px] md:px-[43px] md:pb-[40px] md:pt-[22px]">
          {left}
        </div>
      </div>

      {/* Vertical rule + grabber (desktop) / plain rule (stacked) */}
      <div className="relative h-0 w-full shrink-0 md:h-auto md:w-0">
        <div className="absolute inset-x-0 -top-[1px] h-[2px] bg-bb-divider md:inset-x-auto md:inset-y-0 md:-left-[1px] md:h-auto md:w-[2px]" />
        <button
          type="button"
          aria-label="Resize panels"
          onPointerDown={() => {
            dragging.current = true;
            document.body.style.cursor = "col-resize";
            document.body.style.userSelect = "none";
          }}
          className="absolute left-1/2 top-1/2 z-10 hidden h-[26px] w-[16px] -translate-x-1/2 -translate-y-1/2 cursor-col-resize items-center justify-center rounded-[3px] bg-bb-ink text-white md:flex"
        >
          <GrabberIcon className="h-[16px] w-[11px]" />
        </button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto bb-scroll md:h-full">
        <div className="px-[20px] pb-[24px] pt-[16px] md:px-[43px] md:pb-[40px] md:pt-[22px]">
          {right}
        </div>
      </div>
    </div>
  );
}
