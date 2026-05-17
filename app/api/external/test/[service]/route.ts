import { NextResponse } from "next/server";
import { currentUser } from "@/lib/auth/current-user";
import { getSecret } from "@/lib/secrets/queries";
import { makeOpenRouterClient } from "@/lib/llm/openrouter";
import { makeFeatureFmClient } from "@/lib/smartlink/featurefm";
import { makeSpotifyWebClient } from "@/lib/spotify/web";
import { env } from "@/lib/env";

const PROBES: Record<string, () => Promise<{ ok: boolean; detail?: string }>> = {
  llm: async () => {
    const apiKey = await getSecret("openrouter.api_key");
    if (!apiKey) return { ok: false, detail: "missing openrouter.api_key" };
    const c = makeOpenRouterClient({ apiKey, appUrl: env().APP_URL });
    try {
      const r = await c.generate({
        model: "anthropic/claude-haiku-4-5",
        messages: [{ role: "user", content: "Reply with the single word: pong" }],
        max_tokens: 5,
        temperature: 0,
      });
      return { ok: true, detail: `model=${r.model} tokens=${r.usage.input_tokens}+${r.usage.output_tokens}` };
    } catch (e) {
      return { ok: false, detail: e instanceof Error ? e.message : String(e) };
    }
  },
  smartlink: async () => {
    const apiKey = await getSecret("featurefm.api_key");
    if (!apiKey) return { ok: false, detail: "missing featurefm.api_key" };
    // No idempotent GET probe available; assume key validity verified at first real call.
    return { ok: true, detail: "api key present (no read-only probe available; verified on first real call)" };
  },
  spotify_web: async () => {
    const clientId = await getSecret("spotify.client_id");
    const clientSecret = await getSecret("spotify.client_secret");
    if (!clientId || !clientSecret) return { ok: false, detail: "missing spotify.client_id or spotify.client_secret" };
    const c = makeSpotifyWebClient({ clientId, clientSecret });
    try {
      // 0OdUWJ0sBjDrqHygGUXeCF = Band of Horses — a well-known artist; ping just verifies auth + endpoint.
      const r = await c.getArtistPopularity("0OdUWJ0sBjDrqHygGUXeCF");
      return { ok: true, detail: `popularity=${r.popularity} followers=${r.followers}` };
    } catch (e) {
      return { ok: false, detail: e instanceof Error ? e.message : String(e) };
    }
  },
  fb: async () => {
    const token = await getSecret("fb.access_token");
    const adAccountId = await getSecret("fb.ad_account_id");
    if (!token) return { ok: false, detail: "missing fb.access_token" };
    if (!adAccountId) return { ok: false, detail: "missing fb.ad_account_id" };
    const stripped = adAccountId.startsWith("act_") ? adAccountId.slice(4) : adAccountId;
    try {
      const url = `https://graph.facebook.com/v21.0/act_${encodeURIComponent(stripped)}?fields=name,currency&access_token=${encodeURIComponent(token)}`;
      const res = await fetch(url, { method: "GET" });
      if (!res.ok) {
        const text = await res.text().catch(() => "");
        return { ok: false, detail: `fb /act_${stripped}: ${res.status} ${text.slice(0, 200)}` };
      }
      const j = (await res.json()) as { name?: string; currency?: string };
      return { ok: true, detail: `account=${j.name ?? "?"} currency=${j.currency ?? "?"}` };
    } catch (e) {
      return { ok: false, detail: e instanceof Error ? e.message : String(e) };
    }
  },
};

export async function POST(_req: Request, ctx: { params: Promise<{ service: string }> }) {
  if (!(await currentUser())) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const { service } = await ctx.params;
  const probe = PROBES[service];
  if (!probe) return NextResponse.json({ error: "unknown service" }, { status: 400 });
  const result = await probe();
  return NextResponse.json(result, { status: result.ok ? 200 : 502 });
}
