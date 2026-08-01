"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Script from "next/script";
import { CloseIcon } from "./icons";

const DESMOS_SRC =
  "https://www.desmos.com/api/v1.11/calculator.js?apiKey=dcb31709b452b1cf9dc26972add0fda6";

const WIDTH_KEY = "bb:desmos-width";
export const DEFAULT_DESMOS_WIDTH = 560;

interface DesmosCalculator {
  destroy(): void;
  resize(): void;
}

declare global {
  interface Window {
    Desmos?: {
      GraphingCalculator(
        el: HTMLElement,
        opts?: Record<string, unknown>,
      ): DesmosCalculator;
    };
  }
}

/**
 * Graphing calculator docked to the left of the exam. The parent shell gives it
 * its own grid column, so opening it *shifts* the test content rather than
 * covering it. The instance is created once and kept mounted.
 */
export function DesmosPanel({
  open,
  width,
  onWidthChange,
  onClose,
}: {
  open: boolean;
  width: number;
  onWidthChange: (w: number) => void;
  onClose: () => void;
}) {
  const mountRef = useRef<HTMLDivElement>(null);
  const calcRef = useRef<DesmosCalculator | null>(null);
  const [scriptReady, setScriptReady] = useState(false);
  const [dragging, setDragging] = useState(false);

  // Create the calculator once, the first time the panel is opened.
  useEffect(() => {
    if (!open || !scriptReady || calcRef.current || !mountRef.current) return;
    if (!window.Desmos) return;
    calcRef.current = window.Desmos.GraphingCalculator(mountRef.current, {
      keypad: true,
      expressions: true,
      settingsMenu: true,
      zoomButtons: true,
      border: false,
      autosize: true,
    });
  }, [open, scriptReady]);

  useEffect(() => {
    return () => {
      calcRef.current?.destroy();
      calcRef.current = null;
    };
  }, []);

  // Desmos needs an explicit resize after the column width animates.
  useEffect(() => {
    if (!open) return;
    const timer = setTimeout(() => calcRef.current?.resize(), 220);
    return () => clearTimeout(timer);
  }, [open, width]);

  const onPointerMove = useCallback(
    (e: PointerEvent) => {
      if (!dragging) return;
      onWidthChange(Math.min(900, Math.max(360, e.clientX)));
    },
    [dragging, onWidthChange],
  );

  useEffect(() => {
    const stop = () => {
      if (!dragging) return;
      setDragging(false);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
      try {
        localStorage.setItem(WIDTH_KEY, String(width));
      } catch {
        /* storage unavailable — width just won't persist */
      }
      calcRef.current?.resize();
    };
    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", stop);
    return () => {
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", stop);
    };
  }, [dragging, onPointerMove, width]);

  return (
    <>
      {open && <Script src={DESMOS_SRC} onReady={() => setScriptReady(true)} />}
      <aside
        className="relative h-full min-h-0 shrink-0 overflow-hidden border-r border-black/15 bg-white"
        style={{
          width: open ? width : 0,
          transition: dragging ? "none" : "width 200ms ease",
        }}
        aria-hidden={!open}
      >
        <div className="flex h-full flex-col" style={{ width }}>
          <div className="flex h-[38px] shrink-0 items-center justify-between border-b border-black/10 bg-bb-strip px-[12px]">
            <span className="text-[14px] font-bold text-bb-ink">Calculator</span>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close calculator"
              className="text-bb-ink hover:opacity-70"
            >
              <CloseIcon className="h-[17px] w-[17px]" />
            </button>
          </div>
          <div ref={mountRef} className="min-h-0 flex-1">
            {!scriptReady && open && (
              <div className="flex h-full items-center justify-center text-[15px] text-black/50">
                Loading Desmos…
              </div>
            )}
          </div>
        </div>

        {open && (
          <div
            onPointerDown={() => {
              setDragging(true);
              document.body.style.cursor = "col-resize";
              document.body.style.userSelect = "none";
            }}
            className="absolute inset-y-0 right-0 w-[6px] cursor-col-resize hover:bg-bb-blue/20"
          />
        )}
      </aside>
    </>
  );
}

export function loadDesmosWidth(): number {
  if (typeof window === "undefined") return DEFAULT_DESMOS_WIDTH;
  const stored = Number(localStorage.getItem(WIDTH_KEY));
  return stored >= 360 && stored <= 900 ? stored : DEFAULT_DESMOS_WIDTH;
}
