import { redirect } from "next/navigation";
import { signIn } from "@/auth";
import { currentUser } from "@/lib/session";
import { LogoLockup, SatBadge } from "@/components/Logo";

export default async function LandingPage() {
  const user = await currentUser();
  if (user) redirect("/dashboard");

  return (
    <div className="flex h-full flex-col">
      <header className="bb-dash-b flex h-[78px] shrink-0 items-center bg-bb-band pl-[43px]">
        <LogoLockup />
      </header>

      <main className="flex flex-1 items-center justify-center px-6">
        <div className="w-full max-w-[520px] text-center">
          <SatBadge className="mx-auto mb-[28px] h-[76px] w-[76px]" />
          <h2 className="text-[42px] font-bold leading-[1.12] tracking-[-0.02em] text-bb-ink">
            Practice like it&rsquo;s test day.
          </h2>
          <p className="mx-auto mt-[20px] max-w-[430px] text-[18px] leading-[1.55] text-black/70">
            Build targeted drills from the real College Board question bank, in an exam interface
            that matches Bluebook. Active test questions are always excluded.
          </p>

          <form
            action={async () => {
              "use server";
              await signIn("google", { redirectTo: "/dashboard" });
            }}
            className="mt-[36px]"
          >
            <button
              type="submit"
              className="inline-flex h-[50px] items-center gap-[12px] rounded-full bg-bb-blue px-[28px] text-[17px] font-bold text-white hover:bg-bb-blue-hover"
            >
              <GoogleMark />
              Continue with Google
            </button>
          </form>
        </div>
      </main>
    </div>
  );
}

function GoogleMark() {
  return (
    <svg viewBox="0 0 48 48" className="h-[21px] w-[21px]" aria-hidden="true">
      <path
        fill="#FFC107"
        d="M43.6 20.1H42V20H24v8h11.3c-1.6 4.7-6.1 8-11.3 8a12 12 0 1 1 7.9-21l5.7-5.7A20 20 0 1 0 24 44a20 20 0 0 0 19.6-23.9Z"
      />
      <path
        fill="#FF3D00"
        d="m6.3 14.7 6.6 4.8A12 12 0 0 1 24 12c3.1 0 5.8 1.1 7.9 3l5.7-5.7A20 20 0 0 0 6.3 14.7Z"
      />
      <path
        fill="#4CAF50"
        d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2A11.9 11.9 0 0 1 12.7 28l-6.6 5A20 20 0 0 0 24 44Z"
      />
      <path
        fill="#1976D2"
        d="M43.6 20.1H42V20H24v8h11.3a12.1 12.1 0 0 1-4.1 5.6l6.2 5.2C36.9 40.2 44 35 44 24a20 20 0 0 0-.4-3.9Z"
      />
    </svg>
  );
}
