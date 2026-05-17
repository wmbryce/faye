import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium uppercase tracking-[0.06em]",
  {
    variants: {
      variant: {
        default: "border-border bg-surface-2 text-foreground",
        muted: "border-border-subtle bg-muted text-muted-foreground",
        success: "border-success/30 bg-success/10 text-success",
        warning: "border-warning/30 bg-warning/10 text-warning",
        danger: "border-danger/30 bg-danger/10 text-danger",
        accent: "border-accent/30 bg-accent/10 text-accent",
      },
    },
    defaultVariants: { variant: "default" },
  }
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badgeVariants> {}

export function Badge({ className, variant, ...props }: BadgeProps) {
  return <span className={cn(badgeVariants({ variant, className }))} {...props} />;
}

/** Status → variant map keyed on Faye ad/campaign status strings. */
export function statusVariant(status: string): BadgeProps["variant"] {
  switch (status) {
    case "active":
    case "published":
      return "success";
    case "pending":
      return "warning";
    case "rejected":
    case "killed":
      return "danger";
    case "draft":
    case "paused":
    case "ended":
      return "muted";
    default:
      return "default";
  }
}
