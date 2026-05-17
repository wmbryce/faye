import { NextResponse } from "next/server";
import { currentUser } from "@/lib/auth/current-user";
import { getSecret } from "@/lib/secrets/queries";
import { makeOpenRouterClient } from "@/lib/llm/openrouter";
import { makeSpotifyWebClient } from "@/lib/spotify/web";
import { stripAct } from "@/lib/fb/real";
import { fetchWithBackoff, assertOk } from "@/lib/external/fetch";
import { env } from "@/lib/env";

type TestService = "llm" | "smartlink" | "spotify_web" | "fb";

type ProbeResult = { ok: boolean; detail?: string };

const PROBES: Record<TestService, () => Promise<ProbeResult>> = {
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
    // No idempotent read endpoint surfaced; key validity is verified on first real create.
    return { ok: true, detail: "api key present (verified on first real call)" };
  },
  spotify_web: async () => {
    const [clientId, clientSecret] = await Promise.all([
      getSecret("spotify.client_id"),
      getSecret("spotify.client_secret"),
    ]);
    if (!clientId || !clientSecret) {
      return { ok: false, detail: "missing spotify.client_id or spotify.client_secret" };
    }
    const c = makeSpotifyWebClient({ clientId, clientSecret });
    try {
      // 0OdUWJ0sBjDrqHygGUXeCF = Band of Horses — known artist; verifies auth + endpoint.
      const r = await c.getArtistPopularity("0OdUWJ0sBjDrqHygGUXeCF");
      return { ok: true, detail: `popularity=${r.popularity} followers=${r.followers}` };
    } catch (e) {
      return { ok: false, detail: e instanceof Error ? e.message : String(e) };
    }
  },
  fb: async () => {
    const [token, adAccountId] = await Promise.all([
      getSecret("fb.access_token"),
      getSecret("fb.ad_account_id"),
    ]);
    if (!token) return { ok: false, detail: "missing fb.access_token" };
    if (!adAccountId) return { ok: false, detail: "missing fb.ad_account_id" };
    const stripped = stripAct(adAccountId);
    try {
      const url = `https://graph.facebook.com/v21.0/act_${encodeURIComponent(stripped)}?fields=name,currency&access_token=${encodeURIComponent(token)}`;
      const res = await fetchWithBackoff(url, { method: "GET" }, { service: "fb" });
      await assertOk(res, `fb /act_${stripped}`);
      const j = (await res.json()) as { name?: string; currency?: string };
      return { ok: true, detail: `account=${j.name ?? "?"} currency=${j.currency ?? "?"}` };
    } catch (e) {
      return { ok: false, detail: e instanceof Error ? e.message : String(e) };
    }
  },
};

function isTestService(s: string): s is TestService {
  return s in PROBES;
}

export async function POST(_req: Request, ctx: { params: Promise<{ service: string }> }) {
  if (!(await currentUser())) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const { service } = await ctx.params;
  if (!isTestService(service)) {
    return NextResponse.json({ error: "unknown service" }, { status: 400 });
  }
  const result = await PROBES[service]();
  return NextResponse.json(result, { status: result.ok ? 200 : 502 });
}
