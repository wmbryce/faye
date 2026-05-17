import { cookies } from "next/headers";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { verifySessionToken, SESSION_COOKIE_NAME } from "./sessions";

export async function currentUser() {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE_NAME)?.value;
  if (!token) return null;
  const s = await verifySessionToken(token);
  if (!s) return null;
  const [u] = await db.select().from(users).where(eq(users.id, s.userId)).limit(1);
  return u ?? null;
}
