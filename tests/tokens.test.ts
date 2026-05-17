import { describe, it, expect } from "vitest";
import { signToken, verifyToken } from "@/lib/auth/tokens";

const SECRET = "a".repeat(32);

describe("tokens", () => {
  it("roundtrip", async () => {
    const token = await signToken({ payload: { sub: "user@x" }, ttlMs: 10_000, secret: SECRET });
    const v = await verifyToken({ token, secret: SECRET });
    expect(v.ok).toBe(true);
    if (v.ok) expect(v.payload.sub).toBe("user@x");
  });

  it("rejects tampered token", async () => {
    const token = await signToken({ payload: { sub: "user@x" }, ttlMs: 10_000, secret: SECRET });
    const tampered = token.slice(0, -2) + (token.endsWith("aa") ? "bb" : "aa");
    const v = await verifyToken({ token: tampered, secret: SECRET });
    expect(v.ok).toBe(false);
  });

  it("rejects expired token", async () => {
    const token = await signToken({ payload: { sub: "user@x" }, ttlMs: -1, secret: SECRET });
    const v = await verifyToken({ token, secret: SECRET });
    expect(v.ok).toBe(false);
  });
});
