"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { LogoLockup } from "@/components/Logo";

export interface NavItem {
  href: string;
  label: string;
}

/**
 * App chrome navigation.
 *
 * Two layouts from one component: the desktop band matches the Bluebook header
 * (logo, inline links, name and sign-out on the right), while below `md` the
 * header is fixed to the top and the links move into a full-screen sheet behind
 * a hamburger. The logo is dropped on mobile — at that width the lockup crowds
 * the hamburger and reads as clutter rather than branding.
 */
export function AppNav({
  items,
  active,
  userName,
  signOut,
}: {
  items: NavItem[];
  active?: string;
  userName: string;
  signOut: () => Promise<void>;
}) {
  const [open, setOpen] = useState(false);

  // The sheet covers the viewport, so the page behind it must not scroll —
  // otherwise closing the menu returns you somewhere you never navigated to.
  useEffect(() => {
    if (!open) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  const activeLabel = items.find((i) => i.href === active)?.label;

  return (
    <>
      <header className="bb-dash-b fixed inset-x-0 top-0 z-40 flex h-[58px] shrink-0 items-center bg-bb-band px-[16px] md:static md:h-[78px] md:px-[24px] lg:px-[43px]">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-label={open ? "Close menu" : "Open menu"}
          aria-expanded={open}
          aria-controls="app-mobile-menu"
          className="-ml-[8px] flex h-[40px] w-[40px] items-center justify-center rounded-[8px] text-bb-ink hover:bg-black/5 md:hidden"
        >
          {open ? <CloseGlyph /> : <BurgerGlyph />}
        </button>

        {/* Mobile: the current page name stands in for the hidden logo. */}
        <span className="ml-[4px] text-[17px] font-bold text-bb-ink md:hidden">
          {activeLabel ?? "SAT Drill"}
        </span>

        <Link href="/dashboard" aria-label="SAT Drill home" className="hidden md:block">
          <LogoLockup />
        </Link>

        <nav className="ml-[28px] hidden items-center gap-[20px] md:flex lg:ml-[44px] lg:gap-[26px]">
          {items.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={`text-[15px] leading-none lg:text-[16px] ${
                active === item.href ? "font-bold text-bb-blue" : "text-bb-ink hover:text-bb-blue"
              }`}
            >
              {item.label}
            </Link>
          ))}
        </nav>

        <div className="ml-auto hidden items-center gap-[18px] md:flex">
          <span className="max-w-[180px] truncate text-[15px] font-bold text-bb-ink lg:text-[16px]">
            {userName}
          </span>
          <form action={signOut}>
            <button type="submit" className="text-[15px] text-bb-blue hover:underline">
              Sign out
            </button>
          </form>
        </div>
      </header>

      {/* Full-screen sheet, below the fixed header. */}
      {open && (
        <div
          id="app-mobile-menu"
          className="bb-pop fixed inset-x-0 bottom-0 top-[58px] z-40 flex flex-col overflow-y-auto bg-white md:hidden"
        >
          <nav className="flex flex-col px-[16px] py-[8px]">
            {items.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setOpen(false)}
                className={`border-b border-black/8 py-[18px] text-[19px] ${
                  active === item.href ? "font-bold text-bb-blue" : "text-bb-ink"
                }`}
              >
                {item.label}
              </Link>
            ))}
          </nav>

          <div className="mt-auto px-[16px] py-[20px]">
            <div className="truncate text-[16px] font-bold text-bb-ink">{userName}</div>
            <form action={signOut}>
              <button
                type="submit"
                className="mt-[10px] h-[46px] w-full rounded-full border border-bb-blue text-[16px] font-bold text-bb-blue"
              >
                Sign out
              </button>
            </form>
          </div>
        </div>
      )}
    </>
  );
}

function BurgerGlyph() {
  return (
    <svg viewBox="0 0 24 24" className="h-[22px] w-[22px]" aria-hidden="true">
      <g stroke="currentColor" strokeWidth="2" strokeLinecap="round">
        <path d="M3.5 6.5h17" />
        <path d="M3.5 12h17" />
        <path d="M3.5 17.5h17" />
      </g>
    </svg>
  );
}

function CloseGlyph() {
  return (
    <svg viewBox="0 0 24 24" className="h-[22px] w-[22px]" aria-hidden="true">
      <g stroke="currentColor" strokeWidth="2" strokeLinecap="round">
        <path d="M5.5 5.5l13 13" />
        <path d="M18.5 5.5l-13 13" />
      </g>
    </svg>
  );
}
