"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/** Highlight styles offered by the selection toolbar. */
export type HighlightStyle = "yellow" | "blue" | "pink" | "underline";

export interface HighlightToolbarState {
  /** Viewport coordinates of the selection's top centre. */
  x: number;
  y: number;
  /** True when the toolbar was opened on an existing highlight. */
  onMark: boolean;
  /** Note already attached to that highlight, if any. */
  note: string | null;
}

/* Marks are plain DOM nodes; these keep the writes out of the hook body. */

function writeStyle(mark: HTMLElement, style: HighlightStyle) {
  mark.dataset.hl = style;
}

function writeNote(mark: HTMLElement, text: string) {
  if (text.trim()) mark.dataset.note = text.trim();
  else delete mark.dataset.note;
}

function unwrap(mark: Element) {
  const parent = mark.parentNode;
  if (!parent) return;
  while (mark.firstChild) parent.insertBefore(mark.firstChild, mark);
  parent.removeChild(mark);
  parent.normalize();
}

/** Wraps a range in a styled mark and returns it, or null if the DOM refused. */
function wrapRange(range: Range, style: HighlightStyle): HTMLElement | null {
  try {
    const wrapper = document.createElement("mark");
    wrapper.className = "bb-hl";
    writeStyle(wrapper, style);
    // surroundContents throws when the selection crosses element boundaries;
    // fall back to wrapping the extracted fragment.
    try {
      range.surroundContents(wrapper);
    } catch {
      wrapper.appendChild(range.extractContents());
      range.insertNode(wrapper);
    }
    return wrapper;
  } catch (err) {
    console.error("Could not highlight selection", err);
    return null;
  }
}

/**
 * Passage highlighting. The highlighted markup for a question is persisted
 * whole (as sanitized HTML with <mark> wrappers) rather than as ranges — the
 * bank's markup is stable per question, so this survives refreshes without
 * fragile offset bookkeeping. The chosen colour and any note ride along as
 * `data-` attributes on the mark, so they persist by the same mechanism.
 */
export function useHighlighter({
  enabled,
  questionKey,
  initial,
}: {
  enabled: boolean;
  questionKey: string;
  initial: Record<string, string>;
}) {
  const stimulusRef = useRef<HTMLDivElement>(null);
  const [store, setStore] = useState<Record<string, string>>(initial);
  const [toolbar, setToolbar] = useState<HighlightToolbarState | null>(null);

  /** The selection the toolbar will act on, or the mark it was opened over. */
  const pendingRange = useRef<Range | null>(null);
  const activeMark = useRef<HTMLElement | null>(null);

  const persist = useCallback((key: string, html: string | null) => {
    void fetch("/api/annotations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ questionKey: key, html }),
    }).catch((err) => console.error("Highlight save failed", err));
  }, []);

  const capture = useCallback(() => {
    const root = stimulusRef.current?.querySelector(".qbank");
    if (!root) return;
    const html = root.innerHTML;
    setStore((s) => ({ ...s, [questionKey]: html }));
    persist(questionKey, html);
  }, [persist, questionKey]);

  const closeToolbar = useCallback(() => {
    setToolbar(null);
    pendingRange.current = null;
    activeMark.current = null;
  }, []);

  /** Places the toolbar above a rect, clamped into the viewport. */
  const openAt = useCallback((rect: DOMRect, onMark: boolean, note: string | null) => {
    setToolbar({
      x: Math.min(Math.max(rect.left + rect.width / 2, 150), window.innerWidth - 150),
      y: Math.max(rect.top, 8),
      onMark,
      note,
    });
  }, []);

  const onMouseUp = useCallback(() => {
    if (!enabled) return;
    const selection = window.getSelection();
    if (!selection || selection.isCollapsed) return;

    const range = selection.getRangeAt(0);
    const root = stimulusRef.current;
    if (!root || !root.contains(range.commonAncestorContainer)) return;

    pendingRange.current = range.cloneRange();
    activeMark.current = null;
    openAt(range.getBoundingClientRect(), false, null);
  }, [enabled, openAt]);

  useEffect(() => {
    if (!enabled) return;
    if (!window.matchMedia?.("(pointer: coarse)").matches) return;

    let timer: ReturnType<typeof setTimeout> | null = null;
    const onSelectionChange = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        const selection = window.getSelection();
        if (!selection || selection.isCollapsed) return;
        const range = selection.getRangeAt(0);
        const root = stimulusRef.current;
        if (!root || !root.contains(range.commonAncestorContainer)) return;
        pendingRange.current = range.cloneRange();
        activeMark.current = null;
        openAt(range.getBoundingClientRect(), false, null);
      }, 400);
    };

    document.addEventListener("selectionchange", onSelectionChange);
    return () => {
      if (timer) clearTimeout(timer);
      document.removeEventListener("selectionchange", onSelectionChange);
    };
  }, [enabled, openAt]);

  /** Opening the toolbar over an existing highlight edits it rather than making a new one. */
  useEffect(() => {
    if (!enabled) return;
    const root = stimulusRef.current;
    if (!root) return;

    const onClick = (e: MouseEvent) => {
      const mark = (e.target as HTMLElement)?.closest?.("mark.bb-hl") as HTMLElement | null;
      if (!mark || !root.contains(mark)) return;
      const selection = window.getSelection();
      if (selection && !selection.isCollapsed) return; // a drag that ended on a mark
      activeMark.current = mark;
      pendingRange.current = null;
      openAt(mark.getBoundingClientRect(), true, mark.dataset.note ?? null);
    };

    root.addEventListener("click", onClick);
    return () => root.removeEventListener("click", onClick);
  }, [enabled, openAt]);

  // The toolbar is positioned in viewport coordinates, so any scroll detaches
  // it from the text it belongs to. Closing is less confusing than chasing it.
  useEffect(() => {
    if (!toolbar) return;
    const close = () => closeToolbar();
    window.addEventListener("scroll", close, true);
    window.addEventListener("resize", close);
    return () => {
      window.removeEventListener("scroll", close, true);
      window.removeEventListener("resize", close);
    };
  }, [closeToolbar, toolbar]);

  const applyStyle = useCallback(
    (style: HighlightStyle) => {
      const mark = activeMark.current;
      if (mark) {
        writeStyle(mark, style);
        capture();
        closeToolbar();
        return;
      }

      const range = pendingRange.current;
      if (!range) return;
      if (wrapRange(range, style)) {
        window.getSelection()?.removeAllRanges();
        capture();
      }
      closeToolbar();
    },
    [capture, closeToolbar],
  );

  const removeAtSelection = useCallback(() => {
    const root = stimulusRef.current;

    if (activeMark.current) {
      unwrap(activeMark.current);
    } else if (pendingRange.current && root) {
      // Strip every highlight the selection touches.
      const range = pendingRange.current;
      for (const mark of [...root.querySelectorAll("mark.bb-hl")]) {
        if (range.intersectsNode(mark)) unwrap(mark);
      }
    }
    window.getSelection()?.removeAllRanges();
    capture();
    closeToolbar();
  }, [capture, closeToolbar]);

  /** Attaches (or clears, with an empty string) a note on the active highlight. */
  const setNote = useCallback(
    (text: string) => {
      // Notes need something to hang off, so a bare selection becomes a
      // highlight first — matching Bluebook, where a note implies a mark.
      const mark =
        activeMark.current ??
        (pendingRange.current ? wrapRange(pendingRange.current, "yellow") : null);
      if (!mark) return;
      writeNote(mark, text);
      window.getSelection()?.removeAllRanges();
      capture();
      closeToolbar();
    },
    [capture, closeToolbar],
  );

  const clearHighlights = useCallback(() => {
    setStore((s) => {
      const next = { ...s };
      delete next[questionKey];
      return next;
    });
    persist(questionKey, null);
    closeToolbar();
  }, [closeToolbar, persist, questionKey]);

  return {
    stimulusRef,
    highlightHtml: store[questionKey] ?? null,
    onMouseUp,
    clearHighlights,
    // Turning the tool off must not leave the toolbar floating over the page.
    toolbar: enabled ? toolbar : null,
    closeToolbar,
    applyStyle,
    removeAtSelection,
    setNote,
  };
}
