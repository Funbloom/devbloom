"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { ReactElement } from "react";
import { useAuth } from "../contexts/AuthContext";
import { StudioTwoColumnShell } from "../components/studio/StudioTwoColumnShell";
import { MonthZoomWidget } from "../planning/components/MonthZoomWidget";
import { clampMonthZoom, orderedMonthKeysBetweenIso, type MonthZoom } from "../planning/monthZoom";
import { VacationsGrid } from "./components/VacationsGrid";
import { VacationsLeftPanel } from "./components/VacationsLeftPanel";
import { fetchVacationGrid, updateVacationCells } from "./vacationClient";
import { buildDayColumns } from "./vacationGrid";
import {
  loadMonthZoom,
  saveMonthZoom,
  VACATION_MONTH_ZOOM_STORAGE_KEY,
} from "./monthZoomStorage";
import type { VacationGrid } from "./types";
import {
  aggregateSelectionState,
  cellKey,
  filterSelectableVacationKeys,
  parseCellKey,
  type VacationCellKey,
} from "./vacationSelection";

const emptyVacationGrid = (): VacationGrid => ({
  employees: [],
  entries: [],
  holidays: [],
  range: { from: "", to: "" },
  current_employee_id: null,
  can_edit_all: false,
});

export function VacationsPage(): ReactElement {
  const { authUser } = useAuth();
  const [vacationGrid, setVacationGrid] = useState<VacationGrid>(emptyVacationGrid);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(new Set());
  const [dragAnchor, setDragAnchor] = useState<VacationCellKey | null>(null);
  const [monthZoom, setMonthZoom] = useState<MonthZoom>(() =>
    loadMonthZoom(VACATION_MONTH_ZOOM_STORAGE_KEY),
  );

  const maxExpandedMonths = useMemo(() => {
    if (!vacationGrid.range.from || !vacationGrid.range.to) {
      return 1;
    }
    return orderedMonthKeysBetweenIso(vacationGrid.range.from, vacationGrid.range.to).length;
  }, [vacationGrid.range.from, vacationGrid.range.to]);

  useEffect(() => {
    setMonthZoom((prev) => clampMonthZoom(prev, maxExpandedMonths));
  }, [maxExpandedMonths]);

  useEffect(() => {
    saveMonthZoom(VACATION_MONTH_ZOOM_STORAGE_KEY, monthZoom);
  }, [monthZoom]);

  const loadVacations = useCallback(async () => {
    setLoading(true);
    setStatus(null);
    try {
      const data = await fetchVacationGrid();
      setVacationGrid(data);
    } catch (err) {
      setStatus(err instanceof Error ? err.message : "Failed to load vacation data.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadVacations();
  }, [loadVacations]);

  const entryStatusByKey = useMemo(() => {
    const map = new Map<string, "vacation" | "away_working">();
    for (const entry of vacationGrid.entries) {
      map.set(cellKey(entry.employee_id, entry.day_date), entry.status);
    }
    return map;
  }, [vacationGrid.entries]);

  const holidayDates = useMemo(() => new Set(vacationGrid.holidays), [vacationGrid.holidays]);

  const dayColumns = useMemo(() => {
    if (!vacationGrid.range.from || !vacationGrid.range.to) {
      return [];
    }
    return buildDayColumns(vacationGrid.range.from, vacationGrid.range.to);
  }, [vacationGrid.range.from, vacationGrid.range.to]);

  const weekendDates = useMemo(
    () => new Set(dayColumns.filter((column) => column.isWeekend).map((column) => column.iso)),
    [dayColumns],
  );

  const inactiveKeys = useMemo(() => {
    const set = new Set<string>();
    for (const employee of vacationGrid.employees) {
      for (const column of dayColumns) {
        if (column.iso < employee.start_date) {
          set.add(cellKey(employee.id, column.iso));
        }
      }
    }
    return set;
  }, [vacationGrid.employees, dayColumns]);

  const currentEmployeeId = useMemo(() => {
    if (vacationGrid.current_employee_id) {
      return vacationGrid.current_employee_id;
    }
    const email = authUser?.email?.trim().toLowerCase();
    if (!email) {
      return null;
    }
    const match = vacationGrid.employees.find(
      (employee) => employee.user_email?.trim().toLowerCase() === email,
    );
    return match?.id ?? null;
  }, [authUser?.email, vacationGrid.current_employee_id, vacationGrid.employees]);

  const readonlyKeys = useMemo(() => {
    if (vacationGrid.can_edit_all) {
      return new Set<string>();
    }
    const ownId = currentEmployeeId;
    const set = new Set<string>();
    for (const employee of vacationGrid.employees) {
      if (employee.id === ownId) {
        continue;
      }
      for (const column of dayColumns) {
        set.add(cellKey(employee.id, column.iso));
      }
    }
    return set;
  }, [vacationGrid.can_edit_all, currentEmployeeId, vacationGrid.employees, dayColumns]);

  const selectionState = aggregateSelectionState(
    selectedKeys,
    entryStatusByKey,
    holidayDates,
    weekendDates,
    inactiveKeys,
    readonlyKeys,
  );

  const applyVacationAction = async (cellStatus: "vacation" | "away_working" | null) => {
    const selectableKeys = filterSelectableVacationKeys(
      selectedKeys,
      holidayDates,
      weekendDates,
      inactiveKeys,
      readonlyKeys,
    );
    const byEmployee = new Map<string, string[]>();
    for (const key of selectableKeys) {
      const parsed = parseCellKey(key);
      if (!parsed) {
        continue;
      }
      const dates = byEmployee.get(parsed.employeeId) ?? [];
      dates.push(parsed.dateIso);
      byEmployee.set(parsed.employeeId, dates);
    }
    if (byEmployee.size === 0) {
      return;
    }
    setSaving(true);
    setStatus(null);
    try {
      for (const [employeeId, dates] of byEmployee.entries()) {
        await updateVacationCells(employeeId, dates, cellStatus);
      }
      setSelectedKeys(new Set());
      await loadVacations();
    } catch (err) {
      setStatus(err instanceof Error ? err.message : "Failed to update vacation cells.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <StudioTwoColumnShell
      left={
        <VacationsLeftPanel
          selectionState={selectionState}
          saving={saving}
          canEditAll={vacationGrid.can_edit_all}
          hasLinkedEmployee={currentEmployeeId !== null}
          onRequestVacation={() => void applyVacationAction("vacation")}
          onSetAway={() => void applyVacationAction("away_working")}
          onCancelVacation={() => void applyVacationAction(null)}
          onCancelAway={() => void applyVacationAction(null)}
        />
      }
      right={
        <div className="imagegen-panel" style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column" }}>
          <h2 className="imagegen-panel-title">Vacation calendar</h2>
          {!loading ? (
            <MonthZoomWidget
              monthZoom={monthZoom}
              maxExpandedMonths={maxExpandedMonths}
              onMonthZoomChange={setMonthZoom}
            />
          ) : null}
          <div className="imagegen-panel-body" style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column" }}>
            {status ? (
              <p role="status" style={{ margin: "0 0 8px", color: "#fca5a5", fontSize: 13 }}>
                {status}
              </p>
            ) : null}
            {loading ? (
              <p style={{ margin: 0, color: "var(--muted, #94a3b8)" }}>Loading vacation data...</p>
            ) : (
              <VacationsGrid
                rangeFrom={vacationGrid.range.from}
                rangeTo={vacationGrid.range.to}
                employees={vacationGrid.employees}
                entries={vacationGrid.entries}
                holidays={vacationGrid.holidays}
                selectedKeys={selectedKeys}
                dragAnchor={dragAnchor}
                monthZoom={monthZoom}
                currentEmployeeId={currentEmployeeId}
                readonlyKeys={readonlyKeys}
                onSelectKeys={setSelectedKeys}
                onDragAnchor={setDragAnchor}
              />
            )}
          </div>
        </div>
      }
      rightStyle={{ minHeight: "min(75vh, 920px)" }}
    />
  );
}
