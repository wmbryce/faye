import { describe, it, expect } from "vitest";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";

describe("db", () => {
  it("inserts and reads a user", async () => {
    const [u] = await db.insert(users).values({ email: "a@b.c" }).returning();
    expect(u.email).toBe("a@b.c");
    const rows = await db.select().from(users);
    expect(rows).toHaveLength(1);
  });
});
