"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  COLORS,
  MARK,
  UNDERLINES,
  erase,
  eraseAll,
  groupId,
  groupOf,
  marksWithNote,
  notesIn,
  paint,
  readStyle,
  unwrap,
  writeNote,
  writeStyle,
  type HighlightColor,
  type MarkNote,
  type MarkStyle,
  type UnderlineKind,
} from "./marks";

export type { MarkNote, MarkStyle };

/**
 * The two highlightable regions of a question. Both the passage and the question
 * itself can be marked up, and they render into different panes, so each keeps
 * its own markup. The passage's is stored as `html` — the name it had before the
 * question became highlightable — so existing rows still load.
 */
export type Region = "html" | "stem";

const REGIONS: Region[] = ["html", "stem"];

export interface HighlightPayload {
  html?: string | null;
  stem?: string | null;
}

export interface HighlightToolbarState {
  /** Viewport coordinates of the selection edge the toolbar hangs off. */
  x: number;
  y: number;
  /** True when there was no room above the selection, so it opens downwards. */
  below: boolean;
  /** True when the toolbar was opened on an existing highlight. */
  onMark: boolean;
  /** The style of the highlight it was opened on, if it was opened on one. */
  markStyle: MarkStyle | null;
}

/** The armed style outlives the drill, so highlighting resumes where you left it. */
const STYLE_KEY = "bb.highlightStyle";

const DEFAULT_STYLE: MarkStyle = { color: "yellow", underline: null };

function loadStyle(): MarkStyle {
  if (typeof window === "undefined") return DEFAULT_STYLE;
  try {
    const raw = window.localStorage.getItem(STYLE_KEY);
    if (!raw) return DEFAULT_STYLE;
    const saved = JSON.parse(raw) as MarkStyle;
    return {
      color: (COLORS as string[]).includes(saved?.color) ? saved.color : "yellow",
      underline: (UNDERLINES as string[]).includes(saved?.underline as string)
        ? saved.underline
        : null,
    };
  } catch {
    return DEFAULT_STYLE;
  }
}

/**
 * Passage and question highlighting. The highlighted markup is persisted whole
 * (as sanitized HTML with <mark> wrappers) rather than as ranges — the bank's
 * markup is stable per question, so this survives refreshes without fragile
 * offset bookkeeping. The colour, its underline, the note and the id grouping a
 * highlight's pieces all ride along as `data-` attributes on the mark, so they
 * persist by the same mechanism.
 *
 * Marks are made by mutating the DOM directly, and the saved markup is *not*
 * fed back through React while the question is on screen. Rendering it would
 * mean React rewriting the region's innerHTML, which drops every node the scroll
 * container was anchored to and snaps the pane back to the top. So the markup
 * React holds is pinned to the question (see `rendered` below) and the saved
 * copy is only ever applied on a question change.
 *
 * Selecting text always offers to highlight it; what the Highlights & Notes
 * toggle changes is how. With it off, letting go of a selection opens the
 * toolbar to pick a style. With it on, letting go applies the style already
 * armed — the last colour used, with the last underline if that is what was
 * used last. Clicking an existing mark opens the toolbar either way, since that
 * is how it gets restyled, noted or deleted.
 */
export function useHighlighter({
  autoApply,
  questionKey,
  initial,
}: {
  /** True when Highlights & Notes is on: apply the armed style immediately. */
  autoApply: boolean;
  questionKey: string;
  initial: Record<string, HighlightPayload>;
}) {
  const stimulusRef = useRef<HTMLDivElement>(null);
  const stemRef = useRef<HTMLDivElement>(null);
  const [toolbar, setToolbar] = useState<HighlightToolbarState | null>(null);

  /** The wrapper of a region, which is what selections are tested against. */
  const wrapperOf = useCallback(
    (region: Region) => (region === "html" ? stimulusRef.current : stemRef.current),
    [],
  );
  /** The bank markup inside a region, which is what gets marked up and saved. */
  const contentOf = useCallback(
    (region: Region) => wrapperOf(region)?.querySelector(".qbank") ?? null,
    [wrapperOf],
  );
  /** Which region a node belongs to, if any. */
  const regionOf = useCallback(
    (node: Node | null) =>
      node ? (REGIONS.find((region) => wrapperOf(region)?.contains(node)) ?? null) : null,
    [wrapperOf],
  );

  /**
   * The armed style. Read from localStorage during the first client render,
   * which is safe because nothing rendered on the server depends on it — the
   * toolbar starts closed.
   */
  const [style, setStyle] = useState<MarkStyle>(loadStyle);
  /**
   * The line style the underline button reuses, kept even while the armed style
   * has no underline, so switching one back on returns the one last chosen.
   */
  const [underlineKind, setUnderlineKind] = useState<UnderlineKind>(
    () => loadStyle().underline ?? "solid",
  );

  const arm = useCallback((next: MarkStyle) => {
    setStyle(next);
    if (next.underline) setUnderlineKind(next.underline);
    try {
      window.localStorage.setItem(STYLE_KEY, JSON.stringify(next));
    } catch {
      /* private browsing; the style just resets next load */
    }
  }, []);

  /** Saved markup per question, for persistence and for later visits. */
  const [saved, setSaved] = useState<Record<string, HighlightPayload>>(() => ({ ...initial }));

  /**
   * What React is rendering into each region: the saved markup as it stood when
   * this question came on screen. Derived during render rather than in an
   * effect, so a newly opened question paints its highlights first time.
   */
  const [rendered, setRendered] = useState<{ key: string } & HighlightPayload>(() => ({
    key: questionKey,
    html: initial[questionKey]?.html ?? null,
    stem: initial[questionKey]?.stem ?? null,
  }));
  if (rendered.key !== questionKey) {
    setRendered({
      key: questionKey,
      html: saved[questionKey]?.html ?? null,
      stem: saved[questionKey]?.stem ?? null,
    });
  }

  /** The notes on this question, mirrored out of the DOM for the notes panel. */
  const [notes, setNotes] = useState<MarkNote[]>([]);
  /** The note card that should open focused, once, after it is created. */
  const [editingNote, setEditingNote] = useState<string | null>(null);

  /** The selection the toolbar will act on, or the mark it was opened over. */
  const pendingRange = useRef<Range | null>(null);
  const activeMark = useRef<HTMLElement | null>(null);
  /** Which region the toolbar was opened in, so its actions land there. */
  const activeRegion = useRef<Region>("html");

  const persist = useCallback((key: string, payload: HighlightPayload) => {
    void fetch("/api/annotations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ questionKey: key, ...payload }),
    }).catch((err) => console.error("Highlight save failed", err));
  }, []);

  const readNotes = useCallback(() => {
    setNotes(REGIONS.flatMap((region) => (contentOf(region) ? notesIn(contentOf(region)!) : [])));
  }, [contentOf]);

  /**
   * Both regions are read straight out of the DOM, so a save always carries the
   * whole question however little of it changed.
   */
  const capture = useCallback(() => {
    const payload: HighlightPayload = {
      html: contentOf("html")?.innerHTML ?? null,
      stem: contentOf("stem")?.innerHTML ?? null,
    };
    // Only `rendered` reaches the DOM, and that is pinned to the question, so
    // this re-render cannot rewrite the markup under the student.
    setSaved((s) => ({ ...s, [questionKey]: payload }));
    persist(questionKey, payload);
    readNotes();
  }, [contentOf, persist, questionKey, readNotes]);

  /*
   * A question change swaps the markup React holds, and the notes live inside
   * that markup as attributes. Reading them back out is exactly the "subscribe
   * to an external system" case: the DOM is written by `dangerouslySetInnerHTML`
   * and there is nothing in React to derive them from, so this has to run after
   * the commit.
   */
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(readNotes, [readNotes, rendered]);

  const closeToolbar = useCallback(() => {
    setToolbar(null);
    pendingRange.current = null;
    activeMark.current = null;
  }, []);

  /** Places the toolbar against a rect, clamped into the viewport. */
  const openAt = useCallback((rect: DOMRect, onMark: boolean, markStyle: MarkStyle | null) => {
    // Above the selection normally; below it when the toolbar would otherwise
    // sit under the exam header or off the top of the window.
    const below = rect.top < 150;
    setToolbar({
      x: Math.min(Math.max(rect.left + rect.width / 2, 150), window.innerWidth - 150),
      y: below ? rect.bottom : rect.top,
      below,
      onMark,
      markStyle,
    });
  }, []);

  /** The current selection, if it is a usable one inside a highlightable region. */
  const selectionRange = useCallback(() => {
    const selection = window.getSelection();
    if (!selection || selection.isCollapsed || selection.rangeCount === 0) return null;
    const range = selection.getRangeAt(0);
    const region = regionOf(range.startContainer);
    // A selection that started in one region and ended in another belongs to
    // neither; there is no markup that spans the two panes.
    if (!region || regionOf(range.endContainer) !== region) return null;
    if (!range.toString().trim()) return null;
    return { range, region };
  }, [regionOf]);

  /** What letting go of a selection does, which is what the toggle governs. */
  const settle = useCallback(
    ({ range, region }: { range: Range; region: Region }) => {
      const root = wrapperOf(region);
      if (!root) return;

      if (autoApply) {
        // The armed style wins outright here: this is the student choosing to
        // paint everything they select the same way.
        if (paint(range, root, () => style).length) {
          window.getSelection()?.removeAllRanges();
          capture();
        }
        return;
      }

      pendingRange.current = range.cloneRange();
      activeMark.current = null;
      activeRegion.current = region;
      openAt(range.getBoundingClientRect(), false, null);
    },
    [autoApply, capture, openAt, style, wrapperOf],
  );

  /**
   * Mouse-up is watched on the document, not on the regions: a drag that ends
   * past the last line releases outside them, and losing the selection there is
   * the most common way to select text.
   */
  useEffect(() => {
    const onMouseUp = (e: MouseEvent) => {
      // Clicks on the toolbar itself act on the selection, not re-open on it.
      if ((e.target as Element | null)?.closest?.('[role="toolbar"]')) return;
      const found = selectionRange();
      if (!found) return;
      settle(found);
    };
    document.addEventListener("mouseup", onMouseUp);
    return () => document.removeEventListener("mouseup", onMouseUp);
  }, [selectionRange, settle]);

  // Touch devices have no mouse-up worth listening to: the handles keep moving
  // after the finger lifts, so this waits for the selection to settle.
  useEffect(() => {
    if (!window.matchMedia?.("(pointer: coarse)").matches) return;

    let timer: ReturnType<typeof setTimeout> | null = null;
    const onSelectionChange = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        const found = selectionRange();
        if (!found) return;
        settle(found);
      }, 400);
    };

    document.addEventListener("selectionchange", onSelectionChange);
    return () => {
      if (timer) clearTimeout(timer);
      document.removeEventListener("selectionchange", onSelectionChange);
    };
  }, [selectionRange, settle]);

  /** Opening the toolbar over an existing highlight edits it rather than making a new one. */
  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      const mark = (e.target as HTMLElement)?.closest?.(MARK) as HTMLElement | null;
      const region = mark && regionOf(mark);
      if (!mark || !region) return;
      const selection = window.getSelection();
      if (selection && !selection.isCollapsed) return; // a drag that ended on a mark
      activeMark.current = mark;
      activeRegion.current = region;
      pendingRange.current = null;
      openAt(mark.getBoundingClientRect(), true, readStyle(mark));
    };

    document.addEventListener("click", onClick);
    return () => document.removeEventListener("click", onClick);
  }, [openAt, regionOf]);

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

  /**
   * Runs a toolbar action against whatever the toolbar was opened on, arms the
   * style it produced, and returns the marks it touched.
   */
  const restyle = useCallback(
    (change: (current: MarkStyle | null) => MarkStyle) => {
      const root = wrapperOf(activeRegion.current);
      let marks: HTMLElement[] = [];

      if (activeMark.current && root) {
        // The whole highlight, not just the fragment that was clicked.
        marks = groupOf(activeMark.current, root);
        marks.forEach((mark) => writeStyle(mark, change(readStyle(mark))));
      } else if (pendingRange.current && root) {
        marks = paint(pendingRange.current, root, change);
        if (marks.length) window.getSelection()?.removeAllRanges();
      }

      if (!marks.length) return marks;
      arm(readStyle(marks[0]));
      capture();
      return marks;
    },
    [arm, capture, wrapperOf],
  );

  /** A colour keeps whatever rule the highlight already had. */
  const applyColor = useCallback(
    (color: HighlightColor) => {
      restyle((current) => ({ color, underline: current?.underline ?? null }));
      closeToolbar();
    },
    [closeToolbar, restyle],
  );

  /**
   * An underline keeps the fill, and gives an unhighlighted selection the armed
   * colour — there is no underline without a highlight under it.
   */
  const applyUnderline = useCallback(
    (kind: UnderlineKind | null) => {
      restyle((current) => ({ color: current?.color ?? style.color, underline: kind }));
      closeToolbar();
    },
    [closeToolbar, restyle, style.color],
  );

  const removeAtSelection = useCallback(() => {
    const root = wrapperOf(activeRegion.current);

    if (activeMark.current && root) {
      groupOf(activeMark.current, root).forEach(unwrap);
    } else if (pendingRange.current && root) {
      erase(pendingRange.current, root);
    }
    window.getSelection()?.removeAllRanges();
    capture();
    closeToolbar();
  }, [capture, closeToolbar, wrapperOf]);

  /**
   * Starts a note on the selection or the clicked highlight, highlighting it
   * first if it is bare, and opens its card in the notes panel to be typed in.
   */
  const startNote = useCallback(() => {
    const root = wrapperOf(activeRegion.current);
    const marks =
      activeMark.current && root
        ? groupOf(activeMark.current, root)
        : pendingRange.current && root
          ? paint(pendingRange.current, root, (current) => current ?? style)
          : [];
    if (!marks.length) return;

    // The note belongs to the highlight, so it is keyed by the group: one
    // highlight carries one note however many marks it is made of.
    const existing = marks.find((mark) => mark.dataset.nid)?.dataset.nid;
    const id = existing || groupId(marks[0]) || crypto.randomUUID();
    if (!existing) {
      // The placeholder keeps the card alive until the first word is typed.
      marks.forEach((mark) => writeNote(mark, "…", id));
    }
    window.getSelection()?.removeAllRanges();
    capture();
    closeToolbar();
    setEditingNote(id);
  }, [capture, closeToolbar, style, wrapperOf]);

  /** The marks carrying a note, wherever in the question it was made. */
  const findNote = useCallback(
    (id: string) =>
      REGIONS.flatMap((region) => {
        const content = contentOf(region);
        return content ? marksWithNote(content, id) : [];
      }),
    [contentOf],
  );

  const saveNote = useCallback(
    (id: string, text: string) => {
      const marks = findNote(id);
      if (!marks.length) return;
      // Emptying a note deletes it; the highlight it was made on stays.
      marks.forEach((mark) => writeNote(mark, text, id));
      capture();
      setEditingNote(null);
    },
    [capture, findNote],
  );

  const removeNote = useCallback(
    (id: string) => {
      const marks = findNote(id);
      if (!marks.length) return;
      marks.forEach((mark) => writeNote(mark, "", id));
      capture();
      setEditingNote((open) => (open === id ? null : open));
    },
    [capture, findNote],
  );

  const clearHighlights = useCallback(() => {
    // Unwrapped in place rather than by re-rendering the saved markup, for the
    // same reason marks are added in place: a rewrite loses the scroll position.
    for (const region of REGIONS) {
      const content = contentOf(region);
      if (content) eraseAll(content);
    }
    setSaved((s) => {
      const next = { ...s };
      delete next[questionKey];
      return next;
    });
    persist(questionKey, { html: null, stem: null });
    setNotes([]);
    setEditingNote(null);
    closeToolbar();
  }, [closeToolbar, contentOf, persist, questionKey]);

  return {
    /** Wrap the passage in this, and the question stem in the other. */
    stimulusRef,
    stemRef,
    highlightHtml: rendered.html,
    highlightStem: rendered.stem,
    clearHighlights,
    toolbar,
    closeToolbar,
    applyColor,
    applyUnderline,
    removeAtSelection,
    startNote,
    /** The armed style, and the line style the underline button reuses. */
    style,
    underlineKind,
    /** Notes on this question, for the notes panel. */
    notes,
    editingNote,
    setEditingNote,
    saveNote,
    removeNote,
  };
}
