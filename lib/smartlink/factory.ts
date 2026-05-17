import { env } from "@/lib/env";
import { getSecret } from "@/lib/secrets/queries";
import { makeFeatureFmClient } from "./featurefm";
import { makeMockSmartlinkClient } from "./mock";
import type { SmartlinkClient } from "./client";

export async function makeSmartlinkClient(): Promise<SmartlinkClient> {
  if (env().NODE_ENV === "test") return makeMockSmartlinkClient();
  const apiKey = await getSecret("featurefm.api_key");
  if (!apiKey) throw new Error("missing secret: featurefm.api_key (set in /settings)");
  return makeFeatureFmClient({ apiKey });
}
