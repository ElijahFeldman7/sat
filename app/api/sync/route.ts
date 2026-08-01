import { handle } from "@/lib/api";
import { requireUser } from "@/lib/session";
import { lastSyncedAt, syncCatalog } from "@/lib/db/sync";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST() {
  return handle(async () => {
    await requireUser();
    const result = await syncCatalog(true);
    return { ...result, lastSyncedAt: await lastSyncedAt() };
  });
}

export async function GET() {
  return handle(async () => {
    await requireUser();
    return { lastSyncedAt: await lastSyncedAt() };
  });
}
