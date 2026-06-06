"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties, ReactElement } from "react";
import { RISK_LABELS } from "./planningColors";
import { formatPlanningDateLong } from "../milestoneDetail";
import {
  analyzePlanning,
  buildAnalyzedRiskUpdates,
  computeAnalysisVacationRange,
  countAnalyzedRiskChanges,
  severityBackground,
  severityColor,
  type AnalysisSeverity,
  type MilestoneAnalysisRow,
  type PlanningAnalysisResult,
} from "../planningAnalysis";
import { PlanningAnalysisCharts } from "./PlanningAnalysisCharts";
import { fetchVacationGrid } from "../../vacations/vacationClient";
import type { PlanningGraph } from "../types";
import type { VacationGrid } from "../../vacations/types";

type Props = {
  graph: PlanningGraph;
  planStart: string;
  activeProjectName: string;
  saving?: boolean;
  onClose: () => void;
  onSelectMilestone?: (milestoneId: string) => void;
  onApplyAnalyzedRisks?: (result: PlanningAnalysisResult) => Promise<void>;
};

const thStyle: CSSProperties = {
  textAlign: "left",
  padding: "8px 10px",
  fontSize: 12,
  fontWeight: 600,
  color: "#94a3b8",
  borderBottom: "1px solid #334155",
  whiteSpace: "nowrap",
};

const tdStyle: CSSProperties = {
  padding: "8px 10px",
  fontSize: 13,
  borderBottom: "1px solid #1e293b",
  verticalAlign: "top",
};

function SummaryCard({
  label,
  value,
  severity,
}: {
  label: string;
  value: string | number;
  severity: AnalysisSeverity;
}): ReactElement {
  return (
    <div
      style={{
        padding: "12px 14px",
        borderRadius: 10,
        border: "1px solid #334155",
        background: severityBackground(severity),
      }}
    >
      <div style={{ fontSize: 12, color: "#94a3b8", marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 700, color: severityColor(severity) }}>{value}</div>
    </div>
  );
}

function MatrixCell({
  severity,
  title,
}: {
  severity: AnalysisSeverity;
  title: string;
}): ReactElement {
  return (
    <div
      title={title}
      style={{
        height: 28,
        borderRadius: 6,
        background: severityBackground(severity),
        border: `1px solid ${severityColor(severity)}55`,
      }}
    />
  );
}

function PaceBarRow({ row }: { row: MilestoneAnalysisRow }): ReactElement {
  const elapsedWidth = `${Math.round(row.elapsedPct * 100)}%`;
  const doneWidth = `${Math.round(row.donePct * 100)}%`;
  return (
    <div style={{ display: "grid", gap: 6 }}>
      <div style={{ fontSize: 13, fontWeight: 600 }}>{row.milestoneName}</div>
      <div style={{ display: "grid", gap: 4 }}>
        <div style={{ fontSize: 11, color: "#94a3b8" }}>Time elapsed</div>
        <div style={{ height: 8, borderRadius: 4, background: "#1e293b" }}>
          <div
            style={{
              height: "100%",
              width: elapsedWidth,
              borderRadius: 4,
              background: "#64748b",
            }}
          />
        </div>
      </div>
      <div style={{ display: "grid", gap: 4 }}>
        <div style={{ fontSize: 11, color: "#94a3b8" }}>Deliverables done</div>
        <div style={{ height: 8, borderRadius: 4, background: "#1e293b" }}>
          <div
            style={{
              height: "100%",
              width: doneWidth,
              borderRadius: 4,
              background: "#22c55e",
            }}
          />
        </div>
      </div>
    </div>
  );
}

function severityLabel(severity: AnalysisSeverity): string {
  switch (severity) {
    case "risk":
      return "Risk";
    case "caution":
      return "Caution";
    default:
      return "On track";
  }
}

export function PlanningAnalysisModal({
  graph,
  planStart,
  activeProjectName,
  saving,
  onClose,
  onSelectMilestone,
  onApplyAnalyzedRisks,
}: Props): ReactElement {
  const findingsRef = useRef<HTMLDivElement | null>(null);
  const [vacationGrid, setVacationGrid] = useState<VacationGrid | null>(null);
  const [vacationLoading, setVacationLoading] = useState(true);
  const [vacationError, setVacationError] = useState<string | null>(null);
  const [updateRisksError, setUpdateRisksError] = useState<string | null>(null);
  const [updatingRisks, setUpdatingRisks] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const range = computeAnalysisVacationRange(graph, planStart);
    setVacationLoading(true);
    setVacationError(null);
    void fetchVacationGrid(range.fromIso, range.toIso)
      .then((data) => {
        if (!cancelled) {
          setVacationGrid(data);
        }
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setVacationError(err instanceof Error ? err.message : "Failed to load vacation data.");
          setVacationGrid(null);
        }
      })
      .finally(() => {
        if (!cancelled) {
          setVacationLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [graph, planStart]);

  const result: PlanningAnalysisResult | null = useMemo(() => {
    if (vacationLoading) {
      return null;
    }
    return analyzePlanning(
      graph,
      planStart,
      new Date(),
      vacationGrid
        ? {
            employees: vacationGrid.employees,
            entries: vacationGrid.entries,
            holidays: vacationGrid.holidays,
          }
        : undefined,
    );
  }, [graph, planStart, vacationGrid, vacationLoading]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }
    };
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [onClose]);

  const handleDeliverableSelect = (deliverableId: string, milestoneId: string) => {
    const finding = document.getElementById(`finding-${deliverableId}`);
    if (finding) {
      finding.scrollIntoView({ behavior: "smooth", block: "nearest" });
    } else if (onSelectMilestone) {
      onSelectMilestone(milestoneId);
      onClose();
    }
  };

  const generatedLabel = result
    ? new Date(result.generatedAt).toLocaleString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
        hour: "numeric",
        minute: "2-digit",
      })
    : "";

  const riskChangeCount = useMemo(() => {
    if (!result) {
      return 0;
    }
    return countAnalyzedRiskChanges(buildAnalyzedRiskUpdates(result));
  }, [result]);

  const handleUpdateRisks = async () => {
    if (!result || !onApplyAnalyzedRisks || updatingRisks || saving) {
      return;
    }
    setUpdatingRisks(true);
    setUpdateRisksError(null);
    try {
      await onApplyAnalyzedRisks(result);
    } catch (err) {
      setUpdateRisksError(err instanceof Error ? err.message : "Failed to update risks.");
    } finally {
      setUpdatingRisks(false);
    }
  };

  const risksBusy = Boolean(saving || updatingRisks);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="planning-analysis-title"
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 1000,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "rgba(0,0,0,0.6)",
        padding: 16,
      }}
      onClick={onClose}
    >
      <div
        style={{
          width: "min(960px, 100%)",
          maxHeight: "min(92vh, 900px)",
          overflow: "auto",
          background: "#0f172a",
          border: "1px solid #334155",
          borderRadius: 12,
          padding: 16,
          display: "grid",
          gap: 16,
        }}
        onClick={(event) => event.stopPropagation()}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}>
          <div>
            <h2 id="planning-analysis-title" style={{ margin: 0, fontSize: 18 }}>
              Planning analysis
            </h2>
            <p style={{ margin: "6px 0 0", fontSize: 13, color: "#94a3b8" }}>
              Schedule and workload review for{" "}
              <strong style={{ color: "#e2e8f0" }}>{activeProjectName || "active project"}</strong>
              {generatedLabel ? <> · {generatedLabel}</> : null}
            </p>
            {vacationGrid ? (
              <p style={{ margin: "4px 0 0", fontSize: 12, color: "#64748b" }}>
                Owner workload includes vacation, away, and holiday days from the employee calendar.
              </p>
            ) : null}
          </div>
          <div style={{ display: "flex", gap: 8, flexShrink: 0 }}>
            {result && onApplyAnalyzedRisks ? (
              <button
                type="button"
                className="imagegen-button"
                disabled={risksBusy || riskChangeCount === 0}
                onClick={() => void handleUpdateRisks()}
              >
                {updatingRisks
                  ? "Updating risks…"
                  : riskChangeCount === 0
                    ? "Risks up to date"
                    : `Update risks (${riskChangeCount})`}
              </button>
            ) : null}
            <button
              type="button"
              className="imagegen-button-secondary"
              disabled={risksBusy}
              onClick={onClose}
            >
              Close
            </button>
          </div>
        </div>

        {updateRisksError ? (
          <p role="alert" style={{ margin: 0, fontSize: 13, color: "#fca5a5" }}>
            {updateRisksError}
          </p>
        ) : null}

        {vacationLoading ? (
          <p style={{ margin: 0, fontSize: 13, color: "#94a3b8" }}>Loading vacation calendar…</p>
        ) : null}

        {vacationError ? (
          <p role="status" style={{ margin: 0, fontSize: 13, color: "#fde047" }}>
            Vacation data unavailable — owner workload uses calendar time only. ({vacationError})
          </p>
        ) : null}

        {!result ? null : (
        <>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
            gap: 10,
          }}
        >
          <SummaryCard
            label="Overdue deliverables"
            value={result.summary.overdueDeliverables}
            severity={result.summary.overdueDeliverables > 0 ? "risk" : "on_track"}
          />
          <SummaryCard
            label="Milestones behind"
            value={result.summary.atRiskMilestones}
            severity={result.summary.atRiskMilestones > 0 ? "caution" : "on_track"}
          />
          <SummaryCard
            label="Owners overloaded"
            value={result.summary.overloadedOwners}
            severity={result.summary.overloadedOwners > 0 ? "caution" : "on_track"}
          />
          <SummaryCard
            label="On track"
            value={`${result.summary.onTrackPct}%`}
            severity={result.summary.onTrackPct >= 70 ? "on_track" : result.summary.onTrackPct >= 40 ? "caution" : "risk"}
          />
        </div>

        {result.milestones.length === 0 ? (
          <p style={{ margin: 0, color: "#94a3b8", fontSize: 13 }}>No milestones to analyze.</p>
        ) : (
          <>
            <div>
              <h3 style={{ margin: "0 0 10px", fontSize: 14 }}>Milestone health matrix</h3>
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 560 }}>
                  <thead>
                    <tr>
                      <th style={thStyle}>Milestone</th>
                      <th style={thStyle}>Delivery</th>
                      <th style={thStyle}>Schedule</th>
                      <th style={thStyle}>Pace</th>
                      <th style={thStyle}>Deliverables</th>
                      <th style={thStyle}>Manual risk</th>
                    </tr>
                  </thead>
                  <tbody>
                    {result.milestones.map((row) => (
                      <tr key={row.milestoneId}>
                        <td style={tdStyle}>
                          <button
                            type="button"
                            onClick={() => {
                              if (onSelectMilestone) {
                                onSelectMilestone(row.milestoneId);
                                onClose();
                              }
                            }}
                            style={{
                              background: "none",
                              border: "none",
                              color: onSelectMilestone ? "#93c5fd" : "#e2e8f0",
                              cursor: onSelectMilestone ? "pointer" : "default",
                              padding: 0,
                              fontSize: 13,
                              textAlign: "left",
                            }}
                          >
                            {row.milestoneName}
                          </button>
                        </td>
                        <td style={tdStyle}>{formatPlanningDateLong(row.deliveryDateIso)}</td>
                        <td style={tdStyle}>
                          <MatrixCell severity={row.scheduleSeverity} title={row.scheduleDetail} />
                        </td>
                        <td style={tdStyle}>
                          <MatrixCell severity={row.paceSeverity} title={row.paceDetail} />
                        </td>
                        <td style={tdStyle}>
                          <MatrixCell severity={row.deliverablesSeverity} title={row.deliverablesDetail} />
                        </td>
                        <td style={tdStyle}>{RISK_LABELS[row.manualRisk]}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div>
              <h3 style={{ margin: "0 0 10px", fontSize: 14 }}>Pace comparison</h3>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))",
                  gap: 12,
                }}
              >
                {result.milestones.map((row) => (
                  <div
                    key={`pace-${row.milestoneId}`}
                    style={{
                      padding: 12,
                      borderRadius: 10,
                      border: "1px solid #334155",
                      background: "#111827",
                    }}
                  >
                    <PaceBarRow row={row} />
                  </div>
                ))}
              </div>
            </div>

            <PlanningAnalysisCharts
              result={result}
              onDeliverableSelect={handleDeliverableSelect}
            />

            <div ref={findingsRef}>
              <h3 style={{ margin: "0 0 10px", fontSize: 14 }}>Findings</h3>
              {result.findings.length === 0 ? (
                <p style={{ margin: 0, fontSize: 13, color: "#94a3b8" }}>Everything looks on track.</p>
              ) : (
                <div style={{ overflowX: "auto" }}>
                  <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 640 }}>
                    <thead>
                      <tr>
                        <th style={thStyle}>Severity</th>
                        <th style={thStyle}>Item</th>
                        <th style={thStyle}>Issue</th>
                        <th style={thStyle}>Detail</th>
                        <th style={thStyle} />
                      </tr>
                    </thead>
                    <tbody>
                      {result.findings.map((finding) => (
                        <tr
                          key={finding.id}
                          id={
                            finding.deliverableId
                              ? `finding-${finding.deliverableId}`
                              : undefined
                          }
                        >
                          <td style={tdStyle}>
                            <span
                              style={{
                                display: "inline-block",
                                padding: "2px 8px",
                                borderRadius: 999,
                                fontSize: 11,
                                fontWeight: 600,
                                color: severityColor(finding.severity),
                                background: severityBackground(finding.severity),
                                border: `1px solid ${severityColor(finding.severity)}55`,
                              }}
                            >
                              {severityLabel(finding.severity)}
                            </span>
                          </td>
                          <td style={tdStyle}>{finding.itemLabel}</td>
                          <td style={tdStyle}>{finding.issueLabel}</td>
                          <td style={{ ...tdStyle, maxWidth: 320 }}>{finding.detail}</td>
                          <td style={tdStyle}>
                            {finding.milestoneId && onSelectMilestone ? (
                              <button
                                type="button"
                                className="imagegen-button-secondary"
                                style={{ fontSize: 12, padding: "4px 8px" }}
                                onClick={() => {
                                  onSelectMilestone(finding.milestoneId as string);
                                  onClose();
                                }}
                              >
                                View milestone
                              </button>
                            ) : null}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </>
        )}
        </>
        )}
      </div>
    </div>
  );
}
