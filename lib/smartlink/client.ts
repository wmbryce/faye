import type { CreateSmartlinkInput, Smartlink, SmartlinkMetrics } from "./types";

export interface SmartlinkClient {
  create(input: CreateSmartlinkInput): Promise<Smartlink>;
  getDailyMetrics(args: { smartlinkId: string; date: string }): Promise<SmartlinkMetrics>;
}
