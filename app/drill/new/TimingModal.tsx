"use client";

import { useState } from "react";

function fmt(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.round(seconds % 60);
  return m > 0 ? `${m}:${String(s).padStart(2, "0")}` : `${s}s`;
}

/**
 * Pacing chooser. Per-question is the default; flipping the toggle slides that
 * row away and reveals a single total-time slider instead.
 */
export function TimingModal({
  count,
  busy,
  onCancel,
  onConfirm,
}: {
  count: number;
  busy: boolean;
  onCancel: () => void;
  onConfirm: (t: {
    timingMode: "per-question" | "total" | "untimed";
    secondsPerQuestion?: number;
    totalSeconds?: number;
  }) => void;
}) {
  const [useTotal, setUseTotal] = useState(false);
  const [untimed, setUntimed] = useState(false);
  const [perQuestion, setPerQuestion] = useState(75);
  const [totalMinutes, setTotalMinutes] = useState(Math.max(1, Math.round((count * 75) / 60)));

  function confirm() {
    if (untimed) return onConfirm({ timingMode: "untimed" });
    if (useTotal) return onConfirm({ timingMode: "total", totalSeconds: totalMinutes * 60 });
    onConfirm({ timingMode: "per-question", secondsPerQuestion: perQuestion });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-black/30 p-[16px] md:p-6">
      <div className="bb-pop my-auto w-full max-w-[560px] rounded-[10px] bg-white p-[20px] shadow-[0_10px_50px_rgba(0,0,0,0.3)] md:p-[30px]">
        <h2 className="text-[24px] font-bold leading-[1.2] text-bb-ink">Set your pacing</h2>
        <p className="mt-[6px] text-[15px] text-black/55">
          {count} question{count === 1 ? "" : "s"}
        </p>

        <div className={`mt-[24px] ${untimed ? "pointer-events-none opacity-40" : ""}`}>
          {/* Per-question row — slides out when total mode is on */}
          <div
            className="overflow-hidden transition-all duration-200"
            style={{ maxHeight: useTotal ? 0 : 190, opacity: useTotal ? 0 : 1 }}
          >
            <label className="block text-[16px] font-bold text-bb-ink">Time per question</label>
            <div className="mt-[14px] flex items-center gap-[16px]">
              <input
                type="range"
                min={15}
                max={180}
                step={5}
                value={perQuestion}
                onChange={(e) => setPerQuestion(Number(e.target.value))}
                className="h-[4px] flex-1 accent-[#384cc0]"
              />
              <span className="w-[64px] text-right text-[22px] font-bold tabular-nums text-bb-ink">
                {fmt(perQuestion)}
              </span>
            </div>
            <p className="mt-[12px] text-[15px] text-black/60">
              {count} × {fmt(perQuestion)} ={" "}
              <strong className="text-bb-ink">{fmt(count * perQuestion)}</strong> total
            </p>
            <p className="mt-[8px] text-[14px] leading-[1.5] text-black/45">
              A pacing ring next to the clock shows time left on the current question. It turns red
              and counts overtime — it never moves you on.
            </p>
          </div>

          {/* Total-time row — slides in */}
          <div
            className="overflow-hidden transition-all duration-200"
            style={{ maxHeight: useTotal ? 160 : 0, opacity: useTotal ? 1 : 0 }}
          >
            <label className="block text-[16px] font-bold text-bb-ink">Total time</label>
            <div className="mt-[14px] flex items-center gap-[16px]">
              <input
                type="range"
                min={1}
                max={60}
                step={1}
                value={totalMinutes}
                onChange={(e) => setTotalMinutes(Number(e.target.value))}
                className="h-[4px] flex-1 accent-[#384cc0]"
              />
              <span className="w-[64px] text-right text-[22px] font-bold tabular-nums text-bb-ink">
                {totalMinutes}m
              </span>
            </div>
            <p className="mt-[12px] text-[15px] text-black/60">
              ≈ {fmt((totalMinutes * 60) / count)} per question on average
            </p>
          </div>
        </div>

        <div className="mt-[22px] space-y-[12px] border-t border-black/10 pt-[18px]">
          <Check
            checked={useTotal}
            disabled={untimed}
            onChange={setUseTotal}
            label="Use a total time instead"
          />
          <Check
            checked={untimed}
            onChange={(v) => {
              setUntimed(v);
              if (v) setUseTotal(false);
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
