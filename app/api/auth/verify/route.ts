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
  const v = await verifyToken<{ sub: string }>({ token, secret: env().AUTH_TOKEN_SECRET });
  if (!v.ok) return NextResponse.json({ error: v.reason }, { status: 401 });
  const email = v.payload.sub.toLowerCase();
  if (email !== env().OPERATOR_EMAIL.toLowerCase()) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  let [user] = await db.select().from(users).where(eq(users.email, email));
  if (!user) [user] = await db.insert(users).values({ email }).returning();
  const { token: sessionToken, expiresAt } = await createSession({ userId: user.id });
  const cookieValue = [
    `${SESSION_COOKIE_NAME}=${sessionToken}`,
    `Path=/`,
    `Max-Age=${SESSION_COOKIE_MAX_AGE}`,
    `Expires=${expiresAt.toUTCString()}`,
    `HttpOnly`,
    env().NODE_ENV === "production" ? `Secure` : "",
    `SameSite=Lax`,
  ]
    .filter(Boolean)
    .join("; ");
  return new Response(null, {
    status: 302,
    headers: { Location: "/", "Set-Cookie": cookieValue },
  });
}
