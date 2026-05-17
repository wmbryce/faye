import { Badge } from "@/components/ui/badge";

export function DegradedBanner({ s4aMissing, fraudExcluded }: { s4aMissing: boolean; fraudExcluded: number }) {
  if (!s4aMissing && fraudExcluded === 0) return null;
  return (
    <div className="rounded-md border border-warning/30 bg-warning/10 px-4 py-3 text-sm text-warning flex items-start gap-3">
      <span aria-hidden>⚠</span>
      <div className="flex-1 space-y-1">
        {s4aMissing && (
          <p>
            Spotify stream data is degraded (Web estimate only).
            Stream-related metrics may be approximate.
          </p>
        )}
        {fraudExcluded > 0 && (
          <p className="flex items-center gap-2">
            <Badge variant="warning">{fraudExcluded}</Badge>
            ad-day rows flagged for suspected click fraud and excluded from scoring.
          </p>
        )}
      </div>
    </div>
  );
}
