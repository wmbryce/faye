"use client";
import { useState } from "react";
import { Button } from "@/components/ui/button";

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
    <main className="min-h-screen flex items-center justify-center p-6">
      <form onSubmit={onSubmit} className="w-full max-w-sm space-y-4">
        <h1 className="text-2xl font-semibold">Sign in to Faye</h1>
        <input
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@example.com"
          className="w-full h-9 px-3 border border-border rounded-md bg-background"
        />
        <Button type="submit" disabled={state === "sending"} className="w-full">
          {state === "sending" ? "Sending…" : "Send magic link"}
        </Button>
        {state === "sent" && <p className="text-sm text-muted-foreground">Check your email.</p>}
        {state === "error" && <p className="text-sm text-red-600">Something went wrong.</p>}
      </form>
    </main>
  );
}
