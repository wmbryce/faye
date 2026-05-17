"use client";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { runDailyLoopAction } from "@/app/campaigns/[id]/actions";

type RunResult = Awaited<ReturnType<typeof runDailyLoopAction>>;

export function RunDailyLoopButton({ campaignId, disabled }: { campaignId: string; disabled?: boolean }) {
  const [pending, start] = useTransition();
  const [result, setResult] = useState<RunResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  function onClick() {
    setResult(null);
    setError(null);
    start(async () => {
      try {
        const r = await runDailyLoopAction(campaignId);
        setResult(r);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Run failed");
      }
    });
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={disabled || pending}
        onClick={onClick}
      >
        {pending ? "Running…" : "Run daily loop"}
      </Button>
      {result && (
        <p className="text-xs text-muted-foreground">
          {result.coldStart ? "cold-start · " : ""}
          gen {result.generation} · {result.audiencesProcessed} audiences · {result.variantsGenerated} variants → {result.pendingAdsStaged} staged
        </p>
      )}
      {error && (
        <p className="text-xs text-destructive break-all">{error}</p>
      )}
    </div>
  );
}
