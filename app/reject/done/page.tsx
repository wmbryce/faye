import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";

export const metadata = {
  title: "Ad rejection",
  description: "Confirmation page for ad rejection via email link.",
};

const REJECT_REASON_LABEL: Record<string, string> = {
  malformed: "Link is malformed",
  bad_signature: "Link is invalid",
  expired: "Link has expired",
  wrong_kind: "Link is invalid",
  already_used: "This ad was already rejected",
};

export default async function RejectDonePage({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  const { status } = await searchParams;
  const ok = status === "ok";
  const heading = ok ? "Ad rejected" : (REJECT_REASON_LABEL[status ?? ""] ?? "Link is invalid");
  const message = ok
    ? "Faye will not publish this ad."
    : "This reject link couldn't be processed. The ad may already be rejected or the link expired.";
  return (
    <main className="max-w-md mx-auto px-6 py-12">
      <Card>
        <CardContent className="p-6 space-y-3">
          <h1 className="text-xl font-semibold">{heading}</h1>
          <p className="text-sm text-muted-foreground">{message}</p>
          <p className="text-sm pt-2">
            <Link href="/" className="underline">Go to dashboard →</Link>
          </p>
        </CardContent>
      </Card>
    </main>
  );
}
