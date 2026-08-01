"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { GrabberIcon } from "./icons";

/**
 * Stimulus left / question right, split by a draggable rule carrying the
 * Bluebook grabber handle at vertical centre.
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
        <div className="mx-auto h-full max-w-[720px] px-[40px] pt-[24px]">{right}</div>
      </div>
    );
  }

  return (
    <div ref={containerRef} className="flex h-full min-h-0">
      <div
        className="h-full overflow-y-auto bb-scroll"
        style={{ width: `${ratio * 100}%` }}
      >
        <div className="px-[43px] pb-[40px] pt-[22px]">{left}</div>
      </div>

      <div className="relative w-0 shrink-0">
        <div className="absolute inset-y-0 -left-[1px] w-[2px] bg-bb-divider" />
        <button
          type="button"
          aria-label="Resize panels"
          onPointerDown={() => {
            dragging.current = true;
            document.body.style.cursor = "col-resize";
            document.body.style.userSelect = "none";
          }}
          className="absolute left-1/2 top-1/2 z-10 flex h-[26px] w-[16px] -translate-x-1/2 -translate-y-1/2 cursor-col-resize items-center justify-center rounded-[3px] bg-bb-ink text-white"
        >
          <GrabberIcon className="h-[16px] w-[11px]" />
        </button>
      </div>

      <div className="h-full flex-1 overflow-y-auto bb-scroll">
        <div className="px-[43px] pb-[40px] pt-[22px]">{right}</div>
      </div>
    </div>
  );
}
