import { eq, asc } from "drizzle-orm";
import { db } from "@/lib/db";
import { secrets } from "@/lib/db/schema";
import { decrypt } from "./crypto";

export async function getSecret(key: string): Promise<string | null> {
  const [row] = await db.select().from(secrets).where(eq(secrets.key, key)).limit(1);
  if (!row) return null;
  return decrypt(row.cipherText);
}

export async function listSecretKeys(): Promise<string[]> {
  const rows = await db.select({ key: secrets.key }).from(secrets).orderBy(asc(secrets.key));
  return rows.map((r) => r.key);
}
