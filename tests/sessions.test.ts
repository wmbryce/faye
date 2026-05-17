import { describe, it, expect } from "vitest";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { createSession, verifySessionToken, destroySession } from "@/lib/auth/sessions";

describe("sessions", () => {
  it("creates and verifies", async () => {
    const [u] = await db.insert(users).values({ email: "a@b.c" }).returning();
    const { token } = await createSession({ userId: u.id });
    const s = await verifySessionToken(token);
    expect(s?.userId).toBe(u.id);
  });

  it("returns null for bogus token", async () => {
    const s = await verifySessionToken("not-a-real-token");
    expect(s).toBeNull();
  });

  it("returns null after destroy", async () => {
    const [u] = await db.insert(users).values({ email: "a@b.c" }).returning();
    const { token } = await createSession({ userId: u.id });
    await destroySession(token);
    const s = await verifySessionToken(token);
    expect(s).toBeNull();
  });
});
