import { Resend } from "resend";
import { render } from "@react-email/render";
import { db } from "@/lib/db";
import { notifications } from "@/lib/db/schema";
import { env } from "@/lib/env";
import { DigestEmail } from "./template";
import type { CampaignDigest } from "./builder";

export async function sendDailyDigest(args: {
  date: string;
  digests: CampaignDigest[];
}): Promise<string> {
  const html = await render(DigestEmail({ date: args.date, digests: args.digests }));
  const resend = new Resend(env().RESEND_API_KEY);
  const { data, error } = await resend.emails.send({
    from: env().RESEND_FROM,
    to: env().OPERATOR_EMAIL,
    subject: `Faye daily digest — ${args.date}`,
    html,
  });
  if (error) throw new Error(`resend digest failed: ${error.message}`);
  if (!data?.id) throw new Error("resend returned no id");
  await db.insert(notifications).values({
    campaignId: null,
    kind: "daily_digest",
    payload: { date: args.date, campaignIds: args.digests.map((d) => d.campaignId), msgId: data.id },
  });
  return data.id;
}
