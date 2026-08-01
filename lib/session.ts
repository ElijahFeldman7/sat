import { auth } from "@/auth";
import { upsertUser } from "@/lib/db/queries";

/**
 * Users already mirrored into the database by this process. Every request would
 * otherwise spend a database round trip re-writing the same row.
 */
const mirrored = new Map<string, number>();
const MIRROR_TTL_MS = 10 * 60 * 1000;

export interface CurrentUser {
  id: string;
  name: string;
  email: string | null;
  image: string | null;
}

/** Current signed-in user, mirrored into the local `users` table. */
export async function currentUser(): Promise<CurrentUser | null> {
  const session = await auth();
  if (!session?.user?.id) return null;

  const user: CurrentUser = {
    id: session.user.id,
    name: session.user.name ?? "Student",
    email: session.user.email ?? null,
    image: session.user.image ?? null,
  };
  const lastMirrored = mirrored.get(user.id) ?? 0;
  if (Date.now() - lastMirrored > MIRROR_TTL_MS) {
    await upsertUser(user);
    mirrored.set(user.id, Date.now());
  }
  return user;
}

export class Unauthorized extends Error {}

export async function requireUser(): Promise<CurrentUser> {
  const user = await currentUser();
  if (!user) throw new Unauthorized("Not signed in");
  return user;
}
