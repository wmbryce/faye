"use client";
import { LineChart, Line, XAxis, YAxis, Tooltip, Legend, ResponsiveContainer, CartesianGrid } from "recharts";

export type CompositePoint = {
  date: string;
} & Record<string, number | string | null>;  // ad-headline keys → composite score

const SERIES_COLORS = ["#F47168", "#4ADE80", "#F59E0B", "#7CFF6B", "#A78BFA", "#22D3EE", "#FB7185"];

export function CompositeChart({ data, adKeys }: { data: CompositePoint[]; adKeys: string[] }) {
  if (data.length === 0) {
    return (
      <div className="h-[320px] grid place-items-center text-sm text-muted-foreground border border-dashed border-border-subtle rounded-md">
        No composite scores yet.
      </div>
    );
  }
  return (
    <div style={{ width: "100%", height: 320 }}>
      <ResponsiveContainer>
        <LineChart data={data} margin={{ top: 16, right: 24, left: 8, bottom: 0 }}>
          <CartesianGrid stroke="hsl(var(--border-subtle))" strokeDasharray="3 3" />
          <XAxis dataKey="date" stroke="hsl(var(--muted-foreground))" fontSize={11} />
          <YAxis stroke="hsl(var(--muted-foreground))" fontSize={11} domain={[-1, 1]} />
          <Tooltip
            contentStyle={{ background: "hsl(var(--surface-2))", border: "1px solid hsl(var(--border-subtle))", borderRadius: 6, fontSize: 12 }}
          />
          <Legend wrapperStyle={{ fontSize: 11 }} />
          {adKeys.map((k, i) => (
            <Line
              key={k}
              type="monotone"
              dataKey={k}
              stroke={SERIES_COLORS[i % SERIES_COLORS.length]}
              strokeWidth={1.5}
              dot={false}
              connectNulls
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
