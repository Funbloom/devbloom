"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  LabelList,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

export type OpenAiYearMonthRow = {
  /** YYYY-MM from API */
  month: string;
  /** Short X tick, e.g. Jan */
  tick: string;
  tokens: number;
  cost_usd: number;
};

function formatTokensTick(v: number): string {
  if (v >= 1_000_000) {
    return `${(v / 1_000_000).toFixed(1)}M`;
  }
  if (v >= 1000) {
    return `${(v / 1000).toFixed(0)}k`;
  }
  return String(Math.round(v));
}

function formatTokensBarLabel(v: number): string {
  if (v === 0) {
    return "0";
  }
  if (v >= 1_000_000) {
    return `${(v / 1_000_000).toFixed(2)}M`;
  }
  if (v >= 1000) {
    return `${(v / 1000).toFixed(1)}k`;
  }
  return String(Math.round(v));
}

function formatCostTick(v: number): string {
  if (v >= 1000) {
    return `$${(v / 1000).toFixed(1)}k`;
  }
  return `$${v.toFixed(0)}`;
}

function formatCostBarLabel(v: number): string {
  if (v === 0) {
    return "$0";
  }
  if (v < 0.01) {
    return `$${v.toFixed(4)}`;
  }
  if (v < 1000) {
    return `$${v.toFixed(2)}`;
  }
  return `$${v.toFixed(0)}`;
}

export function OpenAiYearMonthlyCharts({ series }: { series: OpenAiYearMonthRow[] }) {
  if (series.length === 0) {
    return null;
  }

  const tooltipStyle = {
    background: "var(--panel-bg, #0f172a)",
    border: "1px solid rgba(148, 163, 184, 0.35)",
    borderRadius: 8,
    color: "var(--color-text)",
  };

  return (
    <div style={{ width: "100%", height: 320, minWidth: 0 }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={series} margin={{ top: 28, right: 16, left: 8, bottom: 8 }} barGap={6} barCategoryGap="18%">
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(148, 163, 184, 0.2)" vertical={false} />
          <XAxis dataKey="tick" tick={{ fill: "var(--color-text)", fontSize: 11 }} tickLine={false} axisLine={{ stroke: "rgba(148,163,184,0.35)" }} />
          <YAxis
            yAxisId="tokens"
            tick={{ fill: "#a78bfa", fontSize: 11 }}
            tickFormatter={formatTokensTick}
            axisLine={{ stroke: "rgba(148,163,184,0.35)" }}
            tickLine={{ stroke: "rgba(148,163,184,0.35)" }}
            label={{ value: "Tokens", angle: -90, position: "insideLeft", fill: "#a78bfa", fontSize: 11 }}
          />
          <YAxis
            yAxisId="cost"
            orientation="right"
            tick={{ fill: "#4ade80", fontSize: 11 }}
            tickFormatter={formatCostTick}
            axisLine={{ stroke: "rgba(148,163,184,0.35)" }}
            tickLine={{ stroke: "rgba(148,163,184,0.35)" }}
            label={{ value: "USD", angle: 90, position: "insideRight", fill: "#4ade80", fontSize: 11 }}
          />
          <Tooltip
            contentStyle={tooltipStyle}
            formatter={(value: number, name: string) => {
              if (name === "cost_usd" || name === "Cost (USD)") {
                return [`$${Number(value).toFixed(4)}`, "Cost"];
              }
              return [value.toLocaleString(), "Tokens"];
            }}
            labelFormatter={(_, payload) => {
              const row = payload?.[0]?.payload as OpenAiYearMonthRow | undefined;
              return row?.month ? `Month (UTC): ${row.month}` : "";
            }}
          />
          <Legend wrapperStyle={{ fontSize: 12 }} />
          <Bar yAxisId="tokens" dataKey="tokens" name="Tokens" fill="#8b5cf6" radius={[4, 4, 0, 0]} maxBarSize={36}>
            <LabelList
              dataKey="tokens"
              position="top"
              fill="#c4b5fd"
              fontSize={9}
              formatter={(v: number) => formatTokensBarLabel(v)}
            />
          </Bar>
          <Bar yAxisId="cost" dataKey="cost_usd" name="Cost (USD)" fill="#22c55e" radius={[4, 4, 0, 0]} maxBarSize={36}>
            <LabelList
              dataKey="cost_usd"
              position="top"
              fill="#86efac"
              fontSize={9}
              formatter={(v: number) => formatCostBarLabel(v)}
            />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
