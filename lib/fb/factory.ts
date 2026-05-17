import { env } from "@/lib/env";
import { getSecret } from "@/lib/secrets/queries";
import { makeFBRealClient } from "./real";
import { makeFBMockClient } from "./mock";
import type { FBClient } from "./client";

export async function makeFBClient(): Promise<FBClient> {
  if (env().NODE_ENV === "test") return makeFBMockClient();
  const token = await getSecret("fb.access_token");
  if (!token) throw new Error("missing secret: fb.access_token (set in /settings)");
  return makeFBRealClient({ accessToken: token });
}
