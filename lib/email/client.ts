import { Resend } from "resend";
import { render } from "@react-email/render";
import { env } from "@/lib/env";
import { MagicLinkEmail } from "./templates/magic-link";

const resend = new Resend(env().RESEND_API_KEY);

export async function sendMagicLink(args: { to: string; url: string }): Promise<string> {
  const html = await render(MagicLinkEmail({ url: args.url }));
  const { data, error } = await resend.emails.send({
    from: env().RESEND_FROM,
    to: args.to,
    subject: "Sign in to Faye",
    html,
  });
  if (error) throw new Error(`resend send failed: ${error.message}`);
  if (!data?.id) throw new Error("resend returned no id");
  return data.id;
}
