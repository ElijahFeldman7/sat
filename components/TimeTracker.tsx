"use client";

import { useEffect, useRef } from "react";

/** How often active time is added up. Bounds how much idle time can slip in. */
const TICK_MS = 10_000;
/** How often the accumulated seconds are sent to the server. */
const FLUSH_MS = 60_000;
/**
 * Silence after which the student is considered idle and the clock stops.
 * Generous on purpose: reading a passage produces no events for a while, and
 * under-counting real study time is worse than over-counting a short pause.
 */
const IDLE_MS = 120_000;

/** Events that count as being at the keyboard. */
const ACTIVITY_EVENTS = [
  "mousemove",
  "mousedown",
  "keydown",
  "wheel",
  "scroll",
  "touchstart",
  "pointerdown",
] as const;

/** Local calendar day, so buckets match the calendar the student sees. */
function localDay(at: number): string {
  const d = new Date(at);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate(),
  ).padStart(2, "0")}`;
}

/**
 * Records *active* time on the platform.
 *
 * Mounted once in the app chrome. A tab being open is not study time, so the
 * clock only advances while the tab is visible **and** the student has
 * interacted within the last two minutes — a page left open overnight, or a
 * background tab, contributes nothing. Time is accumulated locally in ticks and
 * flushed once a minute, so idle detection costs no network traffic.
 */
export function TimeTracker() {
  const lastActivity = useRef(0);
  const lastTick = useRef(0);
  /** Active seconds not yet sent, and the day they belong to. */
  const pending = useRef<{ day: string; seconds: number } | null>(null);

  useEffect(() => {
    const now = Date.now();
    lastActivity.current = now;
    lastTick.current = now;

    const markActive = () => {
      lastActivity.current = Date.now();
    };
    for (const type of ACTIVITY_EVENTS) {
      window.addEventListener(type, markActive, { passive: true, capture: true });
    }

    const accumulate = () => {
      const at = Date.now();
      const elapsed = at - lastTick.current;
      lastTick.current = at;
      if (elapsed <= 0) return;

      const idle = at - lastActivity.current > IDLE_MS;
      if (document.hidden || idle) return;

      // Cap the credit at one tick: a sleeping laptop can make `elapsed` huge.
      const seconds = Math.round(Math.min(elapsed, TICK_MS) / 1000);
      if (seconds <= 0) return;

      const day = localDay(at);
      // A session crossing midnight flushes the old day before switching.
      if (pending.current && pending.current.day !== day) flush(false);
      pending.current = { day, seconds: (pending.current?.seconds ?? 0) + seconds };
    };

    const flush = (unloading: boolean) => {
      const batch = pending.current;
      if (!batch || batch.seconds <= 0) return;
      pending.current = null;

      const body = JSON.stringify(batch);
      if (unloading && navigator.sendBeacon) {
        navigator.sendBeacon("/api/heartbeat", new Blob([body], { type: "application/json" }));
        return;
      }
      void fetch("/api/heartbeat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body,
        keepalive: unloading,
      }).catch(() => {
        /* a dropped beat costs a minute of credit; not worth surfacing */
      });
    };

    const tick = setInterval(accumulate, TICK_MS);
    const beat = setInterval(() => {
      accumulate();
      flush(false);
    }, FLUSH_MS);

    const onHide = () => {
      accumulate();
      flush(true);
      // Don't credit the time the tab spent in the background.
      lastTick.current = Date.now();
    };
    const onVisibility = () => {
      if (document.hidden) onHide();
      else {
        lastTick.current = Date.now();
        markActive();
      }
    };

    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("pagehide", onHide);

    return () => {
      clearInterval(tick);
      clearInterval(beat);
      for (const type of ACTIVITY_EVENTS) {
        window.removeEventListener(type, markActive, { capture: true });
      }
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("pagehide", onHide);
      accumulate();
      flush(true);
    };
  }, []);

  return null;
}
