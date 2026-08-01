/**
 * Mints a local Auth.js session cookie for driving the signed-in UI during
 * development and screenshot verification. Requires AUTH_SECRET from .env.
 *
 *   npx tsx scripts/dev-session.ts
 */
import { encode } from "next-auth/jwt";
import { upsertUser } from "@/lib/db/queries";

const COOKIE = "authjs.session-token";

async function main() {
  const secret = process.env.AUTH_SECRET;
  if (!secret) throw new Error("AUTH_SECRET is not set");

  const id = "dev-local-user";
  upsertUser({ id, email: "dev@localhost", name: "Eli Feldman", image: null });

  const token = await encode({
    token: { sub: id, name: "Eli Feldman", email: "dev@localhost" },
    secret,
    salt: COOKIE,
    maxAge: 60 * 60 * 24,
  });

  console.log(`${COOKIE}=${token}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
