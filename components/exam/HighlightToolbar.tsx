"use client";

import { useEffect, useRef, useState } from "react";
import {
  ChevronDown,
  DropletIcon,
  StickyNoteIcon,
  TrashIcon,
  UnderlineIcon,
  UnderlineStylesIcon,
} from "./icons";
import { COLORS, FILLS, UNDERLINES, type HighlightColor, type UnderlineKind } from "./marks";
import type { HighlightToolbarState, MarkStyle } from "./useHighlighter";

const LABELS: Record<HighlightColor, string> = {
  yellow: "Yellow highlight",
  blue: "Blue highlight",
  pink: "Pink highlight",
};

const UNDERLINE_LABELS: Record<UnderlineKind, string> = {
  solid: "Solid underline",
  dashed: "Dashed underline",
  dotted: "Dotted underline",
};

/**
 * The floating toolbar Bluebook shows over a text selection: three fills, an
 * underline with its three line styles behind a caret, delete, and add-note.
 *
 * The two style controls are independent, because an underline in Bluebook is a
 * layer over a highlight rather than a kind of highlight: picking a colour keeps
 * the rule, and picking a rule keeps the colour — or gives an unhighlighted
 * selection the armed one, since underlined text is always highlighted too.
 *
 * Whichever colour is armed wears the droplet, so the toolbar shows what a
 * selection will get while Highlights & Notes is on.
 */
export function HighlightToolbar({
  state,
  armed,
  underlineKind,
  onColor,
  onUnderline,
  onRemove,
  onNote,
  onClose,
}: {
  state: HighlightToolbarState;
  /** The armed style, marked with a droplet. */
  armed: MarkStyle;
  /** Line style the underline button applies without opening its menu. */
  underlineKind: UnderlineKind;
  onColor: (color: HighlightColor) => void;
  onUnderline: (kind: UnderlineKind | null) => void;
  onRemove: () => void;
  onNote: () => void;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [stylesOpen, setStylesOpen] = useState(false);

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

  // Opened on a highlight, the toolbar shows that highlight's style; opened on
  // a bare selection, it shows what the selection is about to get.
  const shown = state.markStyle ?? armed;

  return (
    <div
      ref={ref}
      role="toolbar"
      aria-label="Highlight options"
      className={`bb-pop fixed z-[60] -translate-x-1/2 ${state.below ? "" : "-translate-y-full"}`}
      style={{ left: state.x, top: state.below ? state.y + 10 : state.y - 10 }}
    >
      <div className="flex items-center gap-[12px] rounded-full bg-white px-[16px] py-[9px] shadow-[0_3px_16px_rgba(0,0,0,0.28)]">
        {COLORS.map((color) => (
          <button
            key={color}
            type="button"
            aria-label={LABELS[color]}
            aria-pressed={shown.color === color}
            onClick={() => onColor(color)}
            className={`flex h-[38px] w-[38px] items-center justify-center rounded-full transition-transform hover:scale-105 ${
              shown.color === color ? "border-[1.5px] border-bb-ink" : "border border-black/25"
            }`}
            style={{ background: FILLS[color] }}
          >
            {shown.color === color && (
              <span style={{ color: FILLS[color] }}>
                <DropletIcon className="h-[21px] w-[21px]" />
              </span>
            )}
          </button>
        ))}

        {/*
          The button toggles the rule using the last line style chosen; the caret
          picks a different one. Both leave the fill alone.
        */}
        <div className="relative flex items-center">
          <button
            type="button"
            aria-label={shown.underline ? "Remove underline" : UNDERLINE_LABELS[underlineKind]}
            aria-pressed={!!shown.underline}
            onClick={() => onUnderline(shown.underline ? null : underlineKind)}
            className={`flex h-[34px] w-[30px] items-center justify-center rounded-l-[8px] text-bb-ink hover:bg-black/5 ${
              shown.underline ? "bg-black/[0.06]" : ""
            }`}
          >
            {shown.underline ? (
              <UnderlineIcon kind={shown.underline} className="h-[23px] w-[23px]" />
            ) : (
              <UnderlineStylesIcon className="h-[23px] w-[23px]" />
            )}
          </button>
          <button
            type="button"
            aria-label="Underline styles"
            aria-expanded={stylesOpen}
            aria-haspopup="menu"
            onClick={() => setStylesOpen((v) => !v)}
            className="flex h-[34px] w-[18px] items-center justify-center rounded-r-[8px] text-bb-ink hover:bg-black/5"
          >
            <ChevronDown className="h-[13px] w-[13px]" />
          </button>

          {stylesOpen && (
            <div
              role="menu"
              aria-label="Underline styles"
              className={`absolute left-1/2 z-10 -translate-x-1/2 rounded-[10px] bg-white p-[6px] shadow-[0_3px_16px_rgba(0,0,0,0.28)] ${
                state.below ? "top-[calc(100%+8px)]" : "bottom-[calc(100%+8px)]"
              }`}
            >
              {UNDERLINES.map((kind) => (
                <button
                  key={kind}
                  type="button"
                  role="menuitemradio"
                  aria-checked={shown.underline === kind}
                  aria-label={UNDERLINE_LABELS[kind]}
                  onClick={() => {
                    setStylesOpen(false);
                    onUnderline(kind);
                  }}
                  className={`flex h-[34px] w-[42px] items-center justify-center rounded-[6px] text-bb-ink hover:bg-black/5 ${
                    shown.underline === kind ? "bg-black/[0.06]" : ""
                  }`}
                >
                  <UnderlineIcon kind={kind} className="h-[23px] w-[23px]" />
                </button>
              ))}
            </div>
          )}
        </div>

        <span className="h-[24px] w-px bg-black/15" />

        <button
          type="button"
          aria-label="Remove highlight"
          onClick={onRemove}
          className="flex h-[34px] w-[34px] items-center justify-center rounded-full text-bb-ink hover:bg-black/5"
        >
          <TrashIcon className="h-[21px] w-[21px]" />
        </button>

        <span className="h-[24px] w-px bg-black/15" />

        <button
          type="button"
          aria-label="Add note"
          onClick={onNote}
          className="flex h-[38px] w-[38px] items-center justify-center rounded-full border border-black/25 text-bb-ink hover:bg-black/5"
        >
          <StickyNoteIcon fill={FILLS[shown.color]} className="h-[22px] w-[22px]" />
        </button>
      </div>
    </div>
  );
}
