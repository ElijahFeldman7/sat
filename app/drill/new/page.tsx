import { AppShell } from "@/components/AppShell";
import { requireUser } from "@/lib/session";
import { ensureCatalog } from "@/lib/db/sync";
import { DrillBuilder } from "./DrillBuilder";

export const dynamic = "force-dynamic";

export default async function NewDrillPage() {
  const user = await requireUser();
  await ensureCatalog();

  return (
    <AppShell active="/drill/new" userName={user.name}>
      <DrillBuilder />
    </AppShell>
  );
}
