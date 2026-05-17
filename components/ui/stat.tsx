import { cn } from "@/lib/utils";

export function Stat({
  label,
  value,
  delta,
  hint,
  className,
}: {
  label: string;
  value: React.ReactNode;
  delta?: { value: string; direction: "up" | "down" | "flat" };
  hint?: string;
  className?: string;
}) {
  return (
    <div className={cn("space-y-1", className)}>
      <div className="label">{label}</div>
      <div className="font-mono tabular-nums text-2xl tracking-tight">{value}</div>
      {(delta || hint) && (
        <div className="flex items-center gap-2 text-xs">
          {delta && (
            <span
              className={cn(
                "font-mono",
                delta.direction === "up" && "text-success",
                delta.direction === "down" && "text-danger",
                delta.direction === "flat" && "text-muted-foreground"
              )}
            >
              {delta.direction === "up" ? "▲" : delta.direction === "down" ? "▼" : "·"} {delta.value}
            </span>
          )}
          {hint && <span className="text-muted-foreground">{hint}</span>}
        </div>
      )}
    </div>
  );
}
