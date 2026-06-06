"use client";

import { useEffect, useMemo, useRef, type ReactElement } from "react";
import type { VacationEmployee, VacationEntry } from "../types";
import {
  buildDayColumns,
  dayColumnWidth,
  defaultScrollLeftPx,
  monthSpans,
  todayLineLeftPx,
  timelineWidthPx,
  VACATION_WEEK_DOW_COLORS,
  VACATION_HOLIDAY_CELL_COLOR,
  VACATION_WEEKEND_CELL_COLOR,
  VACATION_WEEKEND_CELL_SELECTED_COLOR,
} from "../vacationGrid";
import type { MonthZoom } from "../../planning/monthZoom";
import {
  cellKey,
  filterSelectableVacationKeys,
  selectionFromDrag,
  type VacationCellKey,
} from "../vacationSelection";

const STICKY_NAME_W = 180;
const ROW_H = 36;
const HEADER_H = 52;
const DAY_LETTER_ROW_H = 18;
const DAY_NUM_ROW_H = 24;

type Props = {
  rangeFrom: string;
  rangeTo: string;
  employees: VacationEmployee[];
  entries: VacationEntry[];
  holidays: string[];
  selectedKeys: Set<string>;
  dragAnchor: VacationCellKey | null;
  monthZoom: MonthZoom;
  onSelectKeys: (keys: Set<string>) => void;
  onDragAnchor: (anchor: VacationCellKey | null) => void;
};

function cellBackground(
  isHoliday: boolean,
  isInactive: boolean,
  isWeekend: boolean,
  status: "vacation" | "away_working" | undefined,
  isSelected: boolean,
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
    return "#1e293b";
  }
  if (isWeekend) {
    return isSelected ? VACATION_WEEKEND_CELL_SELECTED_COLOR : VACATION_WEEKEND_CELL_COLOR;
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
  onSelectKeys,
  onDragAnchor,
}: Props): ReactElement {
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const columns = useMemo(
    () => buildDayColumns(rangeFrom, rangeTo, monthZoom),
    [rangeFrom, rangeTo, monthZoom],
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
  const todayLeft = todayLineLeftPx(columns, STICKY_NAME_W);
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
    if (holidaySet.has(dateIso) || weekendDates.has(dateIso) || inactiveKeys.has(key)) {
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
    onSelectKeys(filterSelectableVacationKeys(dragged, holidaySet, weekendDates, inactiveKeys));
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", minHeight: 0, flex: 1 }}>
      <div
        ref={scrollRef}
        style={{ overflowX: "auto", overflowY: "auto", flex: 1, border: cellBorder, borderRadius: 10 }}
      >
        <div style={{ minWidth: STICKY_NAME_W + timelineWidth, position: "relative" }}>
          {todayLeft !== null ? (
            <div
              aria-hidden
              style={{
                position: "absolute",
                top: 0,
                bottom: 0,
                left: todayLeft,
                width: 2,
                background: "#f97316",
                zIndex: 5,
                pointerEvents: "none",
              }}
            />
          ) : null}

          <div style={{ display: "flex", height: HEADER_H, position: "sticky", top: 0, zIndex: 4 }}>
            <div
              style={{
                width: STICKY_NAME_W,
                minWidth: STICKY_NAME_W,
                position: "sticky",
                left: 0,
                zIndex: 6,
                background: "#111827",
                borderRight: cellBorder,
                borderBottom: cellBorder,
                display: "flex",
                alignItems: "flex-end",
                padding: "6px 8px",
                fontSize: 11,
                fontWeight: 600,
                color: "#94a3b8",
              }}
            >
              Name
            </div>
            <div style={{ display: "flex" }}>
              {monthGroups.map((group) => (
                <div
                  key={group.monthKey}
                  style={{
                    width: columns
                      .filter((c) => c.monthKey === group.monthKey)
                      .reduce((sum, c) => sum + dayColumnWidth(c), 0),
                    borderBottom: cellBorder,
                    borderRight: cellBorder,
                    textAlign: "center",
                    fontSize: 11,
                    fontWeight: 600,
                    color: "#cbd5e1",
                    paddingTop: 6,
                  }}
                >
                  {group.label}
                </div>
              ))}
            </div>
          </div>

          <div
            style={{
              display: "flex",
              height: DAY_LETTER_ROW_H,
              position: "sticky",
              top: HEADER_H,
              zIndex: 3,
              background: "#111827",
            }}
          >
            <div
              style={{
                width: STICKY_NAME_W,
                minWidth: STICKY_NAME_W,
                position: "sticky",
                left: 0,
                zIndex: 6,
                background: "#111827",
                borderRight: cellBorder,
                borderBottom: cellBorder,
              }}
            />
            <div style={{ display: "flex" }}>
              {columns.map((col) => (
                <div
                  key={`dow-${col.iso}`}
                  style={{
                    width: dayColumnWidth(col),
                    minWidth: dayColumnWidth(col),
                    borderRight: cellBorder,
                    borderBottom: cellBorder,
                    background: VACATION_WEEK_DOW_COLORS[col.weekStripe],
                    fontSize: 9,
                    fontWeight: 600,
                    color: col.isToday ? "#f97316" : "#e2e8f0",
                    textAlign: "center",
                    lineHeight: `${DAY_LETTER_ROW_H}px`,
                  }}
                  title={col.iso}
                >
                  {col.dayOfWeekLetter}
                </div>
              ))}
            </div>
          </div>

          <div
            style={{
              display: "flex",
              height: DAY_NUM_ROW_H,
              position: "sticky",
              top: HEADER_H + DAY_LETTER_ROW_H,
              zIndex: 3,
              background: "#111827",
            }}
          >
            <div
              style={{
                width: STICKY_NAME_W,
                minWidth: STICKY_NAME_W,
                position: "sticky",
                left: 0,
                zIndex: 6,
                background: "#111827",
                borderRight: cellBorder,
                borderBottom: cellBorder,
              }}
            />
            <div style={{ display: "flex" }}>
              {columns.map((col) => (
                <div
                  key={col.iso}
                  style={{
                    width: dayColumnWidth(col),
                    minWidth: dayColumnWidth(col),
                    borderRight: cellBorder,
                    borderBottom: cellBorder,
                    fontSize: 9,
                    color: col.isToday ? "#f97316" : "#64748b",
                    fontWeight: col.isToday ? 700 : 400,
                    textAlign: "center",
                    lineHeight: `${DAY_NUM_ROW_H}px`,
                  }}
                >
                  {col.dayOfMonth}
                </div>
              ))}
            </div>
          </div>

          {employees.length === 0 ? (
            <div style={{ padding: 16, color: "var(--muted, #94a3b8)", fontSize: 13 }}>
              No employees yet. Admins can add employees under Settings → Admin → Employees.
            </div>
          ) : (
            employees.map((employee) => (
              <div key={employee.id} style={{ display: "flex", height: ROW_H }}>
                <div
                  style={{
                    width: STICKY_NAME_W,
                    minWidth: STICKY_NAME_W,
                    position: "sticky",
                    left: 0,
                    zIndex: 2,
                    background: "#111827",
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
                          ),
                          cursor: isBlocked ? "not-allowed" : "cell",
                          boxSizing: "border-box",
                        }}
                      />
                    );
                  })}
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
