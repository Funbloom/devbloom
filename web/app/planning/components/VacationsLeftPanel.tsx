"use client";

import type { ReactElement } from "react";
import type { MonthZoom } from "../monthZoom";
import type { SelectionActionState } from "../vacationSelection";
import { VACATION_HOLIDAY_CELL_COLOR } from "../vacationGrid";
import { MonthZoomWidget } from "./MonthZoomWidget";

type Props = {
  selectionState: SelectionActionState;
  saving: boolean;
  monthZoom: MonthZoom;
  maxExpandedMonths: number;
  onMonthZoomChange: (zoom: MonthZoom) => void;
  onRequestVacation: () => void;
  onSetAway: () => void;
  onCancelVacation: () => void;
  onCancelAway: () => void;
};

export function VacationsLeftPanel({
  selectionState,
  saving,
  monthZoom,
  maxExpandedMonths,
  onMonthZoomChange,
  onRequestVacation,
  onSetAway,
  onCancelVacation,
  onCancelAway,
}: Props): ReactElement {
  return (
    <div className="imagegen-panel">
      <h2 className="imagegen-panel-title">Vacations</h2>
      <div className="imagegen-panel-body" style={{ display: "grid", gap: 12 }}>
        <p style={{ margin: 0, fontSize: 13, color: "var(--muted, #94a3b8)", lineHeight: 1.45 }}>
          Drag to select days on the grid. Changes are saved immediately and notify the team chat
          when configured.
        </p>
        <MonthZoomWidget
          monthZoom={monthZoom}
          maxExpandedMonths={maxExpandedMonths}
          cellWidthLabel="Day cell width"
          onMonthZoomChange={onMonthZoomChange}
        />
        <div style={{ fontSize: 12, color: "var(--muted, #94a3b8)", display: "grid", gap: 4 }}>
          <div>
            <span
              style={{
                display: "inline-block",
                width: 12,
                height: 12,
                background: "#ef4444",
                borderRadius: 2,
                marginRight: 6,
                verticalAlign: "middle",
              }}
            />
            Red — vacation
          </div>
          <div>
            <span
              style={{
                display: "inline-block",
                width: 12,
                height: 12,
                background: "#eab308",
                borderRadius: 2,
                marginRight: 6,
                verticalAlign: "middle",
              }}
            />
            Yellow — away but working
          </div>
          <div>
            <span
              style={{
                display: "inline-block",
                width: 12,
                height: 12,
                background: VACATION_HOLIDAY_CELL_COLOR,
                borderRadius: 2,
                marginRight: 6,
                verticalAlign: "middle",
              }}
            />
            Purple — US federal holiday
          </div>
        </div>
        <div style={{ display: "grid", gap: 8 }}>
          {selectionState === "available" ? (
            <>
              <button
                type="button"
                className="admin-btn"
                disabled={saving}
                onClick={onRequestVacation}
              >
                Request Vacation
              </button>
              <button type="button" className="admin-btn" disabled={saving} onClick={onSetAway}>
                Set as working away
              </button>
            </>
          ) : null}
          {selectionState === "vacation" ? (
            <button
              type="button"
              className="admin-btn"
              disabled={saving}
              onClick={onCancelVacation}
            >
              Cancel Vacation
            </button>
          ) : null}
          {selectionState === "away" ? (
            <button type="button" className="admin-btn" disabled={saving} onClick={onCancelAway}>
              Cancel away
            </button>
          ) : null}
          {selectionState === "mixed" ? (
            <p style={{ margin: 0, fontSize: 12, color: "var(--muted, #94a3b8)" }}>
              Selection mixes different cell types. Select only white, red, or yellow cells.
            </p>
          ) : null}
          {selectionState === "holiday" ? (
            <p style={{ margin: 0, fontSize: 12, color: "var(--muted, #94a3b8)" }}>
              Federal holidays cannot be changed.
            </p>
          ) : null}
          {selectionState === "inactive" ? (
            <p style={{ margin: 0, fontSize: 12, color: "var(--muted, #94a3b8)" }}>
              Some selected days are before an employee&apos;s start date.
            </p>
          ) : null}
          {selectionState === "none" ? (
            <p style={{ margin: 0, fontSize: 12, color: "var(--muted, #94a3b8)" }}>
              Select one or more cells on the grid.
            </p>
          ) : null}
        </div>
      </div>
    </div>
  );
}
