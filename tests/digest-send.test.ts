import { describe, it, expect, vi } from "vitest";

vi.mock("resend", () => ({
  Resend: vi.fn().mockImplementation(() => ({
    emails: {
      send: vi.fn().mockResolvedValue({ data: { id: "msg_digest_1" }, error: null }),
    },
  })),
}));

import { sendDailyDigest } from "@/lib/email/digest/send";
import { db } from "@/lib/db";
import { notifications } from "@/lib/db/schema";
import type { CampaignDigest } from "@/lib/email/digest/builder";
import { eq } from "drizzle-orm";

function fakeDigest(name: string): CampaignDigest {
  return {
    campaignId: "00000000-0000-0000-0000-000000000001",
    campaignName: name,
    artistName: name,
    releaseTitle: "Album",
    yesterday: {
      spendCents: 1234, impressions: 5000, fbLinkClicks: 250, smartlinkClicks: 200,
      smartlinkStreams: 80, spotifyStreams: 1200, spotifyStreamDelta: 200,
      composite: 0.15, degraded: false,
    },
    pendingAds: [{
      adId: "00000000-0000-0000-0000-000000000002",
      audienceName: "indie us",
      assetUrl: "http://localhost:3000/api/uploads/cover.png",
      copyHeadline: "new variant",
      copyPrimaryText: "different angle",
      rejectUrl: "http://localhost:3000/reject/abc.def",
      publishAt: new Date(),
    }],
  };
}

describe("sendDailyDigest", () => {
  it("renders + sends + writes a notification row", async () => {
    const id = await sendDailyDigest({ date: "2026-06-15", digests: [fakeDigest("Hana Vu")] });
    expect(id).toBe("msg_digest_1");
    const rows = await db.select().from(notifications).where(eq(notifications.kind, "daily_digest"));
    expect(rows).toHaveLength(1);
    expect(rows[0].payload).toMatchObject({ date: "2026-06-15", msgId: "msg_digest_1" });
  });

  it("sends an empty digest (no campaigns)", async () => {
    const id = await sendDailyDigest({ date: "2026-06-15", digests: [] });
    expect(id).toBe("msg_digest_1");
  });
});
