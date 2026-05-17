import React from "react";
import { Html, Body, Container, Heading, Text, Section, Row, Column, Link, Hr, Img } from "@react-email/components";
import type { CampaignDigest } from "./builder";

const ACCENT = "#F47168";

export function DigestEmail({ date, digests }: { date: string; digests: CampaignDigest[] }) {
  return (
    <Html>
      <Body style={{ background: "#0A0A0C", color: "#E8E8EE", fontFamily: "system-ui, -apple-system, sans-serif", padding: 24 }}>
        <Container style={{ maxWidth: 640, margin: "0 auto" }}>
          <Heading as="h1" style={{ fontSize: 24, margin: 0 }}>
            Faye — daily digest
          </Heading>
          <Text style={{ color: "#7A7A85", marginTop: 4 }}>
            {date}
          </Text>
          <Hr style={{ borderColor: "#1F1F25", margin: "20px 0" }} />

          {digests.length === 0 && (
            <Text style={{ color: "#7A7A85" }}>No active campaigns staged anything today.</Text>
          )}

          {digests.map((d) => (
            <Section key={d.campaignId} style={{ marginBottom: 28 }}>
              <Heading as="h2" style={{ fontSize: 18, margin: "0 0 4px" }}>
                {d.campaignName}
              </Heading>
              {d.yesterday.degraded && (
                <Text style={{ fontSize: 12, color: "#F59E0B", marginTop: 4 }}>
                  ⚠ Spotify stream data is degraded (web-estimate only)
                </Text>
              )}

              <Section style={{ background: "#111114", border: "1px solid #1F1F25", borderRadius: 8, padding: 16, marginTop: 8 }}>
                <MetricsGrid d={d} />
              </Section>

              {d.pendingAds.length > 0 && (
                <>
                  <Heading as="h3" style={{ fontSize: 14, color: "#7A7A85", textTransform: "uppercase", letterSpacing: 1, marginTop: 16, marginBottom: 8 }}>
                    Pending ads (publishing in ~30 min)
                  </Heading>
                  {d.pendingAds.map((ad) => (
                    <PendingAdCard key={ad.adId} ad={ad} />
                  ))}
                </>
              )}
            </Section>
          ))}

          <Hr style={{ borderColor: "#1F1F25", margin: "20px 0" }} />
          <Text style={{ fontSize: 11, color: "#7A7A85" }}>
            You'll only get a reject link click if you click "Reject" — Faye stages new ads daily and publishes after a 30-minute review window. Reject any ad to keep it from going live.
          </Text>
        </Container>
      </Body>
    </Html>
  );
}

function MetricsGrid({ d }: { d: CampaignDigest }) {
  const usd = (cents: number) => `$${(cents / 100).toFixed(2)}`;
  const fmt = (n: number | null) => n == null ? "—" : n.toLocaleString();
  return (
    <Row>
      <Column style={{ width: "20%" }}><Stat label="Spend" value={usd(d.yesterday.spendCents)} /></Column>
      <Column style={{ width: "20%" }}><Stat label="Impressions" value={fmt(d.yesterday.impressions)} /></Column>
      <Column style={{ width: "20%" }}><Stat label="FB clicks" value={fmt(d.yesterday.fbLinkClicks)} /></Column>
      <Column style={{ width: "20%" }}><Stat label="Streams" value={fmt(d.yesterday.smartlinkStreams)} /></Column>
      <Column style={{ width: "20%" }}>
        <Stat
          label="Composite"
          value={d.yesterday.composite == null ? "—" : d.yesterday.composite.toFixed(2)}
        />
      </Column>
    </Row>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <>
      <Text style={{ fontSize: 10, color: "#7A7A85", textTransform: "uppercase", letterSpacing: 0.5, margin: 0 }}>{label}</Text>
      <Text style={{ fontFamily: "ui-monospace, monospace", fontSize: 14, color: "#E8E8EE", margin: "2px 0 0" }}>{value}</Text>
    </>
  );
}

function PendingAdCard({ ad }: { ad: CampaignDigest["pendingAds"][number] }) {
  return (
    <Section style={{ background: "#111114", border: "1px solid #1F1F25", borderRadius: 8, padding: 12, marginBottom: 8 }}>
      <Row>
        <Column style={{ width: 96, verticalAlign: "top", paddingRight: 12 }}>
          <Img
            src={ad.assetUrl}
            alt={ad.copyHeadline || "Ad preview"}
            width={88}
            height={88}
            style={{ borderRadius: 6, objectFit: "cover", display: "block" }}
          />
        </Column>
        <Column style={{ verticalAlign: "top" }}>
          <Text style={{ fontSize: 11, color: "#7A7A85", margin: 0 }}>{ad.audienceName}</Text>
          <Text style={{ fontWeight: 600, margin: "2px 0 0" }}>{ad.copyHeadline}</Text>
          <Text style={{ color: "#7A7A85", fontSize: 13, margin: "4px 0 0" }}>{ad.copyPrimaryText}</Text>
          <Link
            href={ad.rejectUrl}
            style={{ display: "inline-block", marginTop: 10, fontSize: 12, color: ACCENT, textDecoration: "none" }}
          >
            Reject this ad →
          </Link>
        </Column>
      </Row>
    </Section>
  );
}
