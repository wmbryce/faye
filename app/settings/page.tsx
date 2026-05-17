import { redirect } from "next/navigation";
import { currentUser } from "@/lib/auth/current-user";
import { Shell } from "@/components/layout/shell";
import { PageHeader } from "@/components/layout/page-header";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { listSecretKeys } from "@/lib/secrets/queries";
import { SecretRow, type SecretRowProps } from "@/components/settings/secret-row";

type KeyDef = Omit<SecretRowProps, "present">;
const KEYS: KeyDef[] = [
  { keyName: "fb.access_token", label: "Facebook Marketing API access token", description: "Long-lived user or system-user token with ads_management + ads_read + business_management.", testService: "fb" },
  { keyName: "fb.ad_account_id", label: "Facebook ad account ID", description: "Format: act_<digits>." },
  { keyName: "fb.page_id", label: "Default Facebook Page ID", description: "Page that ads will be attributed to." },
  { keyName: "featurefm.api_key", label: "Feature.fm API key", description: "Used to create smartlinks + pull daily clicks/streams.", testService: "smartlink" },
  { keyName: "spotify.client_id", label: "Spotify Web API client ID" },
  { keyName: "spotify.client_secret", label: "Spotify Web API client secret", description: "Combined with client_id for client-credentials OAuth.", testService: "spotify_web" },
  { keyName: "openrouter.api_key", label: "OpenRouter API key", description: "Single endpoint for all LLM calls (Sonnet / Opus / Haiku).", testService: "llm" },
  { keyName: "resend.api_key", label: "Resend API key (override env)", description: "Optional; .env value is used when this is unset." },
];

export default async function SettingsPage() {
  const user = await currentUser();
  if (!user) redirect("/login");
  const present = new Set(await listSecretKeys());

  return (
    <Shell email={user.email}>
      <PageHeader
        eyebrow="Settings"
        title="Settings"
        description="Provider credentials are encrypted at rest using AUTH_TOKEN_SECRET. Defaults (review delay, K/N, weights) become editable in a later phase."
      />

      <Card className="mt-8">
        <CardHeader>
          <CardTitle>Provider credentials</CardTitle>
          <CardDescription>
            Used by Faye&apos;s daily loop. Stored AES-256-GCM-encrypted; only the operator session can read or update them.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {KEYS.map((k) => (
            <SecretRow key={k.keyName} {...k} present={present.has(k.keyName)} />
          ))}
        </CardContent>
      </Card>

      <Card className="mt-6">
        <CardHeader>
          <CardTitle>Defaults (read-only for now)</CardTitle>
          <CardDescription>
            v1 spec defaults. Editable controls land in a later phase.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <dl className="text-sm grid grid-cols-[10rem_1fr] gap-y-2">
            <dt className="label">Review delay</dt><dd className="num">30 min</dd>
            <dt className="label">K survivors</dt><dd className="num">3</dd>
            <dt className="label">N variants</dt><dd className="num">5</dd>
            <dt className="label">Composite weights</dt><dd className="num">0.6 / 0.2 / 0.2</dd>
            <dt className="label">Max audiences</dt><dd className="num">5</dd>
            <dt className="label">Models</dt><dd className="num">Sonnet 4.6 / Opus 4.7 / Haiku 4.5</dd>
          </dl>
        </CardContent>
      </Card>
    </Shell>
  );
}
