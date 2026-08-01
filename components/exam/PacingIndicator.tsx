"use client";

/**
 * Per-question pacing ring. Purely informational — it never advances or locks
 * the question. Green while there's room, amber under 25%, red once the budget
 * is blown (at which point it counts overtime up).
 */
export function PacingIndicator({
  elapsedMs,
  budgetMs,
}: {
  elapsedMs: number;
  budgetMs: number;
}) {
  const remainingMs = budgetMs - elapsedMs;
  const over = remainingMs < 0;
  const fraction = Math.max(0, Math.min(1, remainingMs / budgetMs));

  const color = over ? "#c62828" : fraction <= 0.25 ? "#b26a00" : "#1d7a3e";
  const R = 11;
  const CIRC = 2 * Math.PI * R;

  const seconds = Math.round(Math.abs(remainingMs) / 1000);
  const label = `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;

  return (
    <div
      className="flex items-center gap-[7px] rounded-full bg-white/70 px-[9px] py-[3px]"
      title={
        over
          ? `${label} over your ${Math.round(budgetMs / 1000)}s target for this question`
          : `${label} left on this question`
      }
    >
      <svg width="26" height="26" viewBox="0 0 26 26" className="-rotate-90 shrink-0">
        <circle cx="13" cy="13" r={R} fill="none" stroke="#cdd4e4" strokeWidth="3" />
        <circle
          cx="13"
          cy="13"
          r={R}
          fill="none"
          stroke={color}
          strokeWidth="3"
          strokeLinecap="round"
          strokeDasharray={CIRC}
          strokeDashoffset={CIRC * (1 - fraction)}
          style={{ transition: "stroke-dashoffset 240ms linear, stroke 240ms linear" }}
        />
      </svg>
      <span
        className="text-[15px] font-semibold tabular-nums leading-none"
        style={{ color }}
      >
        {over ? `+${label}` : label}
      </span>
    </div>
  );
}
