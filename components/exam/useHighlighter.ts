"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Passage highlighting. The highlighted markup for a question is persisted
 * whole (as sanitized HTML with <mark> wrappers) rather than as ranges — the
 * bank's markup is stable per question, so this survives refreshes without
 * fragile offset bookkeeping.
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

  const onMouseUp = useCallback(() => {
    if (!enabled) return;
    const selection = window.getSelection();
    if (!selection || selection.isCollapsed) return;

    const range = selection.getRangeAt(0);
    const root = stimulusRef.current;
    if (!root || !root.contains(range.commonAncestorContainer)) return;

    try {
      const mark = document.createElement("mark");
      mark.className = "bb-hl";
      // surroundContents throws when the selection crosses element boundaries;
      // fall back to wrapping the extracted fragment.
      try {
        range.surroundContents(mark);
      } catch {
        mark.appendChild(range.extractContents());
        range.insertNode(mark);
      }
      selection.removeAllRanges();
      capture();
    } catch (err) {
      console.error("Could not highlight selection", err);
    }
  }, [capture, enabled]);

  // Clicking an existing highlight while the tool is on removes it.
  useEffect(() => {
    if (!enabled) return;
    const root = stimulusRef.current;
    if (!root) return;

    const onClick = (e: MouseEvent) => {
      const mark = (e.target as HTMLElement)?.closest?.("mark.bb-hl");
      if (!mark || !root.contains(mark)) return;
      const parent = mark.parentNode;
      if (!parent) return;
      while (mark.firstChild) parent.insertBefore(mark.firstChild, mark);
      parent.removeChild(mark);
      parent.normalize();
      capture();
    };

    root.addEventListener("click", onClick);
    return () => root.removeEventListener("click", onClick);
  }, [capture, enabled]);

  const clearHighlights = useCallback(() => {
    setStore((s) => {
      const next = { ...s };
      delete next[questionKey];
      return next;
    });
    persist(questionKey, null);
  }, [persist, questionKey]);

  return {
    stimulusRef,
    highlightHtml: store[questionKey] ?? null,
    onMouseUp,
    clearHighlights,
  };
}
