export type VacationCellKey = {
  employeeId: string;
  dateIso: string;
};

export function cellKey(employeeId: string, dateIso: string): string {
  return `${employeeId}|${dateIso}`;
}

export function parseCellKey(key: string): VacationCellKey | null {
  const idx = key.indexOf("|");
  if (idx <= 0) {
    return null;
  }
  return {
    employeeId: key.slice(0, idx),
    dateIso: key.slice(idx + 1),
  };
}

export function selectionFromDrag(
  anchor: VacationCellKey,
  current: VacationCellKey,
  employeeOrder: string[],
  dateOrder: string[],
): Set<string> {
  const empStart = employeeOrder.indexOf(anchor.employeeId);
  const empEnd = employeeOrder.indexOf(current.employeeId);
  const dateStart = dateOrder.indexOf(anchor.dateIso);
  const dateEnd = dateOrder.indexOf(current.dateIso);
  if (empStart < 0 || empEnd < 0 || dateStart < 0 || dateEnd < 0) {
    return new Set([cellKey(anchor.employeeId, anchor.dateIso)]);
  }
  const empMin = Math.min(empStart, empEnd);
  const empMax = Math.max(empStart, empEnd);
  const dateMin = Math.min(dateStart, dateEnd);
  const dateMax = Math.max(dateStart, dateEnd);
  const selected = new Set<string>();
  for (let e = empMin; e <= empMax; e += 1) {
    for (let d = dateMin; d <= dateMax; d += 1) {
      selected.add(cellKey(employeeOrder[e], dateOrder[d]));
    }
  }
  return selected;
}

export type SelectionActionState =
  | "none"
  | "available"
  | "vacation"
  | "away"
  | "holiday"
  | "mixed"
  | "inactive";

export function aggregateSelectionState(
  selectedKeys: Set<string>,
  entryStatusByKey: Map<string, "vacation" | "away_working">,
  holidayDates: Set<string>,
  inactiveKeys: Set<string>,
): SelectionActionState {
  if (selectedKeys.size === 0) {
    return "none";
  }
  let hasHoliday = false;
  let hasInactive = false;
  let hasVacation = false;
  let hasAway = false;
  let hasWhite = false;
  for (const key of selectedKeys) {
    const parsed = parseCellKey(key);
    if (!parsed) {
      continue;
    }
    if (inactiveKeys.has(key)) {
      hasInactive = true;
      continue;
    }
    if (holidayDates.has(parsed.dateIso)) {
      hasHoliday = true;
      continue;
    }
    const status = entryStatusByKey.get(key);
    if (status === "vacation") {
      hasVacation = true;
    } else if (status === "away_working") {
      hasAway = true;
    } else {
      hasWhite = true;
    }
  }
  if (hasHoliday) {
    return "holiday";
  }
  if (hasInactive) {
    return "inactive";
  }
  const kinds = [hasVacation, hasAway, hasWhite].filter(Boolean).length;
  if (kinds > 1) {
    return "mixed";
  }
  if (hasVacation) {
    return "vacation";
  }
  if (hasAway) {
    return "away";
  }
  return "available";
}
