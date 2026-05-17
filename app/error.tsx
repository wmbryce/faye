"use client";
import { useEffect } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

export default function ErrorBoundary({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    // eslint-disable-next-line no-console
    console.error("app error:", error);
  }, [error]);
  return (
    <main className="max-w-md mx-auto px-6 py-12">
      <Card>
        <CardContent className="p-6 space-y-3">
          <h1 className="text-xl font-semibold">Something went wrong</h1>
          <p className="text-sm text-muted-foreground">
            An unexpected error broke this page. The error has been logged.
          </p>
          {error.digest && (
            <p className="text-xs font-mono text-muted-foreground">digest: {error.digest}</p>
          )}
          <div className="flex gap-2 pt-2">
            <Button onClick={() => reset()} size="sm">Try again</Button>
            <Button onClick={() => window.location.href = "/"} variant="ghost" size="sm">Go home</Button>
          </div>
        </CardContent>
      </Card>
    </main>
  );
}
