import type { NextRequest } from "next/server";
import { handle } from "@/lib/api";
import { requireUser } from "@/lib/session";
import { addDailyTime } from "@/lib/db/queries";
import { ready } from "@/lib/db/index";

export const runtime = "nodejs";

/**
 * The most a single beat may contribute. The client sends one roughly every
 * 60s, so anything larger is a clock jump, a replayed request, or a tab that
 * was asleep — none of which is time actually spent practising.
 */
const MAX_SECONDS_PER_BEAT = 90;

const DAY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export async function POST(req: NextRequest) {
  return handle(async () => {
    const user = await requireUser();
    const { day, seconds } = (await req.json()) as { day?: string; seconds?: number };

    if (!day || !DAY_PATTERN.test(day)) throw new Error("Invalid day");

    const clamped = Math.min(MAX_SECONDS_PER_BEAT, Math.max(0, Math.floor(Number(seconds) || 0)));
    if (clamped === 0) return { ok: true, seconds: 0 };

    await ready();
    await addDailyTime(user.id, day, clamped);
    return { ok: true, seconds: clamped };
  });
}
