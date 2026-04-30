"use client";

import { useMemo } from "react";
import {
  Bar,
  CartesianGrid,
  ComposedChart,
  LabelList,
  Legend,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

export type LocalImagesDayPoint = {
  day: string;
  label: string;
  count: number;
};

export type LocalImagesMonthPoint = {
  month: string;
  tick: string;
  count: number;
};

type WithCumulative<T> = T & { cumCount: number };

function addCumulative<T extends { count: number }>(rows: T[]): WithCumulative<T>[] {
  let cum = 0;
  return rows.map((r) => {
    cum += Number(r.count || 0);
    return { ...r, cumCount: cum };
  });
}

function formatCountTick(v: number): string {
  if (v >= 1000) {
    return `${(v / 1000).toFixed(1)}k`;
  }
  return String(Math.round(v));
}

const tooltipStyle = {
  background: "var(--panel-bg, #0f172a)",
  border: "1px solid rgba(148, 163, 184, 0.35)",
  borderRadius: 8,
  color: "var(--color-text)",
};

const lineProps = {
  type: "monotone" as const,
  dataKey: "cumCount" as const,
  name: "Cumulative total",
  stroke: "#818cf8",
  strokeWidth: 2,
  dot: { r: 2, fill: "#818cf8" },
  activeDot: { r: 4 },
  isAnimationActive: false,
};

type ComposedProps<T extends { count: number }> = {
  dataWithCum: WithCumulative<T>[];
  height: number;
  xDataKey: string;
  xAxisBottomLabel?: string;
  barCategoryGap: string;
  maxBarSize: number;
  labelListFontSize: number;
  barName: string;
  tooltipPeriodLabel: string;
  getTooltipTitle: (row: T) => string;
};

function LocalImagesComposedBody<T extends { count: number }>({
  dataWithCum,
  height,
  xDataKey,
  xAxisBottomLabel,
  barCategoryGap,
  maxBarSize,
  labelListFontSize,
  barName,
  tooltipPeriodLabel,
  getTooltipTitle,
}: ComposedProps<T>) {
  return (
    <div style={{ width: "100%", height, minWidth: 0 }}>
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={dataWithCum} margin={{ top: 28, right: 12, left: 8, bottom: 8 }} barCategoryGap={barCategoryGap}>
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(148, 163, 184, 0.2)" vertical={false} />
          <XAxis
            dataKey={xDataKey}
            tick={{ fill: "var(--color-text)", fontSize: xAxisBottomLabel ? 10 : 11 }}
            tickLine={false}
            axisLine={{ stroke: "rgba(148,163,184,0.35)" }}
            label={
              xAxisBottomLabel
                ? {
                    value: xAxisBottomLabel,
                    position: "insideBottom",
                    offset: -4,
                    fill: "var(--muted, #94a3b8)",
                    fontSize: 11,
                  }
                : undefined
            }
          />
          <YAxis
            tick={{ fill: "#fb923c", fontSize: 11 }}
            tickFormatter={formatCountTick}
            allowDecimals={false}
            axisLine={{ stroke: "rgba(148,163,184,0.35)" }}
            tickLine={{ stroke: "rgba(148,163,184,0.35)" }}
            label={{ value: "Images", angle: -90, position: "insideLeft", fill: "#fb923c", fontSize: 11 }}
          />
          <Tooltip
            contentStyle={tooltipStyle}
            formatter={(value: number, name: string) => {
              if (name === "Cumulative total") {
                return [value.toLocaleString(), "Cumulative total"];
              }
              return [value.toLocaleString(), tooltipPeriodLabel];
            }}
            labelFormatter={(_, payload) => {
              const row = payload?.[0]?.payload as T | undefined;
              return row ? getTooltipTitle(row) : "";
            }}
          />
          <Legend wrapperStyle={{ fontSize: 12 }} />
          <Line {...lineProps} />
          <Bar dataKey="count" name={barName} fill="#f97316" radius={[4, 4, 0, 0]} maxBarSize={maxBarSize}>
            <LabelList dataKey="count" position="top" fill="#fdba74" fontSize={labelListFontSize} formatter={(v: number) => String(v)} />
          </Bar>
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}

export function LocalImagesMonthBarChart({ series }: { series: LocalImagesDayPoint[] }) {
  const dataWithCum = useMemo(() => addCumulative(series), [series]);

  if (series.length === 0) {
    return <div className="text-muted">No days in range yet.</div>;
  }

  return (
    <LocalImagesComposedBody<LocalImagesDayPoint>
      dataWithCum={dataWithCum}
      height={280}
      xDataKey="label"
      xAxisBottomLabel="Day of month (UTC)"
      barCategoryGap="12%"
      maxBarSize={28}
      labelListFontSize={9}
      barName="Images (this day)"
      tooltipPeriodLabel="This day"
      getTooltipTitle={(row) => (row.day ? `Date (UTC): ${row.day}` : "")}
    />
  );
}

export function LocalImagesYearBarChart({ series }: { series: LocalImagesMonthPoint[] }) {
  const dataWithCum = useMemo(() => addCumulative(series), [series]);

  if (series.length === 0) {
    return <div className="text-muted">No months in range yet.</div>;
  }

  return (
    <LocalImagesComposedBody<LocalImagesMonthPoint>
      dataWithCum={dataWithCum}
      height={300}
      xDataKey="tick"
      barCategoryGap="18%"
      maxBarSize={40}
      labelListFontSize={10}
      barName="Images (this month)"
      tooltipPeriodLabel="This month"
      getTooltipTitle={(row) => (row.month ? `Month (UTC): ${row.month}` : "")}
    />
  );
}
