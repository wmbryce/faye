"use client";
import { BarChart, Bar, XAxis, YAxis, Tooltip, Legend, ResponsiveContainer, CartesianGrid } from "recharts";

export type CostsPoint = { date: string; adSpend: number; llm: number };

export function CostsChart({ data }: { data: CostsPoint[] }) {
  if (data.length === 0) {
    return (
      <div className="h-[280px] grid place-items-center text-sm text-muted-foreground border border-dashed border-border-subtle rounded-md">
        No cost data yet.
      </div>
    );
  }
  return (
    <div style={{ width: "100%", height: 280 }}>
      <ResponsiveContainer>
        <BarChart data={data} margin={{ top: 16, right: 24, left: 8, bottom: 0 }}>
          <CartesianGrid stroke="hsl(var(--border-subtle))" strokeDasharray="3 3" />
          <XAxis dataKey="date" stroke="hsl(var(--muted-foreground))" fontSize={11} />
          <YAxis stroke="hsl(var(--muted-foreground))" fontSize={11} tickFormatter={(v) => `$${v}`} />
          <Tooltip
            contentStyle={{ background: "hsl(var(--surface-2))", border: "1px solid hsl(var(--border-subtle))", borderRadius: 6, fontSize: 12 }}
          />
          <Legend wrapperStyle={{ fontSize: 11 }} />
          <Bar dataKey="adSpend" name="Ad spend ($)" stackId="cost" fill="hsl(var(--foreground))" />
          <Bar dataKey="llm" name="LLM cost ($)" stackId="cost" fill="hsl(var(--accent))" />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
