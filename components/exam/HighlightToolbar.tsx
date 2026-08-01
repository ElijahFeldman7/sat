"use client";

import { useEffect, useRef, useState } from "react";
import type { HighlightStyle, HighlightToolbarState } from "./useHighlighter";

const SWATCHES: { style: HighlightStyle; fill: string; label: string }[] = [
  { style: "yellow", fill: "#fdf0b4", label: "Yellow highlight" },
  { style: "blue", fill: "#d8e8f8", label: "Blue highlight" },
  { style: "pink", fill: "#f9d3e6", label: "Pink highlight" },
];

/**
 * The floating toolbar Bluebook shows over a text selection: three highlight
 * colours, an underline option, delete, and add-note. It is rendered in
 * viewport coordinates just above the selection, with the arrow pointing down
 * at the text it will act on.
 */
export function HighlightToolbar({
  state,
  onApply,
  onRemove,
  onNote,
  onClose,
}: {
  state: HighlightToolbarState;
  onApply: (style: HighlightStyle) => void;
  onRemove: () => void;
  onNote: (text: string) => void;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [noteOpen, setNoteOpen] = useState(false);
  const [draft, setDraft] = useState(state.note ?? "");

  useEffect(() => {
    const onPointerDown = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node)) onClose();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    // Deferred: the pointerup that produced the selection would otherwise
    // close the toolbar in the same tick it opened.
    const id = setTimeout(() => window.addEventListener("pointerdown", onPointerDown), 0);
    window.addEventListener("keydown", onKey);
    return () => {
      clearTimeout(id);
      window.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("keydown", onKey);
    };
  }, [onClose]);

  return (
    <div
      ref={ref}
      role="toolbar"
      aria-label="Highlight options"
      className="bb-pop fixed z-[60] -translate-x-1/2 -translate-y-full"
      style={{ left: state.x, top: state.y - 10 }}
    >
      <div className="flex items-center gap-[10px] rounded-[24px] bg-white px-[14px] py-[8px] shadow-[0_3px_16px_rgba(0,0,0,0.28)]">
        {SWATCHES.map((s) => (
          <button
            key={s.style}
            type="button"
            aria-label={s.label}
            onClick={() => onApply(s.style)}
            className="h-[30px] w-[30px] rounded-full border border-black/25 transition-transform hover:scale-110"
            style={{ background: s.fill }}
          />
        ))}

        <button
          type="button"
          aria-label="Underline"
          onClick={() => onApply("underline")}
          className="flex h-[30px] w-[30px] items-center justify-center rounded-[6px] text-bb-ink hover:bg-black/5"
        >
          <svg viewBox="0 0 24 24" className="h-[20px] w-[20px]" aria-hidden="true">
            <g fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
              <path d="M7 4v7a5 5 0 0 0 10 0V4" />
              <path d="M5.5 20h13" strokeDasharray="3 2.4" />
            </g>
          </svg>
        </button>

        <span className="h-[22px] w-px bg-black/15" />

        <button
          type="button"
          aria-label="Remove highlight"
          onClick={onRemove}
          className="flex h-[30px] w-[30px] items-center justify-center rounded-[6px] text-bb-ink hover:bg-black/5"
        >
          <svg viewBox="0 0 24 24" className="h-[19px] w-[19px]" aria-hidden="true">
            <g fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
              <path d="M4 6.5h16" />
              <path d="M9.5 6.5V4.6h5v1.9" />
              <path d="M6.3 6.5 7.2 20h9.6l.9-13.5" />
              <path d="M10.3 10v6M13.7 10v6" />
            </g>
          </svg>
        </button>

        <span className="h-[22px] w-px bg-black/15" />

        <button
          type="button"
          aria-label={state.note ? "Edit note" : "Add note"}
          aria-expanded={noteOpen}
          onClick={() => setNoteOpen((v) => !v)}
          className={`flex h-[30px] w-[30px] items-center justify-center rounded-[6px] border ${
            state.note ? "border-black/35 bg-[#fdf0b4]" : "border-black/25 bg-white"
          } text-bb-ink hover:bg-black/5`}
        >
          <svg viewBox="0 0 24 24" className="h-[18px] w-[18px]" aria-hidden="true">
            <g fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
              <rect x="4" y="4" width="16" height="16" rx="2.5" />
              <path d="M12 8.6v6.8M8.6 12h6.8" />
            </g>
          </svg>
        </button>
      </div>

      {noteOpen && (
        <div className="mt-[8px] w-[260px] rounded-[10px] bg-white p-[12px] shadow-[0_3px_16px_rgba(0,0,0,0.28)]">
          <textarea
            autoFocus
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            rows={3}
            placeholder="Add a note…"
            className="w-full resize-none rounded-[6px] border border-black/20 p-[8px] text-[14px] text-bb-ink outline-none focus:border-bb-blue"
          />
          <div className="mt-[8px] flex justify-end gap-[10px] text-[14px]">
            <button type="button" onClick={onClose} className="text-black/55 hover:underline">
              Cancel
            </button>
            <button
              type="button"
              onClick={() => onNote(draft)}
              className="font-bold text-bb-blue hover:underline"
            >
              Save
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
