import type { NextRequest } from "next/server";
import { handle } from "@/lib/api";
import { requireUser } from "@/lib/session";
import { saveHighlight } from "@/lib/db/queries";
import { sanitizeQuestionHtml } from "@/lib/sanitize";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  return handle(async () => {
    const user = await requireUser();
    const { questionKey, html, stem } = (await req.json()) as {
      questionKey: string;
      /** The passage's markup, and the question's — either may be absent. */
      html: string | null;
      stem?: string | null;
    };

    await saveHighlight(user.id, questionKey, {
      html: html ? sanitizeQuestionHtml(html) : null,
      stem: stem ? sanitizeQuestionHtml(stem) : null,
    });
    return { ok: true };
  });
}
