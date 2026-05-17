import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { consumedRejectTokens } from "@/lib/db/schema";
import { signToken, verifyToken } from "@/lib/auth/tokens";
import { env } from "@/lib/env";

const REJECT_TTL_MS = 24 * 60 * 60 * 1000;
const TOKEN_KIND = "reject";

/** Mint a signed reject token for a specific ad. 24h TTL. */
export function makeRejectToken(adId: string): Promise<string> {
  return signToken({
    payload: { adId, kind: TOKEN_KIND },
    ttlMs: REJECT_TTL_MS,
    secret: env().AUTH_TOKEN_SECRET,
  });
}

export type RejectVerifyResult =
  | { ok: true; adId: string; nonce: string }
  | { ok: false; reason: "malformed" | "bad_signature" | "expired" | "wrong_kind" | "already_used" };

/**
 * Verify a reject token. Does NOT consume — caller must call consumeRejectToken
 * after rendering the confirm page so back-button reuse is impossible.
 */
export async function verifyRejectToken(token: string): Promise<RejectVerifyResult> {
  const v = await verifyToken<{ adId: string; kind: string }>({ token, secret: env().AUTH_TOKEN_SECRET });
  if (!v.ok) return { ok: false, reason: v.reason };
  if (v.payload.kind !== TOKEN_KIND) return { ok: false, reason: "wrong_kind" };
  if (typeof v.payload.adId !== "string" || !v.payload.adId) return { ok: false, reason: "malformed" };
  const [used] = await db
    .select({ nonce: consumedRejectTokens.nonce })
    .from(consumedRejectTokens)
    .where(eq(consumedRejectTokens.nonce, v.payload.nonce))
    .limit(1);
  if (used) return { ok: false, reason: "already_used" };
  return { ok: true, adId: v.payload.adId, nonce: v.payload.nonce };
}

/**
 * Record the nonce so a re-use returns `already_used`.
 * Returns true when this call was the first to consume the token; false when
 * another concurrent/prior call already inserted the same nonce. Callers should
 * use the return value to gate any side effects so two concurrent operators
 * (or a back-button retry) don't double-process the same reject.
 */
export async function consumeRejectToken(args: { nonce: string; adId: string }): Promise<boolean> {
  const rows = await db
    .insert(consumedRejectTokens)
    .values(args)
    .onConflictDoNothing()
    .returning({ nonce: consumedRejectTokens.nonce });
  return rows.length > 0;
}
