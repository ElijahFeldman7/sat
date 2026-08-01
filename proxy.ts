import { auth } from "@/auth";
import { NextResponse } from "next/server";

export default auth((req) => {
  if (!req.auth) {
    const url = new URL("/", req.nextUrl.origin);
    url.searchParams.set("next", req.nextUrl.pathname);
    return NextResponse.redirect(url);
  }
});

export const config = {
  matcher: ["/dashboard/:path*", "/drill/:path*", "/session/:path*", "/results/:path*", "/progress/:path*", "/history/:path*"],
};
