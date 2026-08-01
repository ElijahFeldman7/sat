import type { NextRequest } from "next/server";
import { handle } from "@/lib/api";
import { requireUser } from "@/lib/session";
import { saveHighlight } from "@/lib/db/queries";
import { sanitizeQuestionHtml } from "@/lib/sanitize";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  return handle(async () => {
    const user = await requireUser();
    const { questionKey, html } = (await req.json()) as {
      questionKey: string;
      html: string | null;
    };

    await saveHighlight(user.id, questionKey, html ? sanitizeQuestionHtml(html) : null);
    return { ok: true };
  });
}
