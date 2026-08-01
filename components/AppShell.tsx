import Link from "next/link";
import { signOutAction } from "@/app/actions";
import { LogoLockup } from "@/components/Logo";

const NAV = [
  { href: "/dashboard", label: "Home" },
  { href: "/drill/new", label: "New Drill" },
  { href: "/progress", label: "Progress" },
  { href: "/history", label: "Past Sets" },
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
      <header className="bb-dash-b flex h-[78px] shrink-0 items-center bg-bb-band px-[43px]">
        <Link href="/dashboard" aria-label="SAT Drill home">
          <LogoLockup />
        </Link>

        <nav className="ml-[44px] flex items-center gap-[26px]">
          {NAV.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={`text-[16px] leading-none ${
                active === item.href ? "font-bold text-bb-blue" : "text-bb-ink hover:text-bb-blue"
              }`}
            >
              {item.label}
            </Link>
          ))}
        </nav>

        <div className="ml-auto flex items-center gap-[18px]">
          <span className="text-[16px] font-bold text-bb-ink">{userName}</span>
          <form action={signOutAction}>
            <button type="submit" className="text-[15px] text-bb-blue hover:underline">
              Sign out
            </button>
          </form>
        </div>
      </header>

      <main className="min-h-0 flex-1 overflow-y-auto bg-[#f7f7f7] bb-scroll">{children}</main>
    </div>
  );
}
