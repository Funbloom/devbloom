"use client";

import { useEffect, useMemo, useState } from "react";
import { fetchApi } from "../../lib/api";
import { OpenAiMonthCumulativeChart } from "./OpenAiMonthCumulativeChart";
import { OpenAiYearMonthlyCharts } from "./OpenAiYearMonthlyCharts";
import { LocalImagesMonthBarChart, LocalImagesYearBarChart } from "./LocalImagesCharts";

type Period = "month" | "year";
type UsageTab = "local" | "openai" | "gemini";

type ProviderUsage = {
  provider: string;
  requests_count: number;
  input_tokens: number;
  output_tokens: number;
  total_tokens: number;
  cost_usd: number;
};

type OpenAiMonthBreakdown = "total" | "image" | "chat";

type UsageSummary = {
  period: Period;
  images_generated: number;
  providers: Record<string, ProviderUsage>;
  totals: {
    requests_count: number;
    input_tokens: number;
    output_tokens: number;
    total_tokens: number;
    cost_usd: number;
  };
  remaining: {
    openai_tokens: number | null;
    gemini_tokens: number | null;
  };
  limits: {
    openai_tokens: number | null;
    gemini_tokens: number | null;
  };
  openai_graph?: {
    available: boolean;
    reason?: string;
    mode?: "year_monthly" | "month_daily";
    series?: Array<{
      month?: string;
      day?: string;
      tokens: number;
      cost_usd: number;
    }>;
    series_by_breakdown?: {
      total?: Array<{ day?: string; tokens: number; cost_usd: number }>;
      chat?: Array<{ day?: string; tokens: number; cost_usd: number }>;
      image?: Array<{ day?: string; tokens: number; cost_usd: number }>;
    };
    totals?: {
      tokens: number;
      cost_usd: number;
    };
  };
  local_images_graph?: {
    available: boolean;
    reason?: string;
    mode?: "month_daily" | "year_monthly";
    series?: Array<{ day?: string; month?: string; count: number }>;
  };
};

export default function SettingsUsagePage() {
  const [period, setPeriod] = useState<Period>("month");
  const [activeTab, setActiveTab] = useState<UsageTab>("local");
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string>("");
  const [summary, setSummary] = useState<UsageSummary | null>(null);
  const [openaiMonthBreakdown, setOpenaiMonthBreakdown] = useState<OpenAiMonthBreakdown>("total");

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      setError("");
      try {
        const response = await fetchApi(`/usage/summary?period=${period}`);
        if (!response.ok) {
          throw new Error(`Failed to load usage (${response.status})`);
        }
        const data = (await response.json()) as UsageSummary;
        if (!cancelled) {
          setSummary(data);
        }
      } catch (err) {
        if (!cancelled) {
          setSummary(null);
          setError(err instanceof Error ? err.message : "Failed to load usage.");
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, [period]);

  const providers = useMemo(() => {
    if (!summary) {
      return [] as ProviderUsage[];
    }
    return Object.values(summary.providers || {}).sort((a, b) => a.provider.localeCompare(b.provider));
  }, [summary]);

  const openaiYearMonthlySeries = useMemo(() => {
    const graph = summary?.openai_graph;
    if (!graph?.available || graph.mode !== "year_monthly" || !Array.isArray(graph.series)) {
      return [] as Array<{ month: string; tick: string; tokens: number; cost_usd: number }>;
    }
    return graph.series.map((s) => {
      const month = String(s.month || "");
      let tick = "--";
      if (month.length >= 7) {
        const y = Number(month.slice(0, 4));
        const m = Number(month.slice(5, 7));
        if (y > 0 && m >= 1 && m <= 12) {
          tick = new Date(Date.UTC(y, m - 1, 1)).toLocaleString("en-US", { month: "short", timeZone: "UTC" });
        }
      }
      return {
        month,
        tick,
        tokens: Number(s.tokens || 0),
        cost_usd: Number(s.cost_usd || 0),
      };
    });
  }, [summary]);

  const openaiUsed = Number(summary?.providers?.openai?.total_tokens || 0);
  const openaiLimit = summary?.limits?.openai_tokens ?? null;
  const geminiUsed = Number(summary?.providers?.gemini?.total_tokens || 0);
  const geminiLimit = summary?.limits?.gemini_tokens ?? null;

  const openaiPct =
    openaiLimit && openaiLimit > 0 ? Math.min(100, Math.max(0, (openaiUsed / openaiLimit) * 100)) : null;
  const geminiPct =
    geminiLimit && geminiLimit > 0 ? Math.min(100, Math.max(0, (geminiUsed / geminiLimit) * 100)) : null;

  const openaiMonthChartSeries = useMemo(() => {
    const graph = summary?.openai_graph;
    const br = graph?.series_by_breakdown;
    if (!graph?.available || graph.mode !== "month_daily") {
      return [];
    }
    const pick =
      openaiMonthBreakdown === "total"
        ? br?.total
        : openaiMonthBreakdown === "chat"
          ? br?.chat
          : br?.image;
    const raw = Array.isArray(pick) && pick.length > 0 ? pick : graph.series;
    if (!Array.isArray(raw)) {
      return [];
    }
    return raw.map((s) => ({
      day: s.day,
      tokens: Number(s.tokens || 0),
      cost_usd: Number(s.cost_usd || 0),
    }));
  }, [summary, openaiMonthBreakdown]);

  const openaiMonthPrimaryLabel =
    openaiMonthBreakdown === "image" ? "Output tokens (cumulative)" : undefined;

  const localImagesMonthSeries = useMemo(() => {
    const g = summary?.local_images_graph;
    if (!g?.available || g.mode !== "month_daily" || !Array.isArray(g.series)) {
      return [];
    }
    return g.series.map((s) => {
      const day = String(s.day || "");
      const label = day.length >= 10 ? day.slice(8, 10) : day || "--";
      return { day, label, count: Number(s.count || 0) };
    });
  }, [summary]);

  const localImagesYearSeries = useMemo(() => {
    const g = summary?.local_images_graph;
    if (!g?.available || g.mode !== "year_monthly" || !Array.isArray(g.series)) {
      return [];
    }
    return g.series.map((s) => {
      const month = String(s.month || "");
      let tick = "--";
      if (month.length >= 7) {
        const y = Number(month.slice(0, 4));
        const m = Number(month.slice(5, 7));
        if (y > 0 && m >= 1 && m <= 12) {
          tick = new Date(Date.UTC(y, m - 1, 1)).toLocaleString("en-US", { month: "short", timeZone: "UTC" });
        }
      }
      return { month, tick, count: Number(s.count || 0) };
    });
  }, [summary]);

  return (
    <main>
      <div className="imagegen-shell" style={{ minHeight: "calc(100vh - 84px)" }}>
        <div className="imagegen-right" style={{ minWidth: 0, width: "100%" }}>
          <section className="imagegen-panel" style={{ minHeight: "calc(100vh - 84px)" }}>
            <h2 className="imagegen-panel-title">Usage</h2>
            <div className="imagegen-panel-body" style={{ display: "grid", gap: 12 }}>
              <div style={{ display: "flex", gap: 8 }}>
                <button type="button" className="btn-secondary" onClick={() => setPeriod("month")} disabled={period === "month"}>
                  This month
                </button>
                <button type="button" className="btn-secondary" onClick={() => setPeriod("year")} disabled={period === "year"}>
                  This year
                </button>
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => setActiveTab("local")}
                  disabled={activeTab === "local"}
                >
                  Local Metrics
                </button>
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => setActiveTab("openai")}
                  disabled={activeTab === "openai"}
                >
                  OpenAI Metrics
                </button>
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => setActiveTab("gemini")}
                  disabled={activeTab === "gemini"}
                >
                  Gemini Metrics
                </button>
              </div>

              {loading ? <div className="text-muted">Loading usage...</div> : null}
              {error ? <div className="status-failure">{error}</div> : null}

              {!loading && !error && summary ? (
                <>
                  {activeTab === "local" ? (
                    <>
                      <section style={{ border: "1px solid #1f2937", borderRadius: 8, padding: 12 }}>
                        <strong>Local Totals (database)</strong>
                        <div className="text-muted" style={{ marginTop: 6 }}>
                          Images generated: {summary.images_generated} | Provider requests: {summary.totals.requests_count} | Tokens:{" "}
                          {summary.totals.total_tokens} | Cost: ${summary.totals.cost_usd.toFixed(4)}
                        </div>
                      </section>

                      <section style={{ border: "1px solid #1f2937", borderRadius: 8, padding: 12, display: "grid", gap: 10 }}>
                        <strong>Images generated ({period === "month" ? "by day, UTC" : "by month, UTC"})</strong>
                        <div className="text-muted" style={{ fontSize: 13 }}>
                          The total above is the same period sum; this chart shows when images were created (daily or monthly buckets).
                          Orange bars = count in that bucket; purple line = running total. Counts appear above each bar.
                        </div>
                        {!summary.local_images_graph?.available ? (
                          <div className="text-muted">
                            Chart unavailable
                            {summary.local_images_graph?.reason ? ` (${summary.local_images_graph.reason})` : ""}.
                          </div>
                        ) : period === "month" ? (
                          <LocalImagesMonthBarChart series={localImagesMonthSeries} />
                        ) : (
                          <LocalImagesYearBarChart series={localImagesYearSeries} />
                        )}
                      </section>

                      <section style={{ border: "1px solid #1f2937", borderRadius: 8, padding: 12 }}>
                        <strong>Providers (database)</strong>
                        {providers.length === 0 ? (
                          <div className="text-muted" style={{ marginTop: 6 }}>
                            No provider usage recorded yet for this period.
                          </div>
                        ) : (
                          <div style={{ display: "grid", gap: 8, marginTop: 8 }}>
                            {providers.map((provider) => (
                              <div key={provider.provider} style={{ border: "1px solid #111827", borderRadius: 6, padding: 10 }}>
                                <strong style={{ textTransform: "capitalize" }}>{provider.provider}</strong>
                                <div className="text-muted">
                                  Requests: {provider.requests_count} | Tokens: {provider.total_tokens} | Cost: $
                                  {provider.cost_usd.toFixed(4)}
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </section>
                    </>
                  ) : null}

                  {activeTab === "openai" ? (
                    <>
                      {period === "month" ? (
                        <section style={{ border: "1px solid #1f2937", borderRadius: 8, padding: 12, display: "grid", gap: 10 }}>
                          <strong>OpenAI this month: totals + limit</strong>
                          <div className="text-muted">
                            OpenAI total tokens: {openaiUsed} | Remaining:{" "}
                            {summary.remaining.openai_tokens === null ? "Not configured" : summary.remaining.openai_tokens}
                          </div>
                          <div style={{ height: 10, borderRadius: 999, overflow: "hidden", background: "#1f2937" }}>
                            <div
                              style={{
                                height: "100%",
                                width: `${openaiPct ?? 0}%`,
                                background: openaiPct !== null && openaiPct >= 90 ? "#ef4444" : "#8b5cf6",
                              }}
                            />
                          </div>
                          <div className="text-muted">
                            OpenAI limit: {openaiLimit ?? "Not configured"} {openaiPct !== null ? `(${openaiPct.toFixed(1)}% used)` : ""}
                          </div>
                          <div className="text-muted">
                            Cost this month: ${Number(summary.providers?.openai?.cost_usd || 0).toFixed(4)}
                          </div>
                          <div style={{ marginTop: 8 }}>
                            <strong>Cumulative usage &amp; cost by day (UTC)</strong>
                            <div className="text-muted" style={{ marginBottom: 8, fontSize: 13 }}>
                              Total: org completions tokens + full daily cost. Chat: same tokens with cost split by line item
                              (non-image). Image: cumulative output tokens from completion usage for image models (group_by model) +
                              image-attributed cost (heuristic line items). Purple = tokens; green = USD.
                            </div>
                            <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 10 }}>
                              <button
                                type="button"
                                className="btn-secondary"
                                onClick={() => setOpenaiMonthBreakdown("total")}
                                disabled={openaiMonthBreakdown === "total"}
                              >
                                Total
                              </button>
                              <button
                                type="button"
                                className="btn-secondary"
                                onClick={() => setOpenaiMonthBreakdown("chat")}
                                disabled={openaiMonthBreakdown === "chat"}
                              >
                                Chat
                              </button>
                              <button
                                type="button"
                                className="btn-secondary"
                                onClick={() => setOpenaiMonthBreakdown("image")}
                                disabled={openaiMonthBreakdown === "image"}
                              >
                                Image
                              </button>
                            </div>
                            {!summary.openai_graph?.available ? (
                              <div className="text-muted">OpenAI org usage API unavailable.</div>
                            ) : (
                              <OpenAiMonthCumulativeChart series={openaiMonthChartSeries} primaryLabel={openaiMonthPrimaryLabel} />
                            )}
                          </div>
                        </section>
                      ) : (
                        <section style={{ border: "1px solid #1f2937", borderRadius: 8, padding: 12 }}>
                          <strong>OpenAI this year: monthly spend + tokens</strong>
                          {!summary.openai_graph?.available ? (
                            <div className="text-muted" style={{ marginTop: 6 }}>
                              OpenAI org usage API data unavailable (set `OPENAI_ADMIN_KEY` or ensure org access).
                            </div>
                          ) : openaiYearMonthlySeries.length === 0 ? (
                            <div className="text-muted" style={{ marginTop: 6 }}>
                              No monthly data available yet.
                            </div>
                          ) : (
                            <div style={{ marginTop: 10 }}>
                              <OpenAiYearMonthlyCharts series={openaiYearMonthlySeries} />
                              <div className="text-muted" style={{ marginTop: 8, fontSize: 13 }}>
                                Each month: purple bar = tokens (left scale), green bar = USD (right scale). Values are printed above
                                each bar.
                              </div>
                            </div>
                          )}
                        </section>
                      )}
                    </>
                  ) : null}

                  {activeTab === "gemini" ? (
                    <section style={{ border: "1px solid #1f2937", borderRadius: 8, padding: 12, display: "grid", gap: 10 }}>
                      <strong>Gemini Metrics</strong>
                      <div className="text-muted">
                        Gemini tokens (tracked in app): {geminiUsed} | Remaining:{" "}
                        {summary.remaining.gemini_tokens === null ? "Not configured" : summary.remaining.gemini_tokens}
                      </div>
                      <div style={{ height: 10, borderRadius: 999, overflow: "hidden", background: "#1f2937" }}>
                        <div
                          style={{
                            height: "100%",
                            width: `${geminiPct ?? 0}%`,
                            background: geminiPct !== null && geminiPct >= 90 ? "#ef4444" : "#22c55e",
                          }}
                        />
                      </div>
                      <div className="text-muted">
                        Gemini limit: {geminiLimit ?? "Not configured"} {geminiPct !== null ? `(${geminiPct.toFixed(1)}% used)` : ""}
                      </div>
                      <div className="text-muted">
                        Note: Gemini public API does not currently expose a direct org usage endpoint equivalent to OpenAI org
                        costs/usage for this dashboard path. This tab currently shows tracked usage from your app database.
                      </div>
                    </section>
                  ) : null}
                </>
              ) : null}
            </div>
          </section>
        </div>
      </div>
    </main>
  );
}
