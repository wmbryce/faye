import type { Asset } from "@/lib/db/schema";

/**
 * Pick an Asset matching a hint, falling back to round-robin by rotationKey.
 * Pure: no DB, no randomness. Caller provides the rotationKey (e.g. the per-audience
 * variant index of this generation) so the same input yields the same output.
 */
export function pickAsset(
  hint: string,
  assets: Asset[],
  rotationKey: number,
): Asset | null {
  if (assets.length === 0) return null;
  const cleaned = hint.trim().toLowerCase();
  if (cleaned && cleaned !== "any") {
    const match = assets.find((a) => a.label.toLowerCase().includes(cleaned));
    if (match) return match;
  }
  const idx = Math.abs(rotationKey) % assets.length;
  return assets[idx];
}
