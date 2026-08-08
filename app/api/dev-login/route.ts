import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { encode } from "next-auth/jwt";

export const runtime = "nodejs";

const COOKIE = "authjs.session-token";

/**
 * Signs a fixed local user in without Google, for manual testing:
 *
 *   open http://localhost:3000/api/dev-login
 *
 * Mints the same Auth.js session cookie `scripts/dev-session.ts` prints, and
 * sets it, so there is no cookie to paste into devtools. Add `?next=/history`
 * to land somewhere other than the dashboard.
 *
 * **Development only.** This is an authentication bypass, so it answers 404
 * under `NODE_ENV=production` — which covers every deployed build as well as a
 * local `next build && next start`. It is reachable only from `next dev`.
 *
 * The `users` row is not written here: `currentUser()` mirrors the signed-in
 * user on the first request that needs it.
 */
export async function GET(req: NextRequest) {
  if (process.env.NODE_ENV === "production") {
    return new NextResponse("Not found", { status: 404 });
  }

  const secret = process.env.AUTH_SECRET;
  if (!secret) {
    return new NextResponse("AUTH_SECRET is not set — add it to .env\n", { status: 500 });
  }

  const token = await encode({
    token: { sub: "dev-local-user", name: "Eli Feldman", email: "dev@localhost" },
    secret,
    salt: COOKIE,
    maxAge: 60 * 60 * 24 * 7,
  });

  const next = req.nextUrl.searchParams.get("next") || "/dashboard";
  const res = NextResponse.redirect(new URL(next, req.nextUrl.origin));
  res.cookies.set(COOKIE, token, { httpOnly: true, sameSite: "lax", path: "/" });
  return res;
}
