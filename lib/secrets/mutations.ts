import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { secrets } from "@/lib/db/schema";
import { encrypt } from "./crypto";

export async function setSecret(key: string, value: string): Promise<void> {
  const cipherText = encrypt(value);
  await db.insert(secrets).values({ key, cipherText }).onConflictDoUpdate({
    target: secrets.key,
    set: { cipherText, updatedAt: new Date() },
  });
}

export async function deleteSecret(key: string): Promise<void> {
  await db.delete(secrets).where(eq(secrets.key, key));
}
