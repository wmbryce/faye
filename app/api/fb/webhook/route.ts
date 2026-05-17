import { NextResponse } from "next/server";
import { createHmac, timingSafeEqual } from "node:crypto";
import { markAdRejectedByFb } from "@/lib/ads/mutations";

// process.env is read directly here (not via the Zod env() cache) so that
// the route gracefully returns 503 when vars are absent, and so that
// tests can stub via vi.stubEnv without cache invalidation concerns.

/** GET — Meta verification challenge. */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const mode = url.searchParams.get("hub.mode");
  const token = url.searchParams.get("hub.verify_token");
  const challenge = url.searchParams.get("hub.challenge") ?? "";

  const verifyToken = process.env.FB_WEBHOOK_VERIFY_TOKEN;
  if (!verifyToken) {
    return NextResponse.json({ error: "webhook disabled" }, { status: 503 });
  }
  if (mode !== "subscribe" || token !== verifyToken) {
    return NextResponse.json({ error: "bad verify" }, { status: 403 });
  }
  return new NextResponse(challenge, { status: 200, headers: { "content-type": "text/plain" } });
}

/** POST — actual event delivery from Meta. */
export async function POST(req: Request) {
  const appSecret = process.env.FB_WEBHOOK_APP_SECRET;
  if (!appSecret) {
    return NextResponse.json({ error: "webhook disabled" }, { status: 503 });
  }

  const raw = await req.text();
  const sig = req.headers.get("x-hub-signature-256");
  if (!sig || !verifyFbSignature(raw, sig, appSecret)) {
    return NextResponse.json({ error: "bad signature" }, { status: 401 });
  }

  let body: unknown;
  try { body = JSON.parse(raw); } catch { return NextResponse.json({ error: "bad json" }, { status: 400 }); }

  const tasks: Promise<{ matched: number }>[] = [];
  for (const entry of getEntries(body)) {
    for (const change of getChanges(entry)) {
      if (change.field === "ads_review" && change.value?.review_status === "disapproved") {
        const fbAdId = String(change.value.ad_id ?? "");
        if (!fbAdId) continue;
        const reason = String(change.value.disapproval_reason ?? "policy");
        tasks.push(markAdRejectedByFb(fbAdId, reason));
      }
    }
  }
  const results = await Promise.all(tasks);
  const disapproved = results.reduce((acc, r) => acc + r.matched, 0);
  return NextResponse.json({ ok: true, disapproved });
}

function getEntries(body: unknown): { changes?: unknown[] }[] {
  if (!body || typeof body !== "object") return [];
  const e = (body as { entry?: unknown[] }).entry;
  return Array.isArray(e) ? (e as { changes?: unknown[] }[]) : [];
}

function getChanges(entry: { changes?: unknown[] }): { field?: string; value?: { review_status?: string; ad_id?: string; disapproval_reason?: string } }[] {
  if (!Array.isArray(entry.changes)) return [];
  return entry.changes as { field?: string; value?: { review_status?: string; ad_id?: string; disapproval_reason?: string } }[];
}

function verifyFbSignature(raw: string, header: string, secret: string): boolean {
  const expected = "sha256=" + createHmac("sha256", secret).update(raw).digest("hex");
  if (header.length !== expected.length) return false;
  const a = Buffer.from(header);
  const b = Buffer.from(expected);
  return timingSafeEqual(a, b);
}
