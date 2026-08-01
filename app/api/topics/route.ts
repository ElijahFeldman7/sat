import type { NextRequest } from "next/server";
import { handle } from "@/lib/api";
import { requireUser } from "@/lib/session";
import { ensureCatalog } from "@/lib/db/sync";
import { srsDueCount, topicTree } from "@/lib/db/queries";
import { DEFAULT_ASSESSMENT_ID, type ModuleKey } from "@/lib/qbank/types";

export const runtime = "nodejs";
export const maxDuration = 120;

export async function GET(req: NextRequest) {
  return handle(async () => {
    const user = await requireUser();
    await ensureCatalog();

    const params = req.nextUrl.searchParams;
    const assessmentId = Number(params.get("assessment")) || DEFAULT_ASSESSMENT_ID;
    const moduleKey = (params.get("module") === "rw" ? "rw" : "math") as ModuleKey;
    const includeLegacy = params.get("legacy") !== "0" && moduleKey === "math";
    const excludeSeen = params.get("unseen") !== "0";

    // In parallel: an object literal would await these one after the other,
    // paying two round trips to the database instead of one.
    const [domains, srsDue] = await Promise.all([
      topicTree(user.id, assessmentId, moduleKey, { includeLegacy, excludeSeen }),
      srsDueCount(user.id),
    ]);

    return { assessmentId, module: moduleKey, domains, srsDue };
  });
}
