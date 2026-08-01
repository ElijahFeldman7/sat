"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { GrabberIcon } from "./icons";

export type Pane = "passage" | "question";


export function SplitPane({
  left,
  right,
  singleColumn,
  pane,
  onPaneChange,
  passageLabel,
  answered,
}: {
  left: React.ReactNode;
  right: React.ReactNode;
  singleColumn?: boolean;
  pane: Pane;
  onPaneChange: (pane: Pane) => void;
  passageLabel: string;
  answered: boolean;
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
      <div className="bb-dash-b flex shrink-0 gap-[8px] bg-bb-strip px-[12px] py-[8px] md:hidden">
        <PaneTab active={pane === "passage"} onClick={() => onPaneChange("passage")}>
          {passageLabel}
        </PaneTab>
        <PaneTab active={pane === "question"} onClick={() => onPaneChange("question")}>
          Question
          {answered && (
            <span
              aria-label="answered"
              className={`h-[7px] w-[7px] rounded-full ${
                pane === "question" ? "bg-white" : "bg-bb-blue"
              }`}
            />
          )}
        </PaneTab>
      </div>

      <div
        className={`min-h-0 flex-1 overflow-y-auto bb-scroll md:block md:h-full md:w-[var(--split)] md:flex-none ${
          pane === "passage" ? "" : "hidden"
        }`}
      >
        <div className="px-[20px] pb-[20px] pt-[16px] md:px-[43px] md:pb-[40px] md:pt-[22px]">
          {left}
        </div>
      </div>

      {/* Vertical rule + grabber, desktop only — the tabs replace it on phones. */}
      <div className="relative hidden w-0 shrink-0 md:block">
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

      <div
        className={`min-h-0 flex-1 overflow-y-auto bb-scroll md:block md:h-full ${
          pane === "question" ? "" : "hidden"
        }`}
      >
        <div className="px-[20px] pb-[24px] pt-[16px] md:px-[43px] md:pb-[40px] md:pt-[22px]">
          {right}
        </div>
      </div>
    </div>
  );
}

function PaneTab({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`flex h-[38px] flex-1 items-center justify-center gap-[7px] rounded-[8px] text-[15px] font-bold leading-none transition-colors ${
        active
          ? "bg-bb-ink text-white"
          : "border border-black/20 bg-white text-bb-ink"
      }`}
    >
      {children}
    </button>
  );
}
