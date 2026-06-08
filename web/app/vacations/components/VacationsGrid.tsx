"use client";

import { useEffect, useMemo, type ReactElement } from "react";
import type { VacationEmployee, VacationEntry } from "../types";
import {
  buildDayColumns,
  dayColumnWidth,
  defaultScrollLeftPx,
  monthSpans,
  todayLineLeftPx,
  timelineWidthPx,
  VACATION_HOLIDAY_CELL_COLOR,
  VACATION_WEEKEND_CELL_COLOR,
  VACATION_WEEKEND_CELL_SELECTED_COLOR,
} from "../vacationGrid";
import { useTimelineViewportWidth } from "../../planning/useTimelineViewportWidth";
import {
  VACATION_STICKY_NAME_W,
  VacationCalendarHeader,
} from "./VacationCalendarHeader";
import type { MonthZoom } from "../../planning/monthZoom";
import {
  cellKey,
  filterSelectableVacationKeys,
  selectionFromDrag,
  type VacationCellKey,
} from "../vacationSelection";

const ROW_H = 36;
const CURRENT_USER_NAME_BG = "#1e3a5f";
const CURRENT_USER_EMPTY_CELL_BG = "#172554";
const CURRENT_USER_WEEKEND_CELL_BG = "#1e293b";
const CURRENT_USER_INACTIVE_CELL_BG = "#243044";
const CURRENT_USER_ROW_ACCENT = "#3b82f6";
const CURRENT_USER_ROW_BG = "rgba(59, 130, 246, 0.07)";
type Props = {
  rangeFrom: string;
  rangeTo: string;
  employees: VacationEmployee[];
  entries: VacationEntry[];
  holidays: string[];
  selectedKeys: Set<string>;
  dragAnchor: VacationCellKey | null;
  monthZoom: MonthZoom;
  currentEmployeeId: string | null;
  readonlyKeys: Set<string>;
  onSelectKeys: (keys: Set<string>) => void;
  onDragAnchor: (anchor: VacationCellKey | null) => void;
};

function cellBackground(
  isHoliday: boolean,
  isInactive: boolean,
  isWeekend: boolean,
  status: "vacation" | "away_working" | undefined,
  isSelected: boolean,
  isCurrentUserRow: boolean,
): string {
  if (status === "vacation") {
    return isSelected ? "#dc2626" : "#ef4444";
  }
  if (status === "away_working") {
    return isSelected ? "#ca8a04" : "#eab308";
  }
  if (isHoliday) {
    return VACATION_HOLIDAY_CELL_COLOR;
  }
  if (isInactive) {
    return isCurrentUserRow ? CURRENT_USER_INACTIVE_CELL_BG : "#1e293b";
  }
  if (isWeekend) {
    if (isCurrentUserRow) {
      return isSelected ? VACATION_WEEKEND_CELL_SELECTED_COLOR : CURRENT_USER_WEEKEND_CELL_BG;
    }
    return isSelected ? VACATION_WEEKEND_CELL_SELECTED_COLOR : VACATION_WEEKEND_CELL_COLOR;
  }
  if (isCurrentUserRow) {
    return isSelected ? "#334155" : CURRENT_USER_EMPTY_CELL_BG;
  }
  return isSelected ? "#334155" : "#0f172a";
}

export function VacationsGrid({
  rangeFrom,
  rangeTo,
  employees,
  entries,
  holidays,
  selectedKeys,
  dragAnchor,
  monthZoom,
  currentEmployeeId,
  readonlyKeys,
  onSelectKeys,
  onDragAnchor,
}: Props): ReactElement {
  const { scrollRef, viewportWidth } = useTimelineViewportWidth();
  const columns = useMemo(
    () =>
      buildDayColumns(
        rangeFrom,
        rangeTo,
        monthZoom,
        viewportWidth,
        VACATION_STICKY_NAME_W,
      ),
    [rangeFrom, rangeTo, monthZoom, viewportWidth],
  );
  const monthGroups = useMemo(() => monthSpans(columns), [columns]);
  const holidaySet = useMemo(() => new Set(holidays), [holidays]);
  const weekendDates = useMemo(
    () => new Set(columns.filter((column) => column.isWeekend).map((column) => column.iso)),
    [columns],
  );
  const dateOrder = useMemo(() => columns.map((c) => c.iso), [columns]);
  const employeeOrder = useMemo(() => employees.map((e) => e.id), [employees]);

  const entryMap = useMemo(() => {
    const map = new Map<string, "vacation" | "away_working">();
    for (const entry of entries) {
      map.set(cellKey(entry.employee_id, entry.day_date), entry.status);
    }
    return map;
  }, [entries]);

  const inactiveKeys = useMemo(() => {
    const set = new Set<string>();
    for (const employee of employees) {
      for (const col of columns) {
        if (col.iso < employee.start_date) {
          set.add(cellKey(employee.id, col.iso));
        }
      }
    }
    return set;
  }, [employees, columns]);

  const timelineWidth = timelineWidthPx(columns);
  const todayLeft = todayLineLeftPx(columns, VACATION_STICKY_NAME_W);
  const cellBorder = "1px solid #2a2f3a";

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) {
      return;
    }
    el.scrollLeft = defaultScrollLeftPx(columns);
  }, [columns]);

  useEffect(() => {
    const stopDrag = () => {
      onDragAnchor(null);
    };
    window.addEventListener("mouseup", stopDrag);
    return () => window.removeEventListener("mouseup", stopDrag);
  }, [onDragAnchor]);

  const handleCellMouseDown = (employeeId: string, dateIso: string) => {
    const key = cellKey(employeeId, dateIso);
    if (
      holidaySet.has(dateIso) ||
      weekendDates.has(dateIso) ||
      inactiveKeys.has(key) ||
      readonlyKeys.has(key)
    ) {
      return;
    }
    const anchor = { employeeId, dateIso };
    onDragAnchor(anchor);
    onSelectKeys(new Set([key]));
  };

  const handleCellMouseEnter = (employeeId: string, dateIso: string) => {
    if (!dragAnchor) {
      return;
    }
    const current = { employeeId, dateIso };
    const dragged = selectionFromDrag(dragAnchor, current, employeeOrder, dateOrder);
    onSelectKeys(
      filterSelectableVacationKeys(dragged, holidaySet, weekendDates, inactiveKeys, readonlyKeys),
    );
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", minHeight: 0, flex: 1 }}>
      <div
        ref={scrollRef}
        style={{ overflowX: "auto", overflowY: "auto", flex: 1, border: cellBorder, borderRadius: 10 }}
      >
        <div style={{ minWidth: VACATION_STICKY_NAME_W + timelineWidth, position: "relative" }}>
          <VacationCalendarHeader
            columns={columns}
            monthGroups={monthGroups}
            timelineWidth={timelineWidth}
            todayLineLeft={todayLeft}
          />

          {employees.length === 0 ? (
            <div style={{ padding: 16, color: "var(--muted, #94a3b8)", fontSize: 13 }}>
              No employees yet. Admins can add employees under Settings → Admin → Employees.
            </div>
          ) : (
            employees.map((employee) => {
              const isCurrentUserRow =
                currentEmployeeId !== null && employee.id === currentEmployeeId;
              return (
              <div
                key={employee.id}
                style={{
                  display: "flex",
                  height: ROW_H,
                  background: isCurrentUserRow ? CURRENT_USER_ROW_BG : undefined,
                  boxShadow: isCurrentUserRow ? "inset 3px 0 0 0 #3b82f6" : undefined,
                }}
              >
                <div
                  style={{
                    width: VACATION_STICKY_NAME_W,
                    minWidth: VACATION_STICKY_NAME_W,
                    position: "sticky",
                    left: 0,
                    zIndex: 2,
                    background: isCurrentUserRow ? CURRENT_USER_NAME_BG : "#111827",
                    borderLeft: isCurrentUserRow ? `3px solid ${CURRENT_USER_ROW_ACCENT}` : undefined,
                    borderRight: cellBorder,
                    borderBottom: cellBorder,
                    padding: "0 8px",
                    display: "flex",
                    flexDirection: "column",
                    justifyContent: "center",
                    fontSize: 12,
                    color: "#f1f5f9",
                  }}
                >
                  <div style={{ fontWeight: 600 }}>{employee.name}</div>
                  {employee.title ? (
                    <div style={{ fontSize: 10, color: "#94a3b8" }}>{employee.title}</div>
                  ) : null}
                </div>
                <div style={{ display: "flex" }}>
                  {columns.map((col) => {
                    const key = cellKey(employee.id, col.iso);
                    const isHoliday = holidaySet.has(col.iso);
                    const isWeekend = col.isWeekend;
                    const isInactive = inactiveKeys.has(key);
                    const isBlocked = isHoliday || isWeekend || isInactive;
                    const status = entryMap.get(key);
                    const isSelected = selectedKeys.has(key);
                    return (
                      <div
                        key={key}
                        role="gridcell"
                        aria-selected={isSelected}
                        onMouseDown={() => handleCellMouseDown(employee.id, col.iso)}
                        onMouseEnter={() => handleCellMouseEnter(employee.id, col.iso)}
                        style={{
                          width: dayColumnWidth(col),
                          minWidth: dayColumnWidth(col),
                          height: ROW_H,
                          borderRight: cellBorder,
                          borderBottom: cellBorder,
                          background: cellBackground(
                            isHoliday,
                            isInactive,
                            isWeekend,
                            status,
                            isSelected,
                            isCurrentUserRow,
                          ),
                          cursor: isBlocked || readonlyKeys.has(key) ? "not-allowed" : "cell",
                          boxSizing: "border-box",
                        }}
                      />
                    );
                  })}
                </div>
              </div>
            );
            })
          )}
        </div>
      </div>
    </div>
  );
}
