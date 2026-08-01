import { signOutAction } from "@/app/actions";
import { AppNav, type NavItem } from "@/components/AppNav";
import { TimeTracker } from "@/components/TimeTracker";

const NAV: NavItem[] = [
  { href: "/dashboard", label: "Home" },
  { href: "/drill/new", label: "New Drill" },
  { href: "/progress", label: "Progress" },
  { href: "/history", label: "Past Sets" },
  { href: "/settings", label: "Settings" },
];

/** App chrome outside the exam, styled to match the Bluebook header band. */
export function AppShell({
  children,
  active,
  userName,
}: {
  children: React.ReactNode;
  active?: string;
  userName: string;
}) {
  return (
    <div className="flex h-full flex-col">
      <TimeTracker />
      <AppNav items={NAV} active={active} userName={userName} signOut={signOutAction} />

      {/* The header is fixed below `md`, so the scroll container starts under it. */}
      <main className="min-h-0 flex-1 overflow-y-auto bg-[#f7f7f7] pt-[58px] bb-scroll md:pt-0">
        {children}
      </main>
    </div>
  );
}
