"use client";

import { useState } from "react";

/** One selected topic and how many of the drill's questions land in it. */
export interface TopicShare {
  name: string;
  questions: number;
  /** The student's own median on this topic, or null if they've not done it. */
  medianSeconds: number | null;
}

export const FALLBACK_SECONDS = 75;
const MIN_PER_Q = 15;
const MAX_PER_Q = 180;

function fmt(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.round(seconds % 60);
  return m > 0 ? `${m}:${String(s).padStart(2, "0")}` : `${s}s`;
}

function clampPerQuestion(n: number): number {
  return Math.min(MAX_PER_Q, Math.max(MIN_PER_Q, Math.round(n)));
}

/** Seeds each topic from the student's median there, rounded to the slider step. */
export function initialSeconds(topics: TopicShare[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const t of topics) {
    out[t.name] = clampPerQuestion(
      Math.round((t.medianSeconds ?? FALLBACK_SECONDS) / 5) * 5,
    );
  }
  return out;
}

/**
 * Pacing chooser.
 *
 * Time is built per topic, seeded from how long this student actually takes on
 * each one, and the total is the sum of those. Choosing a single total block
 * instead starts from that same sum and rescales the topics proportionally, so
 * the two views never disagree.
 */
export function TimingModal({
  count,
  topics,
  busy,
  onCancel,
  onConfirm,
}: {
  count: number;
  /** Topics receiving at least one question. One entry means no breakdown. */
  topics: TopicShare[];
  busy: boolean;
  onCancel: () => void;
  onConfirm: (t: {
    timingMode: "per-question" | "total" | "untimed";
    secondsPerQuestion?: number;
    totalSeconds?: number;
    secondsPerSkill?: Record<string, number>;
  }) => void;
}) {
  // Total is the default: it's already computed from the student's own medians,
  // so there is nothing to choose unless they want to override a single topic.
  const [perTopic, setPerTopic] = useState(false);
  const [untimed, setUntimed] = useState(false);
  const [perSkill, setPerSkill] = useState<Record<string, number>>(() => initialSeconds(topics));

  const breakdown = topics.length > 1;
  const seconds = (name: string) => perSkill[name] ?? FALLBACK_SECONDS;

  const totalSeconds = topics.reduce((sum, t) => sum + seconds(t.name) * t.questions, 0);
  const answered = topics.reduce((sum, t) => sum + t.questions, 0) || count;
  const averagePerQuestion = Math.round(totalSeconds / answered);

  /** Dragging the total rescales every topic, keeping their relative pacing. */
  function scaleTo(nextTotal: number) {
    const factor = nextTotal / Math.max(1, totalSeconds);
    setPerSkill((prev) => {
      const next: Record<string, number> = {};
      for (const t of topics) next[t.name] = clampPerQuestion((prev[t.name] ?? FALLBACK_SECONDS) * factor);
      return next;
    });
  }

  function confirm() {
    if (untimed) return onConfirm({ timingMode: "untimed" });
    // The per-topic figures ride along in total mode too. They are the medians
    // times whatever ratio the total was scaled by, which is what the pacing
    // ring needs to show a per-question target inside one shared block.
    onConfirm({
      timingMode: perTopic ? "per-question" : "total",
      secondsPerQuestion: averagePerQuestion,
      totalSeconds,
      secondsPerSkill: breakdown ? perSkill : undefined,
    });
  }

  const usingOwnTimes = topics.some((t) => t.medianSeconds !== null);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-black/30 p-[16px] md:p-6">
      <div className="bb-pop my-auto w-full max-w-[560px] rounded-[10px] bg-white p-[20px] shadow-[0_10px_50px_rgba(0,0,0,0.3)] md:p-[30px]">
        <h2 className="text-[24px] font-bold leading-[1.2] text-bb-ink">Set your pacing</h2>

        {/* The total is the headline in both modes, so switching never moves it. */}
        <div className="mt-[16px] flex items-baseline gap-[10px]">
          <span className="text-[34px] font-bold leading-none tabular-nums text-bb-ink">
            {untimed ? "—" : fmt(totalSeconds)}
          </span>
          <span className="text-[15px] text-black/55">
            {count} question{count === 1 ? "" : "s"}
            {!untimed && ` · ${fmt(averagePerQuestion)} each`}
          </span>
        </div>

        <div className={`mt-[20px] ${untimed ? "pointer-events-none opacity-40" : ""}`}>
          {!perTopic || !breakdown ? (
            <>
              <label className="block text-[16px] font-bold text-bb-ink">Total time</label>
              <input
                type="range"
                min={Math.max(1, Math.round((answered * MIN_PER_Q) / 60))}
                max={Math.round((answered * MAX_PER_Q) / 60)}
                step={1}
                value={Math.max(1, Math.round(totalSeconds / 60))}
                onChange={(e) => scaleTo(Number(e.target.value) * 60)}
                className="mt-[14px] h-[4px] w-full accent-[#384cc0]"
              />
            </>
          ) : (
            <>
              <div className="flex items-baseline justify-between">
                <label className="text-[16px] font-bold text-bb-ink">Time per topic</label>
                <button
                  type="button"
                  onClick={() => setPerSkill(initialSeconds(topics))}
                  className="text-[14px] text-bb-blue hover:underline"
                >
                  Reset
                </button>
              </div>
              <ul className="mt-[12px] space-y-[12px]">
                {topics.map((t) => (
                  <li key={t.name} className="flex items-center gap-[12px]">
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[15px] text-bb-ink">{t.name}</span>
                      <span className="text-[13px] text-black/45">
                        {t.questions} q
                        {t.medianSeconds === null && " · no history yet"}
                      </span>
                    </span>
                    <input
                      type="range"
                      min={MIN_PER_Q}
                      max={MAX_PER_Q}
                      step={5}
                      value={seconds(t.name)}
                      onChange={(e) =>
                        setPerSkill((p) => ({ ...p, [t.name]: Number(e.target.value) }))
                      }
                      aria-label={`Seconds per question for ${t.name}`}
                      className="h-[4px] w-[150px] shrink-0 accent-[#384cc0] sm:w-[190px]"
                    />
                    <span className="w-[46px] shrink-0 text-right text-[15px] font-bold tabular-nums text-bb-ink">
                      {fmt(seconds(t.name))}
                    </span>
                  </li>
                ))}
              </ul>
            </>
          )}

          <p className="mt-[14px] text-[14px] leading-[1.5] text-black/45">
            {usingOwnTimes
              ? "Starting from your own median time on each topic."
              : `Starting at ${FALLBACK_SECONDS}s — once you've drilled these topics this uses your own pace.`}
          </p>
        </div>

        <div className="mt-[20px] space-y-[12px] border-t border-black/10 pt-[18px]">
          {breakdown && (
            <Check
              checked={perTopic}
              disabled={untimed}
              onChange={setPerTopic}
              label="Adjust each topic separately"
            />
          )}
          <Check
            checked={untimed}
            onChange={(v) => {
              setUntimed(v);
              if (v) setPerTopic(false);
            }}
            label="Untimed — just count up"
          />
        </div>

        <div className="mt-[26px] flex justify-end gap-[12px]">
          <button
            type="button"
            onClick={onCancel}
            className="h-[42px] rounded-full px-[20px] text-[16px] font-medium text-bb-ink hover:bg-black/5"
          >
            Back
          </button>
          <button
            type="button"
            onClick={confirm}
            disabled={busy}
            className="h-[42px] rounded-full bg-bb-blue px-[26px] text-[16px] font-bold text-white hover:bg-bb-blue-hover disabled:bg-black/20"
          >
            {busy ? "Building…" : "Start drill"}
          </button>
        </div>
      </div>
    </div>
  );
}

function Check({
  checked,
  onChange,
  label,
  disabled,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className="flex items-center gap-[11px] text-left disabled:opacity-40"
    >
      <span
        className={`flex h-[20px] w-[20px] shrink-0 items-center justify-center rounded-[4px] border-[1.5px] ${
          checked ? "border-bb-blue bg-bb-blue text-white" : "border-black/35"
        }`}
      >
        {checked && (
          <svg viewBox="0 0 16 16" className="h-[13px] w-[13px]">
            <path
              d="m3.5 8.4 3 3 6-6.6"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        )}
      </span>
      <span className="text-[15px] text-bb-ink">{label}</span>
    </button>
  );
}
