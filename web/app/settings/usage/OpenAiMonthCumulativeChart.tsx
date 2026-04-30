"use client";

import { useMemo } from "react";
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

export type OpenAiDayPoint = {
  day?: string;
  tokens: number;
  cost_usd: number;
};

type ChartRow = {
  day: string;
  label: string;
  cumPrimary: number;
  cumCost: number;
};

function buildCumulativeRows(series: OpenAiDayPoint[]): ChartRow[] {
  const sorted = [...series].sort((a, b) => String(a.day ?? "").localeCompare(String(b.day ?? "")));
  let cumPrimary = 0;
  let cumCost = 0;
  const rows: ChartRow[] = [];
  for (const s of sorted) {
    const day = String(s.day ?? "").trim();
    if (!day) {
      continue;
    }
    cumPrimary += Number(s.tokens || 0);
    cumCost += Number(s.cost_usd || 0);
    const label = day.length >= 10 ? day.slice(8, 10) : day;
    rows.push({ day, label, cumPrimary, cumCost });
  }
  return rows;
}

export function OpenAiMonthCumulativeChart({
  series,
  primaryLabel,
}: {
  series: OpenAiDayPoint[];
  /** Overrides the left axis / legend label (e.g. output-only tokens for image models). */
  primaryLabel?: string;
}) {
  const data = useMemo(() => buildCumulativeRows(series), [series]);

  const leftAxisLabel = primaryLabel ?? "Tokens (cumulative)";
  const leftLineName = primaryLabel ?? "Tokens (cumulative)";
  const leftTickFormatter = (v: number) =>
    v >= 1_000_000 ? `${(v / 1_000_000).toFixed(1)}M` : v >= 1000 ? `${(v / 1000).toFixed(0)}k` : String(v);

  if (data.length === 0) {
    return <div className="text-muted">No daily OpenAI data for this month yet.</div>;
  }

  return (
    <div style={{ width: "100%", height: 320, minWidth: 0 }}>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 8, right: 28, left: 8, bottom: 8 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(148, 163, 184, 0.25)" />
          <XAxis
            dataKey="label"
            tick={{ fill: "var(--color-text)", fontSize: 11 }}
            label={{ value: "Day of month (UTC)", position: "insideBottom", offset: -4, fill: "var(--muted, #94a3b8)", fontSize: 11 }}
          />
          <YAxis
            yAxisId="primary"
            tick={{ fill: "#a78bfa", fontSize: 11 }}
            tickFormatter={leftTickFormatter}
            label={{
              value: leftAxisLabel,
              angle: -90,
              position: "insideLeft",
              style: { fill: "#a78bfa", fontSize: 11 },
            }}
          />
          <YAxis
            yAxisId="cost"
            orientation="right"
            tick={{ fill: "#4ade80", fontSize: 11 }}
            tickFormatter={(v: number) => `$${Number(v).toFixed(2)}`}
            label={{
              value: "Cost USD (cumulative)",
              angle: 90,
              position: "insideRight",
              style: { fill: "#4ade80", fontSize: 11 },
            }}
          />
          <Tooltip
            contentStyle={{
              background: "var(--panel-bg, #0f172a)",
              border: "1px solid rgba(148, 163, 184, 0.35)",
              borderRadius: 8,
              color: "var(--color-text)",
            }}
            formatter={(value: number, name: string) => {
              if (name === "cumCost") {
                return [`$${value.toFixed(4)}`, "Cost (cum.)"];
              }
              return [value.toLocaleString(), `${leftLineName.replace(" (cumulative)", "")} (cum.)`];
            }}
            labelFormatter={(_, payload) => {
              const p = payload?.[0]?.payload as ChartRow | undefined;
              return p?.day ? `Date (UTC): ${p.day}` : "";
            }}
          />
          <Legend wrapperStyle={{ fontSize: 12 }} />
          <Line
            yAxisId="primary"
            type="monotone"
            dataKey="cumPrimary"
            name={leftLineName}
            stroke="#8b5cf6"
            strokeWidth={2}
            dot={{ r: 2 }}
            activeDot={{ r: 4 }}
          />
          <Line
            yAxisId="cost"
            type="monotone"
            dataKey="cumCost"
            name="Cost USD (cumulative)"
            stroke="#22c55e"
            strokeWidth={2}
            dot={{ r: 2 }}
            activeDot={{ r: 4 }}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
