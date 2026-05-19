"use server";
import { revalidatePath } from "next/cache";
import { currentUser } from "@/lib/auth/current-user";
import { setSecret, deleteSecret } from "@/lib/secrets/mutations";

async function requireUser() {
  if (!(await currentUser())) throw new Error("unauthorized");
}

const ALLOWED_KEYS = new Set([
  "fb.access_token",
  "fb.ad_account_id",
  "fb.page_id",
  "spotify.client_id",
  "spotify.client_secret",
  "openrouter.api_key",
  "resend.api_key",
]);

export async function setSecretAction(formData: FormData) {
  await requireUser();
  const key = String(formData.get("key") ?? "");
  const value = String(formData.get("value") ?? "");
  if (!ALLOWED_KEYS.has(key)) throw new Error("unknown key");
  if (!value.trim()) throw new Error("value required");
  await setSecret(key, value.trim());
  revalidatePath("/settings");
}

export async function deleteSecretAction(formData: FormData) {
  await requireUser();
  const key = String(formData.get("key") ?? "");
  if (!ALLOWED_KEYS.has(key)) throw new Error("unknown key");
  await deleteSecret(key);
  revalidatePath("/settings");
}
