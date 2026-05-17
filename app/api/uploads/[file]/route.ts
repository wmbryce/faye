import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { currentUser } from "@/lib/auth/current-user";
import { uploadDir } from "@/lib/assets/storage";
import { db } from "@/lib/db";
import { assets } from "@/lib/db/schema";

export async function GET(_req: Request, ctx: { params: Promise<{ file: string }> }) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { file } = await ctx.params;
  if (file.includes("/") || file.includes("..") || file.includes("\\")) {
    return NextResponse.json({ error: "bad path" }, { status: 400 });
  }
  const expectedUrl = `/api/uploads/${file}`;
  const [row] = await db.select().from(assets).where(eq(assets.url, expectedUrl)).limit(1);
  if (!row) return NextResponse.json({ error: "not found" }, { status: 404 });
  try {
    const buf = await readFile(join(uploadDir(), file));
    const body = new Uint8Array(buf);
    return new NextResponse(body, {
      headers: {
        "content-type": row.contentType,
        "content-disposition": "inline",
        "x-content-type-options": "nosniff",
        "cache-control": "private, max-age=3600",
      },
    });
  } catch {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }
}
