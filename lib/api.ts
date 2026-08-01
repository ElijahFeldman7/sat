import { NextResponse } from "next/server";
import { Unauthorized } from "@/lib/session";

/** Wraps a route handler so auth failures and thrown errors become clean JSON. */
export async function handle<T>(fn: () => Promise<T>): Promise<NextResponse> {
  try {
    return NextResponse.json(await fn());
  } catch (err) {
    if (err instanceof Unauthorized) {
      return NextResponse.json({ error: "Not signed in" }, { status: 401 });
    }
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("API error:", err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
