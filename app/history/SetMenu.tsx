"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { MoreIcon } from "@/components/exam/icons";
import { localDay } from "@/lib/day";

/**
 * Per-row overflow menu on the history list. Delete is destructive and there is
 * no undo, so the menu asks a second time in place rather than acting on the
 * first tap.
 */
export function SetMenu({
  id,
  name,
  workedAt,
}: {
  id: string;
  name: string;
  /** When the set was worked, so its minutes come off the right local day. */
  workedAt: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  function close() {
    setOpen(false);
    setConfirming(false);
    setError(false);
  }

  useEffect(() => {
    if (!open) return;
    // Pointerdown, not click: the trigger's own handler toggles the menu, and a
    // click listener here would fire first and make reopening impossible.
    const onPointerDown = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node)) close();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    window.addEventListener("pointerdown", onPointerDown);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  async function remove() {
    setBusy(true);
    setError(false);
    try {
      const res = await fetch(`/api/drills/${id}`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ day: localDay(workedAt) }),
      });
      if (!res.ok) throw new Error(await res.text());
      close();
      router.refresh();
    } catch (err) {
      console.error("Delete failed", err);
      setError(true);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div ref={ref} className="relative shrink-0">
      <button
        type="button"
        onClick={() => (open ? close() : setOpen(true))}
        aria-label={`More options for ${name}`}
        aria-expanded={open}
        aria-haspopup="menu"
        className={`flex h-[34px] w-[34px] items-center justify-center rounded-full text-black/45 hover:bg-black/[0.06] hover:text-bb-ink ${
          open ? "bg-black/[0.06] text-bb-ink" : ""
        }`}
      >
        <MoreIcon className="h-[19px] w-[19px]" />
      </button>

      {open && (
        <div
          role="menu"
          className="bb-pop absolute right-0 top-full z-40 mt-[4px] w-[248px] overflow-hidden rounded-[8px] bg-white py-[6px] shadow-[0_4px_24px_rgba(0,0,0,0.22)]"
        >
          {confirming ? (
            <div className="px-[16px] py-[10px]">
              <p className="text-[15px] leading-[1.45] text-bb-ink">
                Delete this set? Its answers, practice minutes, review queue and
                highlights come off your account for good.
              </p>
              {error && (
                <p className="mt-[8px] text-[13px] text-[#c62828]">
                  Could not delete. Try again.
                </p>
              )}
              <div className="mt-[12px] flex justify-end gap-[14px] text-[15px]">
                <button
                  type="button"
                  onClick={close}
                  className="text-black/55 hover:underline"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => void remove()}
                  disabled={busy}
                  className="font-bold text-[#c62828] hover:underline disabled:opacity-50"
                >
                  {busy ? "Deleting…" : "Delete"}
                </button>
              </div>
            </div>
          ) : (
            <button
              type="button"
              role="menuitem"
              onClick={() => setConfirming(true)}
              className="flex h-[44px] w-full items-center px-[16px] text-left text-[16px] text-[#c62828] hover:bg-black/[0.05]"
            >
              Delete
            </button>
          )}
        </div>
      )}
    </div>
  );
}