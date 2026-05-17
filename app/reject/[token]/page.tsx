import Link from "next/link";
import { verifyRejectToken } from "@/lib/email/reject-tokens";
import { getAdRejectSummary } from "@/lib/ads/summary";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { rejectAdAction } from "./actions";

export default async function RejectPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const decodedToken = decodeURIComponent(token);
  const v = await verifyRejectToken(decodedToken);

  if (!v.ok) {
    return (
      <Layout>
        <Card>
          <CardContent className="p-6 space-y-2">
            <h1 className="text-xl font-semibold">Link {v.reason}</h1>
            <p className="text-sm text-muted-foreground">
              This reject link is no longer valid. The ad may already be published, rejected, or the link expired.
            </p>
            <p className="text-sm">
              <Link href="/" className="underline">Go to dashboard →</Link>
            </p>
          </CardContent>
        </Card>
      </Layout>
    );
  }

  const ad = await getAdRejectSummary(v.adId);
  if (!ad) {
    return (
      <Layout>
        <Card>
          <CardContent className="p-6">
            <h1 className="text-xl font-semibold">Ad not found</h1>
          </CardContent>
        </Card>
      </Layout>
    );
  }

  return (
    <Layout>
      <Card>
        <CardContent className="p-6 space-y-4">
          <div className="space-y-1">
            <p className="label">Reject this ad?</p>
            <h1 className="text-xl font-semibold tracking-tight">
              {ad.artistName} — {ad.releaseTitle}
            </h1>
            <p className="text-sm text-muted-foreground">{ad.audienceName}</p>
          </div>

          <div className="overflow-hidden rounded-md border border-border-subtle bg-surface-2">
            {/* assets are auth-gated; the email recipient may not be the operator, but the operator who clicks
                from their inbox while logged in will see the preview */}
            <img src={ad.assetUrl} alt="" className="w-full aspect-square object-cover" />
          </div>

          <div className="space-y-1">
            <p className="font-medium">{ad.copyHeadline}</p>
            <p className="text-sm text-muted-foreground">{ad.copyPrimaryText}</p>
            {ad.copyBody && <p className="text-xs text-muted-foreground">{ad.copyBody}</p>}
          </div>

          <div className="flex items-center gap-3 pt-2">
            <Badge variant="muted">{ad.status}</Badge>
            {ad.publishAt && (
              <span className="text-xs text-muted-foreground">
                scheduled {ad.publishAt.toLocaleString()}
              </span>
            )}
          </div>

          <form action={rejectAdAction.bind(null, decodedToken)} className="flex items-center gap-2 pt-2">
            <Button type="submit" variant="destructive">Confirm reject</Button>
            <Link href="/">
              <Button type="button" variant="ghost">Cancel</Button>
            </Link>
          </form>
        </CardContent>
      </Card>
    </Layout>
  );
}

function Layout({ children }: { children: React.ReactNode }) {
  return (
    <main className="max-w-md mx-auto px-6 py-12">{children}</main>
  );
}
