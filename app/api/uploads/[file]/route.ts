import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { NextResponse } from "next/server";
import { lookup } from "mime-types";
import { currentUser } from "@/lib/auth/current-user";
import { uploadDir } from "@/lib/assets/storage";

export async function GET(_req: Request, ctx: { params: Promise<{ file: string }> }) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { file } = await ctx.params;
  if (file.includes("/") || file.includes("..")) {
    return NextResponse.json({ error: "bad path" }, { status: 400 });
  }
  try {
    const buf = await readFile(join(uploadDir(), file));
    const ct = lookup(file) || "application/octet-stream";
    const body = new Uint8Array(buf);
    return new NextResponse(body, { headers: { "content-type": ct, "cache-control": "private, max-age=3600" } });
  } catch {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }
}
