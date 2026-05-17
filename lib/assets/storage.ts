import { writeFile, mkdir, unlink } from "node:fs/promises";
import { join, extname } from "node:path";
import { randomBytes } from "node:crypto";

const UPLOAD_DIR = join(process.cwd(), "uploads");

export async function saveBuffer(args: {
  buffer: Buffer;
  contentType: string;
  origName: string;
}): Promise<{ filename: string; url: string }> {
  await mkdir(UPLOAD_DIR, { recursive: true });
  const ext = (extname(args.origName) || guessExt(args.contentType) || ".bin").toLowerCase();
  const id = randomBytes(16).toString("hex");
  const filename = `${id}${ext}`;
  await writeFile(join(UPLOAD_DIR, filename), args.buffer);
  return { filename, url: `/api/uploads/${filename}` };
}

export async function deleteFile(filename: string): Promise<void> {
  await unlink(join(UPLOAD_DIR, filename)).catch(() => undefined);
}

export function uploadDir(): string {
  return UPLOAD_DIR;
}

function guessExt(ct: string): string | undefined {
  const map: Record<string, string> = {
    "image/png": ".png",
    "image/jpeg": ".jpg",
    "image/webp": ".webp",
    "video/mp4": ".mp4",
  };
  return map[ct];
}
