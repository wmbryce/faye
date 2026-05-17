import { logExternalCall } from "./logger";

const DEFAULT_RETRIES = 4;
const BASE_DELAY_MS = 250;
const MAX_DELAY_MS = 30_000;

export type FetchOpts = {
  service: string;
  retries?: number;
  baseDelayMs?: number;
  redactRequest?: (init: RequestInit) => unknown;
  redactResponse?: (body: unknown) => unknown;
  /** Override sleep for tests. */
  sleepFn?: (ms: number) => Promise<void>;
};

export async function fetchWithBackoff(
  url: string,
  init: RequestInit,
  opts: FetchOpts,
): Promise<Response> {
  const retries = opts.retries ?? DEFAULT_RETRIES;
  const baseDelay = opts.baseDelayMs ?? BASE_DELAY_MS;
  const sleep = opts.sleepFn ?? defaultSleep;
  const started = Date.now();

  let lastErr: unknown;
  let lastStatus: number | undefined;

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await fetch(url, init);
      lastStatus = res.status;

      const retriable = res.status === 429 || res.status >= 500;
      if (retriable && attempt < retries) {
        const retryAfter = parseRetryAfter(res.headers.get("retry-after"));
        const backoff = baseDelay * Math.pow(2, attempt);
        const jitter = Math.random() * 100;
        const wait = Math.min(retryAfter ?? (backoff + jitter), MAX_DELAY_MS);
        await sleep(wait);
        continue;
      }

      if (retriable) break;

      // Fire-and-forget: logExternalCall is itself fail-open, so no .catch needed,
      // but using void avoids the response being held for the DB round-trip.
      void logExternalCall({
        service: opts.service,
        endpoint: url,
        method: init.method ?? "GET",
        status: res.status,
        durationMs: Date.now() - started,
        request: opts.redactRequest?.(init),
      });
      return res;
    } catch (err) {
      lastErr = err;
      if (attempt < retries) {
        const backoff = baseDelay * Math.pow(2, attempt);
        await sleep(Math.min(backoff + Math.random() * 100, MAX_DELAY_MS));
        continue;
      }
    }
  }

  // Errors awaited so the audit row is durable before we throw — logger is fail-open
  // so a DB failure here can never mask the upstream error.
  await logExternalCall({
    service: opts.service,
    endpoint: url,
    method: init.method ?? "GET",
    status: lastStatus,
    durationMs: Date.now() - started,
    error: lastErr instanceof Error ? lastErr.message : (lastStatus ? `http ${lastStatus}` : "unknown"),
    request: opts.redactRequest?.(init),
  });
  throw new Error(`fetchWithBackoff exhausted retries for ${url} (last status: ${lastStatus ?? "n/a"})`);
}

const ASSERT_BODY_MAX = 200;

/**
 * Throws a uniform `<label>: <status> <body>` error when res is non-2xx.
 * Body is truncated to ASSERT_BODY_MAX chars to limit accidental prompt/user-content
 * leakage into logs while preserving enough context for debugging.
 */
export async function assertOk(res: Response, label: string): Promise<void> {
  if (res.ok) return;
  const text = await res.text().catch(() => "");
  const trimmed = text.length > ASSERT_BODY_MAX ? `${text.slice(0, ASSERT_BODY_MAX)}…[truncated]` : text;
  throw new Error(`${label}: ${res.status} ${trimmed}`);
}

function parseRetryAfter(v: string | null): number | null {
  if (!v) return null;
  const n = Number(v);
  if (!Number.isNaN(n)) return Math.max(0, n * 1000);
  const at = Date.parse(v);
  return Number.isFinite(at) ? Math.max(0, at - Date.now()) : null;
}

function defaultSleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
