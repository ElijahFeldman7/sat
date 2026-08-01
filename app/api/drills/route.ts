import type { NextRequest } from "next/server";
import { handle } from "@/lib/api";
import { requireUser } from "@/lib/session";
import { ensureCatalog } from "@/lib/db/sync";
import { listDrillSets } from "@/lib/db/queries";
import { createDrill, createSrsDrill, weakestSkills } from "@/lib/drills";
import { DEFAULT_ASSESSMENT_ID, type Difficulty, type ModuleKey } from "@/lib/qbank/types";

export const runtime = "nodejs";
export const maxDuration = 60;

interface Body {
  kind?: "topic" | "adaptive" | "srs";
  assessment?: number;
  module?: ModuleKey;
  skills?: string[];
  difficulties?: Difficulty[];
  count?: number;
  timingMode?: "per-question" | "total" | "untimed";
  secondsPerQuestion?: number;
  totalSeconds?: number;
  includeLegacy?: boolean;
  excludeSeen?: boolean;
}

export async function POST(req: NextRequest) {
  return handle(async () => {
    const user = await requireUser();
    await ensureCatalog();

    const body = (await req.json()) as Body;
    const assessmentId = body.assessment ?? DEFAULT_ASSESSMENT_ID;
    const moduleKey: ModuleKey = body.module === "rw" ? "rw" : "math";
    const count = Math.min(Math.max(body.count ?? 10, 1), 60);
    const timing = {
      timingMode: body.timingMode ?? "per-question",
      secondsPerQuestion: body.secondsPerQuestion ?? 75,
      totalSeconds: body.totalSeconds,
    } as const;

    if (body.kind === "srs") {
      return createSrsDrill(user.id, assessmentId, moduleKey, count, timing);
    }

    const skills =
      body.kind === "adaptive"
        ? await weakestSkills(user.id, assessmentId, moduleKey)
        : (body.skills ?? []);

    return createDrill(user.id, {
      assessmentId,
      module: moduleKey,
      skills,
      difficulties: body.difficulties ?? [],
      count,
      ...timing,
      includeLegacy: body.includeLegacy ?? true,
      excludeSeen: body.excludeSeen ?? true,
      kind: body.kind ?? "topic",
    });
  });
}

export async function GET() {
  return handle(async () => {
    const user = await requireUser();
    return { sets: await listDrillSets(user.id) };
  });
}
