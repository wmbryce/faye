import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { smartlinks, smartlinkClicks } from "@/lib/db/schema";

const SHORTCODE_RE = /^[A-Za-z0-9_-]+$/;
const SHORTCODE_MAX = 64;

export async function GET(req: Request, ctx: { params: Promise<{ shortcode: string }> }) {
  const { shortcode } = await ctx.params;
  if (shortcode.length > SHORTCODE_MAX || !SHORTCODE_RE.test(shortcode)) {
    return new NextResponse("not found", { status: 404 });
  }
  const [row] = await db
    .select({ destinationUrl: smartlinks.destinationUrl })
    .from(smartlinks)
    .where(eq(smartlinks.id, shortcode))
    .limit(1);
  if (!row) return new NextResponse("not found", { status: 404 });
  const userAgent = req.headers.get("user-agent");
  await db.insert(smartlinkClicks).values({ smartlinkId: shortcode, userAgent });
  return NextResponse.redirect(row.destinationUrl, { status: 302 });
}
