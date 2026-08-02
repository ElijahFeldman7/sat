"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { ModuleKey } from "@/lib/qbank/types";

const MODULE_LABELS: Record<ModuleKey, string> = { math: "Math", rw: "Reading" };

/** One-click drill creation for the adaptive and SRS dashboard cards. */
export function QuickDrillButton({
  label,
  body,
  disabled,
  className = "",
  pickModule,
  defaultModule = "math",
}: {
  label: string;
  body: Record<string, unknown>;
  disabled?: boolean;
  className?: string;
  /** Shows a Math / Reading switch whose choice overrides `body.module`. */
  pickModule?: boolean;
  defaultModule?: ModuleKey;
}) {
  const router = useRouter();
  const [module, setModule] = useState<ModuleKey>(defaultModule);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function create() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/drills", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          timingMode: "per-question",
          secondsPerQuestion: 75,
          ...body,
          ...(pickModule ? { module } : {}),
        }),
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
      {pickModule && (
        <div className="mb-[12px] flex w-fit overflow-hidden rounded-[8px] border border-black/20">
          {(Object.keys(MODULE_LABELS) as ModuleKey[]).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => setModule(m)}
              aria-pressed={module === m}
              className={`h-[32px] px-[16px] text-[14px] font-medium ${
                module === m ? "bg-bb-blue text-white" : "bg-white text-bb-ink hover:bg-black/5"
              }`}
            >
              {MODULE_LABELS[m]}
            </button>
          ))}
        </div>
      )}
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
