import { createHmac, timingSafeEqual, randomBytes } from "node:crypto";

type Payload = Record<string, string | number>;

function b64url(buf: Buffer | string): string {
  return Buffer.from(buf).toString("base64url");
}
function b64urlDecode(s: string): Buffer {
  return Buffer.from(s, "base64url");
}
function hmac(secret: string, data: string): string {
  return createHmac("sha256", secret).update(data).digest("base64url");
}

export async function signToken(args: {
  payload: Payload;
  ttlMs: number;
  secret: string;
}): Promise<string> {
  const exp = Date.now() + args.ttlMs;
  const nonce = randomBytes(8).toString("base64url");
  const body = b64url(JSON.stringify({ ...args.payload, exp, nonce }));
  const sig = hmac(args.secret, body);
  return `${body}.${sig}`;
}

export type VerifyResult<P = Payload> =
  | { ok: true; payload: P & { exp: number; nonce: string } }
  | { ok: false; reason: "malformed" | "bad_signature" | "expired" };

export async function verifyToken<P = Payload>(args: {
  token: string;
  secret: string;
}): Promise<VerifyResult<P>> {
  const [body, sig] = args.token.split(".");
  if (!body || !sig) return { ok: false, reason: "malformed" };
  const expected = hmac(args.secret, body);
  const a = b64urlDecode(sig);
  const b = b64urlDecode(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return { ok: false, reason: "bad_signature" };
  let parsed: P & { exp: number; nonce: string };
  try {
    parsed = JSON.parse(b64urlDecode(body).toString("utf8"));
  } catch {
    return { ok: false, reason: "malformed" };
  }
  if (typeof parsed.exp !== "number" || parsed.exp < Date.now()) return { ok: false, reason: "expired" };
  return { ok: true, payload: parsed };
}
