import { env } from "@/lib/env";
import { makeFirstPartyClient } from "./firstparty";
import { makeMockSmartlinkClient } from "./mock";
import type { SmartlinkClient } from "./client";

export async function makeSmartlinkClient(): Promise<SmartlinkClient> {
  if (env().NODE_ENV === "test") return makeMockSmartlinkClient();
  return makeFirstPartyClient({ appUrl: env().APP_URL });
}
