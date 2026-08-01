import type { NextRequest } from "next/server";
import { handle } from "@/lib/api";
import { requireUser } from "@/lib/session";
import { setDailyGoal } from "@/lib/db/queries";
import { ready } from "@/lib/db/index";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  return handle(async () => {
    const user = await requireUser();
    const { dailyGoalMinutes } = (await req.json()) as { dailyGoalMinutes?: number };

    await ready();
    // setDailyGoal clamps, so an out-of-range slider value is corrected rather
    // than rejected; the response carries what was actually stored.
    const saved = await setDailyGoal(user.id, Number(dailyGoalMinutes));
    return { dailyGoalMinutes: saved };
  });
}
