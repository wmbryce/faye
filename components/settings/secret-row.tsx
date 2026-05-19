"use client";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Field } from "@/components/ui/label";
import { setSecretAction, deleteSecretAction } from "@/app/settings/actions";

export type SecretRowProps = {
  keyName: string;
  label: string;
  description?: string;
  testService?: "llm" | "spotify_web" | "fb";
  present: boolean;
};

type ProbeState =
  | { status: "idle" }
  | { status: "running" }
  | { status: "ok"; detail?: string }
  | { status: "err"; detail?: string };

export function SecretRow(props: SecretRowProps) {
  const [value, setValue] = useState("");
  const [savingPending, startSaving] = useTransition();
  const [deletingPending, startDeleting] = useTransition();
  const [actionError, setActionError] = useState<string | null>(null);
  const [probe, setProbe] = useState<ProbeState>({ status: "idle" });

  async function onTest() {
    if (!props.testService) return;
    setProbe({ status: "running" });
    try {
      const res = await fetch(`/api/external/test/${props.testService}`, { method: "POST" });
      const body = await res.json();
      setProbe({ status: res.ok ? "ok" : "err", detail: body.detail ?? body.error });
    } catch (err) {
      setProbe({ status: "err", detail: err instanceof Error ? err.message : String(err) });
    }
  }

  return (
    <div className="border-b border-border-subtle py-5 last:border-0">
      <div className="flex items-center justify-between gap-4 mb-2">
        <div className="min-w-0">
          <div className="font-medium text-sm">{props.label}</div>
          <div className="font-mono text-xs text-muted-foreground">{props.keyName}</div>
          {props.description && <div className="text-xs text-muted-foreground mt-1">{props.description}</div>}
        </div>
        {props.present ? <Badge variant="success">set</Badge> : <Badge variant="muted">missing</Badge>}
      </div>

      <div className="flex items-end gap-2 mt-3">
        <form
          action={(fd) => {
            fd.set("key", props.keyName);
            fd.set("value", value);
            startSaving(async () => {
              try {
                setActionError(null);
                await setSecretAction(fd);
                setValue("");
              } catch (err) {
                setActionError(err instanceof Error ? err.message : "Save failed");
              }
            });
          }}
          className="flex items-end gap-2 flex-1"
        >
          <Field label={props.present ? "Replace value" : "Set value"} htmlFor={`v-${props.keyName}`} className="flex-1">
            <Input
              id={`v-${props.keyName}`}
              type="password"
              autoComplete="off"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              placeholder={props.present ? "•••••••• (paste new value to replace)" : "paste value"}
            />
          </Field>
          <Button type="submit" size="sm" disabled={savingPending || !value.trim()}>
            {savingPending ? "Saving…" : "Save"}
          </Button>
        </form>

        {props.testService && (
          <Button type="button" variant="outline" size="sm" onClick={onTest} disabled={probe.status === "running"}>
            {probe.status === "running" ? "Testing…" : "Test"}
          </Button>
        )}

        {props.present && (
          <form
            action={(fd) => {
              fd.set("key", props.keyName);
              startDeleting(async () => {
                try {
                  setActionError(null);
                  await deleteSecretAction(fd);
                } catch (err) {
                  setActionError(err instanceof Error ? err.message : "Remove failed");
                }
              });
            }}
          >
            <Button type="submit" variant="ghost" size="sm" disabled={deletingPending}>
              Remove
            </Button>
          </form>
        )}
      </div>

      {actionError && (
        <p className="text-xs text-danger mt-2 break-all">✗ {actionError}</p>
      )}
      {probe.status === "ok" && (
        <p className="text-xs text-success mt-2">✓ {probe.detail ?? "ok"}</p>
      )}
      {probe.status === "err" && (
        <p className="text-xs text-danger mt-2 break-all">✗ {probe.detail ?? "failed"}</p>
      )}
    </div>
  );
}
