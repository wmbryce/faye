"use client";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Field } from "@/components/ui/label";
import { Input } from "@/components/ui/input";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [state, setState] = useState<"idle" | "sending" | "sent" | "error">("idle");

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setState("sending");
    const res = await fetch("/api/auth/request", {
      method: "POST",
      body: JSON.stringify({ email }),
      headers: { "content-type": "application/json" },
    });
    setState(res.ok ? "sent" : "error");
  }

  return (
    <main className="min-h-screen grid place-items-center p-6 relative overflow-hidden">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 [background:radial-gradient(ellipse_at_top,hsl(var(--accent)/0.10),transparent_60%)]"
      />
      <Card className="w-full max-w-sm relative">
        <CardContent className="space-y-6 p-7">
          <div className="flex items-center gap-2">
            <span aria-hidden className="inline-block h-2 w-2 rounded-full bg-accent shadow-[0_0_12px_hsl(var(--accent)/0.6)]" />
            <span className="font-semibold tracking-tight">faye</span>
          </div>
          <div>
            <h1 className="text-xl font-medium tracking-tight">Sign in</h1>
            <p className="text-sm text-muted-foreground mt-1">
              Operator-only. We&apos;ll email you a magic link.
            </p>
          </div>
          <form onSubmit={onSubmit} className="space-y-4">
            <Field label="Email" htmlFor="email">
              <Input
                id="email"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                autoComplete="email"
              />
            </Field>
            <Button type="submit" disabled={state === "sending"} className="w-full">
              {state === "sending" ? "Sending…" : "Send magic link"}
            </Button>
            {state === "sent" && (
              <p className="text-sm text-muted-foreground">Check your inbox. Link expires in 10 minutes.</p>
            )}
            {state === "error" && (
              <p className="text-sm text-danger">Something went wrong. Double-check your email.</p>
            )}
          </form>
        </CardContent>
      </Card>
    </main>
  );
}
