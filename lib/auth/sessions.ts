export { SESSION_COOKIE_NAME, SESSION_COOKIE_MAX_AGE } from "./cookie";
import { randomBytes, createHash } from "node:crypto";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { sessions } from "@/lib/db/schema";

const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("base64url");
}

export async function createSession(args: { userId: string }) {
  const token = randomBytes(32).toString("base64url");
  const tokenHash = hashToken(token);
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS);
  await db.insert(sessions).values({ userId: args.userId, tokenHash, expiresAt });
  return { token, expiresAt };
}

export async function verifySessionToken(token: string) {
  const tokenHash = hashToken(token);
  const [row] = await db.select().from(sessions).where(eq(sessions.tokenHash, tokenHash)).limit(1);
  if (!row) return null;
  if (row.expiresAt.getTime() < Date.now()) return null;
  return { sessionId: row.id, userId: row.userId, expiresAt: row.expiresAt };
}

export async function destroySession(token: string) {
  const tokenHash = hashToken(token);
  await db.delete(sessions).where(eq(sessions.tokenHash, tokenHash));
}

