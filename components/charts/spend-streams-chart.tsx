"use client";
import { LineChart, Line, XAxis, YAxis, Tooltip, Legend, ResponsiveContainer, ReferenceLine, CartesianGrid } from "recharts";

export type SpendStreamsPoint = {
  date: string;
  spendUsd: number;
  streams: number | null;
  baseline: number;
};

export function SpendStreamsChart({ data }: { data: SpendStreamsPoint[] }) {
  if (data.length === 0) {
    return (
      <div className="h-[320px] grid place-items-center text-sm text-muted-foreground border border-dashed border-border-subtle rounded-md">
        No data yet for this campaign window.
      </div>
    );
  }
  const baseline = data[0]?.baseline ?? 0;
  return (
    <div style={{ width: "100%", height: 320 }}>
      <ResponsiveContainer>
        <LineChart data={data} margin={{ top: 16, right: 24, left: 8, bottom: 0 }}>
          <CartesianGrid stroke="hsl(var(--border-subtle))" strokeDasharray="3 3" />
          <XAxis dataKey="date" stroke="hsl(var(--muted-foreground))" fontSize={11} />
          <YAxis yAxisId="left" stroke="hsl(var(--muted-foreground))" fontSize={11} tickFormatter={(v) => `$${v}`} />
          <YAxis yAxisId="right" orientation="right" stroke="hsl(var(--muted-foreground))" fontSize={11} />
          <Tooltip
            contentStyle={{ background: "hsl(var(--surface-2))", border: "1px solid hsl(var(--border-subtle))", borderRadius: 6, fontSize: 12 }}
            labelStyle={{ color: "hsl(var(--foreground))" }}
          />
          <Legend wrapperStyle={{ fontSize: 12 }} />
          {baseline > 0 && (
            <ReferenceLine yAxisId="right" y={baseline} stroke="hsl(var(--muted-foreground))" strokeDasharray="4 4" label={{ value: "baseline", fontSize: 10, fill: "hsl(var(--muted-foreground))" }} />
          )}
          <Line yAxisId="left" type="monotone" dataKey="spendUsd" name="Spend ($)" stroke="hsl(var(--foreground))" strokeWidth={2} dot={false} />
          <Line yAxisId="right" type="monotone" dataKey="streams" name="Streams" stroke="hsl(var(--accent))" strokeWidth={2} dot={false} connectNulls />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
