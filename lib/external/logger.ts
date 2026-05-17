import { db } from "@/lib/db";
import { externalCalls } from "@/lib/db/schema";

export async function logExternalCall(args: {
  service: string;
  endpoint: string;
  method: string;
  status?: number;
  durationMs: number;
  error?: string;
  request?: unknown;
  response?: unknown;
}): Promise<void> {
  await db.insert(externalCalls).values({
    service: args.service,
    endpoint: args.endpoint,
    method: args.method,
    status: args.status ?? null,
    durationMs: args.durationMs,
    error: args.error ?? null,
    requestSummary: args.request ?? null,
    responseSummary: args.response ?? null,
  });
}
