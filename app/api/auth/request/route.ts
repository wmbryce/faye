import { NextResponse } from "next/server";
import { z } from "zod";
import { env } from "@/lib/env";
import { signToken } from "@/lib/auth/tokens";
import { sendMagicLink } from "@/lib/email/client";

const Body = z.object({ email: z.string().email() });
const MAGIC_LINK_TTL_MS = 10 * 60 * 1000;

export async function POST(req: Request) {
  const body = Body.safeParse(await req.json().catch(() => ({})));
  if (!body.success) return NextResponse.json({ error: "invalid" }, { status: 400 });
  if (body.data.email.toLowerCase() !== env().OPERATOR_EMAIL.toLowerCase()) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  const token = await signToken({
    payload: { sub: body.data.email },
    ttlMs: MAGIC_LINK_TTL_MS,
    secret: env().AUTH_TOKEN_SECRET,
  });
  const url = `${env().APP_URL}/api/auth/verify?token=${encodeURIComponent(token)}`;
  await sendMagicLink({ to: body.data.email, url });
  return NextResponse.json({ ok: true });
}
