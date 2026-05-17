import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { env } from "@/lib/env";
import { verifyToken } from "@/lib/auth/tokens";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import {
  createSession,
  SESSION_COOKIE_NAME,
  SESSION_COOKIE_MAX_AGE,
} from "@/lib/auth/sessions";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const token = url.searchParams.get("token");
  if (!token) return NextResponse.json({ error: "missing token" }, { status: 401 });
  // NOTE: magic-link tokens are not single-use — they can be replayed within their
  // 10-minute TTL. Acceptable for a single-operator tool; revisit if multi-tenant.
  const v = await verifyToken<{ sub: string }>({ token, secret: env().AUTH_TOKEN_SECRET });
  if (!v.ok) return NextResponse.json({ error: v.reason }, { status: 401 });
  const email = v.payload.sub.toLowerCase();
  if (email !== env().OPERATOR_EMAIL.toLowerCase()) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  await db.insert(users).values({ email }).onConflictDoNothing();
  const [user] = await db.select().from(users).where(eq(users.email, email)).limit(1);
  if (!user) {
    return NextResponse.json({ error: "user lookup failed" }, { status: 500 });
  }
  const { token: sessionToken, expiresAt } = await createSession({ userId: user.id });
  const res = NextResponse.redirect(new URL("/", env().APP_URL), { status: 302 });
  res.cookies.set(SESSION_COOKIE_NAME, sessionToken, {
    httpOnly: true,
    secure: env().NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_COOKIE_MAX_AGE,
    expires: expiresAt,
  });
  return res;
}
