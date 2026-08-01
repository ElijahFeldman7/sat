"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { MODULES } from "@/lib/qbank/types";
import { ChoiceList } from "./ChoiceList";
import { DesmosPanel, loadDesmosWidth } from "./DesmosPanel";
import { ExamFooter } from "./ExamFooter";
import { ExamBanner } from "./ExamBanner";
import { ExamHeader } from "./ExamHeader";
import type { MoreMenuItem } from "./MoreMenu";
import { EraserIcon, ExitIcon, HelpIcon, KeyboardIcon, ListIcon } from "./icons";
import { QuestionHeader } from "./QuestionHeader";
import { QuestionHtml } from "./QuestionHtml";
import { QuestionNavPopover, toNavItems } from "./QuestionNav";
import { ReviewPage } from "./ReviewPage";
import { SplitPane } from "./SplitPane";
import { SprInput } from "./SprInput";
import { HighlightToolbar } from "./HighlightToolbar";
import { useHighlighter } from "./useHighlighter";
import type { ExamPayload, ExamQuestionState } from "./types";

type Patch = {
  idx: number;
  userAnswer?: string | null;
  markedForReview?: boolean;
  crossedOut?: string[];
  timeSpentMs?: number;
  started?: boolean;
};

export function ExamShell({
  payload,
  userName,
  highlights: initialHighlights,
}: {
  payload: ExamPayload;
  userName: string;
  highlights: Record<string, string>;
}) {
  const router = useRouter();
  const { set } = payload;
  const isMath = set.module === "math";

  // Resuming a set drops you back on the first question you haven't answered.
  const initialIdx = Math.max(
    0,
    payload.questions.findIndex((q) => !q.userAnswer),
  );

  const [questions, setQuestions] = useState<ExamQuestionState[]>(payload.questions);
  const [currentIdx, setCurrentIdx] = useState(initialIdx);
  const [onReviewPage, setOnReviewPage] = useState(false);
  const [navOpen, setNavOpen] = useState(false);
  const [crossOutMode, setCrossOutMode] = useState(false);
  const [highlightsOn, setHighlightsOn] = useState(false);
  const [clockHidden, setClockHidden] = useState(false);
  const [calcOpen, setCalcOpen] = useState(false);
  const [calcWidth, setCalcWidth] = useState(560);
  const [showDirections, setShowDirections] = useState(false);
  const [showMore, setShowMore] = useState(false);
  const [showShortcuts, setShowShortcuts] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [now, setNow] = useState(() => Date.now());

  const current = questions[currentIdx];
  const total = questions.length;

  useEffect(() => {
    // Restoring a persisted preference is only possible after mount.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setCalcWidth(loadDesmosWidth());
  }, []);

  // ---------------------------------------------------------------- timers
  /**
   * Stopwatch for the question on screen. Kept in state rather than a ref so
   * every render sees a value consistent with what it draws. It is re-based
   * only in `goTo`/`commitTime`, never on autosaves.
   */
  const [stopwatch, setStopwatch] = useState(() => ({
    startedAt: Date.now(),
    base: payload.questions[initialIdx]?.timeSpentMs ?? 0,
  }));

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(id);
  }, []);

  const liveQuestionMs = onReviewPage
    ? (current?.timeSpentMs ?? 0)
    : stopwatch.base + (now - stopwatch.startedAt);

  const sectionElapsedMs =
    questions.reduce((sum, q) => sum + q.timeSpentMs, 0) -
    (current?.timeSpentMs ?? 0) +
    liveQuestionMs;

  const { timingMode, secondsPerQuestion, totalSeconds } = set.config;
  const budgetMs =
    timingMode === "per-question" ? (secondsPerQuestion ?? 75) * 1000 : 0;
  const totalBudgetMs =
    timingMode === "per-question"
      ? budgetMs * total
      : timingMode === "total"
        ? (totalSeconds ?? 0) * 1000
        : 0;

  const clockMs =
    timingMode === "untimed"
      ? sectionElapsedMs
      : Math.max(0, totalBudgetMs - sectionElapsedMs);

  // ---------------------------------------------------------------- saving
  const pending = useRef<Map<number, Patch>>(new Map());
  const flushTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const flush = useCallback(async () => {
    if (pending.current.size === 0) return;
    const updates = [...pending.current.values()];
    pending.current.clear();
    try {
      await fetch(`/api/drills/${set.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ updates }),
      });
    } catch (err) {
      console.error("Autosave failed", err);
    }
  }, [set.id]);

  const queue = useCallback(
    (patch: Patch) => {
      const existing = pending.current.get(patch.idx) ?? { idx: patch.idx };
      pending.current.set(patch.idx, { ...existing, ...patch });
      if (flushTimer.current) clearTimeout(flushTimer.current);
      flushTimer.current = setTimeout(() => void flush(), 400);
    },
    [flush],
  );

  /** Writes the stopwatch for the question on screen into state + server. */
  const commitTime = useCallback(() => {
    const idx = currentIdx;
    const spent = stopwatch.base + (Date.now() - stopwatch.startedAt);
    setQuestions((qs) => qs.map((q) => (q.idx === idx ? { ...q, timeSpentMs: spent } : q)));
    queue({ idx, timeSpentMs: spent });
    return spent;
  }, [currentIdx, queue, stopwatch]);

  // Periodic + unload flush so a crash or refresh loses at most a few seconds.
  useEffect(() => {
    const id = setInterval(() => {
      commitTime();
      void flush();
    }, 15_000);
    return () => clearInterval(id);
  }, [commitTime, flush]);

  useEffect(() => {
    const onHide = () => {
      const idx = currentIdx;
      const spent = stopwatch.base + (Date.now() - stopwatch.startedAt);
      const updates = [...pending.current.values(), { idx, timeSpentMs: spent }];
      navigator.sendBeacon?.(
        `/api/drills/${set.id}`,
        new Blob([JSON.stringify({ updates })], { type: "application/json" }),
      );
    };
    window.addEventListener("pagehide", onHide);
    return () => window.removeEventListener("pagehide", onHide);
  }, [currentIdx, set.id, stopwatch]);

  useEffect(() => {
    void fetch(`/api/drills/${set.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ idx: 0, started: true }),
    });
  }, [set.id]);

  // ---------------------------------------------------------------- actions
  const update = useCallback(
    (idx: number, patch: Partial<ExamQuestionState>) => {
      setQuestions((qs) => qs.map((q) => (q.idx === idx ? { ...q, ...patch } : q)));
    },
    [],
  );

  const selectAnswer = useCallback(
    (value: string) => {
      update(currentIdx, { userAnswer: value });
      queue({ idx: currentIdx, userAnswer: value });
    },
    [currentIdx, queue, update],
  );

  const toggleMark = useCallback(() => {
    const next = !current?.markedForReview;
    update(currentIdx, { markedForReview: next });
    queue({ idx: currentIdx, markedForReview: next });
  }, [current, currentIdx, queue, update]);

  const toggleCrossOut = useCallback(
    (optionId: string) => {
      const existing = current?.crossedOut ?? [];
      const next = existing.includes(optionId)
        ? existing.filter((id) => id !== optionId)
        : [...existing, optionId];
      update(currentIdx, { crossedOut: next });
      queue({ idx: currentIdx, crossedOut: next });
    },
    [current, currentIdx, queue, update],
  );

  const goTo = useCallback(
    (idx: number) => {
      commitTime();
      const next = Math.max(0, Math.min(total - 1, idx));
      setCurrentIdx(next);
      setStopwatch({ startedAt: Date.now(), base: questions[next]?.timeSpentMs ?? 0 });
      setOnReviewPage(false);
      setNavOpen(false);
    },
    [commitTime, questions, total],
  );

  const submit = useCallback(async () => {
    setSubmitting(true);
    commitTime();
    await flush();
    try {
      const res = await fetch(`/api/drills/${set.id}/submit`, { method: "POST" });
      if (!res.ok) throw new Error(await res.text());
      router.push(`/results/${set.id}`);
    } catch (err) {
      console.error(err);
      setSubmitting(false);
      alert("Could not submit. Check your connection and try again.");
    }
  }, [commitTime, flush, router, set.id]);

  const onNext = useCallback(() => {
    if (onReviewPage) {
      void submit();
    } else if (currentIdx === total - 1) {
      commitTime();
      setOnReviewPage(true);
      setNavOpen(false);
    } else {
      goTo(currentIdx + 1);
    }
  }, [commitTime, currentIdx, goTo, onReviewPage, submit, total]);

  const onBack = useCallback(() => {
    if (onReviewPage) {
      setOnReviewPage(false);
      setCurrentIdx(total - 1);
    } else {
      goTo(currentIdx - 1);
    }
  }, [currentIdx, goTo, onReviewPage, total]);

  // ---------------------------------------------------------------- highlights
  const {
    stimulusRef,
    highlightHtml,
    onMouseUp,
    clearHighlights,
    toolbar,
    closeToolbar,
    applyStyle,
    removeAtSelection,
    setNote,
  } = useHighlighter({
    enabled: highlightsOn,
    questionKey: current?.key ?? "",
    initial: initialHighlights,
  });

  // ---------------------------------------------------------------- keyboard
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA")) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;

      const key = e.key.toLowerCase();
      const body = current?.body;

      if (body?.type === "mcq") {
        const letterIdx = ["a", "b", "c", "d", "e"].indexOf(key);
        if (letterIdx >= 0 && body.options[letterIdx]) {
          e.preventDefault();
          selectAnswer(body.options[letterIdx].id);
          return;
        }
      }
      if (key === "arrowright" || key === "enter") {
        e.preventDefault();
        onNext();
      } else if (key === "arrowleft") {
        e.preventDefault();
        onBack();
      } else if (key === "m") {
        toggleMark();
      } else if (key === "c") {
        setCrossOutMode((v) => !v);
      } else if (key === "h") {
        setHighlightsOn((v) => !v);
      } else if (key === "k" && isMath) {
        setCalcOpen((v) => !v);
      } else if (key === "escape") {
        setNavOpen(false);
        setShowDirections(false);
        setShowMore(false);
        setShowShortcuts(false);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [current, isMath, onBack, onNext, selectAnswer, toggleMark]);

  const navItems = useMemo(() => toNavItems(questions), [questions]);
  const sectionTitle = `Section 1: ${MODULES[set.module].name} Questions`;

  // Bluebook's banner is a single short label, not a breadcrumb — the drill's
  // topics and difficulty already live on the results and history pages.
  const bannerText =
    set.kind === "srs"
      ? "Review Misses"
      : set.kind === "adaptive"
        ? "Weak Spots"
        : "Practice Drill";

  const body = current?.body;
  const hasStimulus = !!body?.stimulus?.trim();

  const moreItems = useMemo<MoreMenuItem[]>(
    () => [
      {
        label: "Help",
        icon: <HelpIcon className="h-[22px] w-[22px]" />,
        onSelect: () => setShowDirections(true),
      },
      {
        label: "Shortcuts",
        icon: <KeyboardIcon className="h-[22px] w-[22px]" />,
        onSelect: () => setShowShortcuts(true),
      },
      {
        label: "Clear Highlights",
        icon: <EraserIcon className="h-[22px] w-[22px]" />,
        onSelect: clearHighlights,
      },
      {
        label: "Review Page",
        icon: <ListIcon className="h-[22px] w-[22px]" />,
        onSelect: () => {
          commitTime();
          setOnReviewPage(true);
        },
      },
      {
        label: "Exit the Exam",
        icon: <ExitIcon className="h-[22px] w-[22px]" />,
        onSelect: () => {
          commitTime();
          router.push("/dashboard");
        },
      },
    ],
    [clearHighlights, commitTime, router],
  );

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <ExamHeader
        title={`Section 1: ${MODULES[set.module].name}`}
        clockMs={clockMs}
        clockHidden={clockHidden}
        onToggleClock={() => setClockHidden((v) => !v)}
        pacing={
          timingMode === "per-question" && !onReviewPage
            ? { elapsedMs: liveQuestionMs, budgetMs }
            : null
        }
        showCalculator={isMath}
        calculatorOpen={calcOpen}
        onToggleCalculator={() => setCalcOpen((v) => !v)}
        onToggleDirections={() => setShowDirections((v) => !v)}
        highlightsOn={highlightsOn}
        onToggleHighlights={() => setHighlightsOn((v) => !v)}
        moreOpen={showMore}
        onToggleMore={() => setShowMore((v) => !v)}
        moreItems={moreItems}
      />

      <ExamBanner text={bannerText} />

      <div className="flex min-h-0 flex-1">
        {isMath && (
          <DesmosPanel
            open={calcOpen}
            width={calcWidth}
            onWidthChange={setCalcWidth}
            onClose={() => setCalcOpen(false)}
          />
        )}

        <main className="min-w-0 flex-1 bg-white">
          {onReviewPage ? (
            <ReviewPage
              title={sectionTitle}
              items={navItems}
              currentIdx={-1}
              onJump={goTo}
            />
          ) : !body ? (
            <div className="flex h-full items-center justify-center text-[17px] text-black/50">
              This question could not be loaded from the question bank.
            </div>
          ) : (
            <SplitPane
              singleColumn={!hasStimulus}
              left={
                <div
                  ref={stimulusRef}
                  onMouseUp={onMouseUp}
                  className={highlightsOn ? "cursor-text selection:bg-[#ffe484]" : ""}
                >
                  <QuestionHtml html={highlightHtml ?? body.stimulus} />
                </div>
              }
              right={
                <div>
                  <QuestionHeader
                    number={currentIdx + 1}
                    marked={current.markedForReview}
                    onToggleMark={toggleMark}
                    crossOutMode={crossOutMode}
                    onToggleCrossOut={() => setCrossOutMode((v) => !v)}
                  />
                  <div className="pt-[18px]">
                    <QuestionHtml html={body.stem} />
                  </div>
                  <div className="pt-[22px]">
                    {body.type === "mcq" ? (
                      <ChoiceList
                        options={body.options}
                        selected={current.userAnswer}
                        crossedOut={current.crossedOut}
                        crossOutMode={crossOutMode}
                        onSelect={selectAnswer}
                        onToggleCrossOut={toggleCrossOut}
                      />
                    ) : (
                      <SprInput value={current.userAnswer ?? ""} onChange={selectAnswer} />
                    )}
                  </div>
                </div>
              }
            />
          )}
        </main>
      </div>

      <ExamFooter
        userName={userName}
        current={onReviewPage ? total : currentIdx + 1}
        total={total}
        navOpen={navOpen}
        onToggleNav={() => setNavOpen((v) => !v)}
        onBack={onBack}
        onNext={onNext}
        showBack={onReviewPage || currentIdx > 0}
        nextLabel={onReviewPage ? (submitting ? "Submitting…" : "Submit") : "Next"}
      >
        {navOpen && (
          <QuestionNavPopover
            title={sectionTitle}
            items={navItems}
            currentIdx={onReviewPage ? -1 : currentIdx}
            onJump={goTo}
            onClose={() => setNavOpen(false)}
            onReviewPage={() => {
              commitTime();
              setOnReviewPage(true);
              setNavOpen(false);
            }}
          />
        )}
      </ExamFooter>

      {showDirections && (
        <Modal title="Directions" onClose={() => setShowDirections(false)}>
          <p>
            {isMath
              ? "Solve each problem and choose the best answer, or enter your answer in the box for student-produced responses. Figures are drawn to scale unless stated otherwise. All variables represent real numbers."
              : "Each question includes a passage or passages. Read each passage, then choose the best answer to the question based on what is stated or implied."}
          </p>
          <p className="mt-[14px] text-black/70">
            {timingMode === "per-question"
              ? `Pacing target: ${secondsPerQuestion}s per question. The ring next to the clock tracks the current question only — it never moves you on.`
              : timingMode === "total"
                ? `You have ${Math.round((totalSeconds ?? 0) / 60)} minutes for all ${total} questions.`
                : "This drill is untimed; the clock counts up."}
          </p>
        </Modal>
      )}

      {toolbar && (
        <HighlightToolbar
          state={toolbar}
          onApply={applyStyle}
          onRemove={removeAtSelection}
          onNote={setNote}
          onClose={closeToolbar}
        />
      )}

      {showShortcuts && (
        <Modal title="Shortcuts" onClose={() => setShowShortcuts(false)}>
          <dl className="grid grid-cols-[auto_1fr] gap-x-[18px] gap-y-[10px] text-[16px]">
            {[
              ["A – D", "Select an answer choice"],
              ["← / →", "Previous / next question"],
              ["M", "Mark for review"],
              ["C", "Cross out answers"],
              ["H", "Highlights & notes"],
              ...(isMath ? [["K", "Calculator"]] : []),
            ].map(([keys, what]) => (
              <div key={keys} className="contents">
                <dt className="whitespace-nowrap font-bold tabular-nums text-bb-ink">{keys}</dt>
                <dd className="text-black/70">{what}</dd>
              </div>
            ))}
          </dl>
        </Modal>
      )}
    </div>
  );
}

function Modal({
  title,
  children,
  onClose,
}: {
  title: string;
  children: React.ReactNode;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/25 p-6">
      <div className="bb-pop w-full max-w-[620px] rounded-[8px] bg-white p-[28px] shadow-[0_8px_40px_rgba(0,0,0,0.3)]">
        <div className="flex items-start justify-between pb-[14px]">
          <h2 className="text-[22px] font-bold text-bb-ink">{title}</h2>
          <button type="button" onClick={onClose} className="text-[15px] text-bb-blue hover:underline">
            Close
          </button>
        </div>
        <div className="border-t border-black/12 pt-[16px] text-[17px] leading-[1.55] text-bb-ink">
          {children}
        </div>
      </div>
    </div>
  );
}
