import { AppShell } from "@/components/AppShell";
import { requireUser } from "@/lib/session";
import { ready } from "@/lib/db/index";
import { dailyTime, getDailyGoal, listUsers } from "@/lib/db/queries";
import { SettingsView } from "./SettingsView";

export const dynamic = "force-dynamic";

/** Only this account sees the user roster. */
const ADMIN_EMAIL = "elifeldman769@gmail.com";

export default async function SettingsPage() {
  const user = await requireUser();
  await ready();

  const isAdmin = user.email?.toLowerCase() === ADMIN_EMAIL;

  const [goal, days, users] = await Promise.all([
    getDailyGoal(user.id),
    dailyTime(user.id, 190),
    isAdmin ? listUsers() : Promise.resolve(null),
  ]);

  // Only the SSR value. `daily_time` is bucketed by the student's *local* day,
  // which the server cannot know — resolving it here in UTC reads the wrong row
  // for every student west of Greenwich once their evening passes midnight UTC.
  // SettingsView recomputes this against the real local day on mount.
  const serverTodaySeconds =
    days.find((d) => d.day === new Date().toISOString().slice(0, 10))?.seconds ?? 0;

  return (
    <AppShell active="/settings" userName={user.name}>
      <SettingsView
        initialGoal={goal}
        data={days}
        serverTodaySeconds={serverTodaySeconds}
        users={users}
      />
    </AppShell>
  );
}
