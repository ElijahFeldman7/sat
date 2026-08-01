"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

/** One-click drill creation for the adaptive and SRS dashboard cards. */
export function QuickDrillButton({
  label,
  body,
  disabled,
  className = "",
}: {
  label: string;
  body: Record<string, unknown>;
  disabled?: boolean;
  className?: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function create() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/drills", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ timingMode: "per-question", secondsPerQuestion: 75, ...body }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Could not create drill");
      router.push(`/session/${data.id}`);
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  }

  return (
    <div className={className}>
      <button
        type="button"
        onClick={create}
        disabled={disabled || busy}
        className="inline-flex h-[42px] items-center rounded-full bg-bb-blue px-[22px] text-[16px] font-bold text-white hover:bg-bb-blue-hover disabled:cursor-not-allowed disabled:bg-black/15 disabled:text-black/40"
      >
        {busy ? "Building…" : label}
      </button>
      {error && <p className="mt-[8px] text-[14px] text-[#c62828]">{error}</p>}
    </div>
  );
}
