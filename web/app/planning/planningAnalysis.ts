import { splitOwners } from "./milestoneDetail";
import {
  computeMilestoneStartWeeks,
  currentPlanWeekIndex,
  milestoneDeliveryDateIso,
} from "./planningTimeline";
import type {
  MilestoneRisk,
  MilestoneStatus,
  PlanningDeliverable,
  PlanningGraph,
  PlanningMilestone,
} from "./types";
import type { VacationEmployee, VacationEntry } from "../vacations/types";

export type PlanningAnalysisVacationContext = {
  employees: VacationEmployee[];
  entries: VacationEntry[];
  holidays: string[];
};

export type AnalysisSeverity = "on_track" | "caution" | "risk";

export type AnalysisIssueKind =
  | "overdue"
  | "due_soon"
  | "missing_due_date"
  | "schedule_overdue"
  | "behind_pace"
  | "workload"
  | "unassigned"
  | "stale_risk";

export type MilestoneAnalysisRow = {
  milestoneId: string;
  milestoneName: string;
  deliveryDateIso: string;
  scheduleSeverity: AnalysisSeverity;
  paceSeverity: AnalysisSeverity;
  deliverablesSeverity: AnalysisSeverity;
  manualRisk: MilestoneRisk;
  elapsedPct: number;
  donePct: number;
  openDeliverableCount: number;
  overdueDeliverableCount: number;
  scheduleDetail: string;
  paceDetail: string;
  deliverablesDetail: string;
};

export type DeliverableAnalysisRow = {
  deliverableId: string;
  milestoneId: string;
  milestoneName: string;
  title: string;
  owner: string;
  dueDateIso: string | null;
  status: MilestoneStatus;
  manualRisk: MilestoneRisk;
  computedSeverity: AnalysisSeverity;
  daysUntilDue: number | null;
  issues: AnalysisIssueKind[];
  detail: string;
};

export type OwnerWorkloadRow = {
  ownerLabel: string;
  openCount: number;
  density: number;
  weeksLeft: number;
  effectiveWeeksLeft: number;
  vacationDays: number;
  awayDays: number;
  holidayDays: number;
  nearestDueIso: string | null;
  severity: AnalysisSeverity;
  detail: string;
};

export type AnalysisFinding = {
  id: string;
  severity: AnalysisSeverity;
  itemLabel: string;
  issueLabel: string;
  detail: string;
  milestoneId: string | null;
  deliverableId: string | null;
  ownerLabel: string | null;
};

export type PlanningAnalysisSummary = {
  overdueDeliverables: number;
  atRiskMilestones: number;
  overloadedOwners: number;
  onTrackPct: number;
};

export type PlanningAnalysisResult = {
  generatedAt: string;
  summary: PlanningAnalysisSummary;
  milestones: MilestoneAnalysisRow[];
  deliverables: DeliverableAnalysisRow[];
  owners: OwnerWorkloadRow[];
  findings: AnalysisFinding[];
};

const DONE_STATUSES: ReadonlySet<MilestoneStatus> = new Set(["ready", "completed"]);
const SEVERITY_RANK: Record<AnalysisSeverity, number> = {
  on_track: 0,
  caution: 1,
  risk: 2,
};

function parseIsoDate(iso: string): Date {
  return new Date(`${iso}T00:00:00`);
}

function todayMidnight(reference: Date): Date {
  return new Date(reference.getFullYear(), reference.getMonth(), reference.getDate());
}

function daysBetween(from: Date, to: Date): number {
  const msPerDay = 24 * 60 * 60 * 1000;
  return Math.round((to.getTime() - from.getTime()) / msPerDay);
}

function formatIsoDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function dateInInclusiveRange(date: Date, from: Date, to: Date): boolean {
  return date.getTime() >= from.getTime() && date.getTime() <= to.getTime();
}

export function computeAnalysisVacationRange(
  graph: PlanningGraph,
  planStart: string,
  referenceDate: Date = new Date(),
): { fromIso: string; toIso: string } {
  const today = todayMidnight(referenceDate);
  let maxDate = today;
  const startWeeks = computeMilestoneStartWeeks(graph.milestones);

  for (const milestone of graph.milestones) {
    const startWeek = startWeeks.get(milestone.id) ?? 0;
    const deliveryDate = parseIsoDate(
      milestoneDeliveryDateIso(planStart, startWeek, milestone.duration_weeks),
    );
    if (deliveryDate > maxDate) {
      maxDate = deliveryDate;
    }
  }

  for (const deliverable of graph.deliverables) {
    if (!deliverable.due_date) {
      continue;
    }
    const dueDate = parseIsoDate(deliverable.due_date);
    if (dueDate > maxDate) {
      maxDate = dueDate;
    }
  }

  return {
    fromIso: formatIsoDate(today),
    toIso: formatIsoDate(maxDate),
  };
}

type UnavailableDays = {
  vacationDays: number;
  awayDays: number;
  holidayDays: number;
};

export function countEmployeeUnavailableDays(
  employee: VacationEmployee,
  fromDate: Date,
  toDate: Date,
  entries: VacationEntry[],
  holidays: string[],
): UnavailableDays {
  const employeeStart = parseIsoDate(employee.start_date);
  const vacationDates = new Set<string>();
  let vacationDays = 0;
  let awayDays = 0;

  for (const entry of entries) {
    if (entry.employee_id !== employee.id) {
      continue;
    }
    const day = parseIsoDate(entry.day_date);
    if (!dateInInclusiveRange(day, fromDate, toDate) || day < employeeStart) {
      continue;
    }
    if (entry.status === "vacation") {
      vacationDays += 1;
      vacationDates.add(entry.day_date);
    } else if (entry.status === "away_working") {
      awayDays += 1;
    }
  }

  let holidayDays = 0;
  for (const holidayIso of holidays) {
    if (vacationDates.has(holidayIso)) {
      continue;
    }
    const holiday = parseIsoDate(holidayIso);
    if (dateInInclusiveRange(holiday, fromDate, toDate) && holiday >= employeeStart) {
      holidayDays += 1;
    }
  }

  return { vacationDays, awayDays, holidayDays };
}

function findEmployeeByName(
  ownerName: string,
  employees: VacationEmployee[],
): VacationEmployee | null {
  const normalized = ownerName.trim().toLowerCase();
  if (!normalized) {
    return null;
  }
  return employees.find((employee) => employee.name.trim().toLowerCase() === normalized) ?? null;
}

function effectiveWeeksLeft(
  calendarDaysLeft: number,
  unavailable: UnavailableDays,
): number {
  const unavailableDays =
    unavailable.vacationDays + unavailable.holidayDays + unavailable.awayDays * 0.5;
  const effectiveDays = Math.max(0, calendarDaysLeft - unavailableDays);
  return Math.max(0.5, effectiveDays / 7);
}

function isDoneStatus(status: MilestoneStatus): boolean {
  return DONE_STATUSES.has(status);
}

function maxSeverity(a: AnalysisSeverity, b: AnalysisSeverity): AnalysisSeverity {
  return SEVERITY_RANK[a] >= SEVERITY_RANK[b] ? a : b;
}

function severityFromPaceGap(gap: number): AnalysisSeverity {
  if (gap > 0.4) {
    return "risk";
  }
  if (gap > 0.25) {
    return "caution";
  }
  return "on_track";
}

function severityFromDensity(density: number): AnalysisSeverity {
  if (density >= 3) {
    return "risk";
  }
  if (density >= 2) {
    return "caution";
  }
  return "on_track";
}

function deliverableComputedSeverity(issues: AnalysisIssueKind[]): AnalysisSeverity {
  let severity: AnalysisSeverity = "on_track";
  for (const issue of issues) {
    if (issue === "overdue" || issue === "stale_risk") {
      severity = maxSeverity(severity, "risk");
    } else if (
      issue === "due_soon" ||
      issue === "missing_due_date" ||
      issue === "unassigned"
    ) {
      severity = maxSeverity(severity, "caution");
    }
  }
  return severity;
}

function milestoneDeliverablesSeverity(
  overdueCount: number,
  dueSoonCount: number,
  missingDueCount: number,
): AnalysisSeverity {
  let severity: AnalysisSeverity = "on_track";
  if (overdueCount > 0) {
    severity = maxSeverity(severity, "risk");
  }
  if (dueSoonCount > 0 || missingDueCount > 0) {
    severity = maxSeverity(severity, "caution");
  }
  return severity;
}

function issueLabel(kind: AnalysisIssueKind): string {
  switch (kind) {
    case "overdue":
      return "Overdue";
    case "due_soon":
      return "Due soon";
    case "missing_due_date":
      return "Missing due date";
    case "schedule_overdue":
      return "Schedule overdue";
    case "behind_pace":
      return "Behind pace";
    case "workload":
      return "Workload";
    case "unassigned":
      return "Unassigned";
    case "stale_risk":
      return "Stale risk";
    default:
      return "Issue";
  }
}

function sortFindings(findings: AnalysisFinding[]): AnalysisFinding[] {
  return [...findings].sort((a, b) => {
    const severityDiff = SEVERITY_RANK[b.severity] - SEVERITY_RANK[a.severity];
    if (severityDiff !== 0) {
      return severityDiff;
    }
    return a.itemLabel.localeCompare(b.itemLabel);
  });
}

function analyzeDeliverable(
  deliverable: PlanningDeliverable,
  milestone: PlanningMilestone,
  milestoneDeliveryIso: string,
  today: Date,
): DeliverableAnalysisRow {
  const issues: AnalysisIssueKind[] = [];
  const todayDate = todayMidnight(today);
  let daysUntilDue: number | null = null;
  let detail = "On track";

  if (!isDoneStatus(deliverable.status)) {
    if (deliverable.due_date) {
      const dueDate = parseIsoDate(deliverable.due_date);
      daysUntilDue = daysBetween(todayDate, dueDate);
      if (daysUntilDue < 0) {
        issues.push("overdue");
        detail = `${Math.abs(daysUntilDue)} days past due, still ${deliverable.status.replace("_", " ")}`;
      } else if (daysUntilDue <= 7 && (deliverable.status === "todo" || deliverable.status === "in_progress")) {
        issues.push("due_soon");
        detail = `Due in ${daysUntilDue} days, still ${deliverable.status.replace("_", " ")}`;
      }
    } else {
      const deliveryDate = parseIsoDate(milestoneDeliveryIso);
      const daysToMilestoneEnd = daysBetween(todayDate, deliveryDate);
      if (daysToMilestoneEnd <= 14) {
        issues.push("missing_due_date");
        detail = `No due date; milestone ends in ${Math.max(0, daysToMilestoneEnd)} days`;
      }
    }

    if (!deliverable.owner.trim()) {
      issues.push("unassigned");
      if (detail === "On track") {
        detail = "Open deliverable has no owner";
      }
    }
  }

  let computedSeverity = deliverableComputedSeverity(issues);
  const manualRisk = deliverable.risk ?? milestone.risk;
  if (manualRisk === "on_track" && computedSeverity === "risk") {
    issues.push("stale_risk");
    computedSeverity = "risk";
    detail = `${detail}; manual risk still on track`;
  }

  return {
    deliverableId: deliverable.id,
    milestoneId: milestone.id,
    milestoneName: milestone.name,
    title: deliverable.title,
    owner: deliverable.owner,
    dueDateIso: deliverable.due_date,
    status: deliverable.status,
    manualRisk,
    computedSeverity,
    daysUntilDue,
    issues,
    detail,
  };
}

function analyzeMilestone(
  milestone: PlanningMilestone,
  startWeek: number,
  planStart: string,
  deliverableRows: DeliverableAnalysisRow[],
  currentWeek: number | null,
  today: Date,
): MilestoneAnalysisRow {
  const deliveryDateIso = milestoneDeliveryDateIso(planStart, startWeek, milestone.duration_weeks);
  const milestoneDeliverables = deliverableRows.filter((row) => row.milestoneId === milestone.id);
  const totalDeliverables = milestoneDeliverables.length;
  const doneCount = milestoneDeliverables.filter((row) => isDoneStatus(row.status)).length;
  const overdueCount = milestoneDeliverables.filter((row) => row.issues.includes("overdue")).length;
  const dueSoonCount = milestoneDeliverables.filter((row) => row.issues.includes("due_soon")).length;
  const missingDueCount = milestoneDeliverables.filter((row) => row.issues.includes("missing_due_date")).length;
  const openDeliverableCount = totalDeliverables - doneCount;
  const allDeliverablesDone = totalDeliverables > 0 && doneCount === totalDeliverables;

  let scheduleSeverity: AnalysisSeverity = "on_track";
  let scheduleDetail = "On schedule";
  const todayDate = todayMidnight(today);
  const deliveryDate = parseIsoDate(deliveryDateIso);
  if (allDeliverablesDone) {
    scheduleDetail = "All deliverables complete";
  } else if (milestone.status !== "completed" && todayDate > deliveryDate) {
    scheduleSeverity = "risk";
    const daysLate = daysBetween(deliveryDate, todayDate);
    scheduleDetail = `Delivery date passed ${daysLate} days ago`;
  }

  let elapsedPct = 0;
  let donePct = totalDeliverables > 0 ? doneCount / totalDeliverables : 1;
  let paceSeverity: AnalysisSeverity = "on_track";
  let paceDetail = "Pace matches plan";

  if (allDeliverablesDone) {
    elapsedPct = 1;
    paceDetail = "All deliverables complete";
  } else if (currentWeek !== null) {
    const endWeek = startWeek + Math.max(1, milestone.duration_weeks);
    if (currentWeek >= startWeek && currentWeek < endWeek && milestone.status !== "completed") {
      elapsedPct = Math.min(1, (currentWeek - startWeek) / Math.max(1, milestone.duration_weeks));
      const paceGap = elapsedPct - donePct;
      paceSeverity = severityFromPaceGap(paceGap);
      if (paceSeverity !== "on_track") {
        const gapPct = Math.round(paceGap * 100);
        paceDetail = `${gapPct}% behind deliverable completion pace`;
      }
    } else if (currentWeek >= endWeek && milestone.status !== "completed" && totalDeliverables > 0) {
      elapsedPct = 1;
      const paceGap = 1 - donePct;
      paceSeverity = severityFromPaceGap(paceGap);
      paceDetail =
        paceSeverity === "on_track"
          ? "Milestone window ended"
          : `${Math.round(paceGap * 100)}% deliverables still open after window`;
    }
  }

  const deliverablesSeverity = milestoneDeliverablesSeverity(overdueCount, dueSoonCount, missingDueCount);
  const deliverablesDetail =
    overdueCount > 0
      ? `${overdueCount} overdue deliverable${overdueCount === 1 ? "" : "s"}`
      : dueSoonCount > 0
        ? `${dueSoonCount} due within 7 days`
        : missingDueCount > 0
          ? `${missingDueCount} missing due date${missingDueCount === 1 ? "" : "s"}`
          : "Deliverables on track";

  return {
    milestoneId: milestone.id,
    milestoneName: milestone.name,
    deliveryDateIso,
    scheduleSeverity,
    paceSeverity,
    deliverablesSeverity,
    manualRisk: milestone.risk,
    elapsedPct,
    donePct,
    openDeliverableCount,
    overdueDeliverableCount: overdueCount,
    scheduleDetail,
    paceDetail,
    deliverablesDetail,
  };
}

function buildOwnerWorkloadDetail(
  openCount: number,
  density: number,
  weeksLeft: number,
  effectiveWeeks: number,
  unavailable: UnavailableDays,
  vacationsApplied: boolean,
): string {
  const unavailableTotal =
    unavailable.vacationDays + unavailable.awayDays + unavailable.holidayDays;
  let detail = `${openCount} open items, ${density.toFixed(1)} items/week, ${weeksLeft.toFixed(1)} calendar weeks left`;
  if (vacationsApplied && unavailableTotal > 0) {
    detail += ` (${effectiveWeeks.toFixed(1)} effective weeks after ${unavailable.vacationDays} vacation, ${unavailable.awayDays} away, ${unavailable.holidayDays} holiday days)`;
  } else if (vacationsApplied) {
    detail += ` (${effectiveWeeks.toFixed(1)} effective weeks)`;
  }
  return detail;
}

function analyzeOwners(
  deliverableRows: DeliverableAnalysisRow[],
  milestonesById: Map<string, PlanningMilestone>,
  startWeeks: Map<string, number>,
  planStart: string,
  referenceDate: Date,
  vacations?: PlanningAnalysisVacationContext,
): OwnerWorkloadRow[] {
  const openRows = deliverableRows.filter((row) => !isDoneStatus(row.status));
  const ownerMap = new Map<string, DeliverableAnalysisRow[]>();
  const ownerLabels = new Map<string, string>();

  for (const row of openRows) {
    const owners = splitOwners(row.owner);
    if (owners.length === 0) {
      const bucket = ownerMap.get("__unassigned__") ?? [];
      bucket.push(row);
      ownerMap.set("__unassigned__", bucket);
      ownerLabels.set("__unassigned__", "Unassigned");
      continue;
    }
    for (const owner of owners) {
      const key = owner.toLowerCase();
      const bucket = ownerMap.get(key) ?? [];
      bucket.push(row);
      ownerMap.set(key, bucket);
      if (!ownerLabels.has(key)) {
        ownerLabels.set(key, owner);
      }
    }
  }

  const rows: OwnerWorkloadRow[] = [];
  for (const [key, items] of ownerMap.entries()) {
    const displayName = ownerLabels.get(key) ?? key;
    let nearestDueIso: string | null = null;
    let nearestDueDate: Date | null = null;

    for (const item of items) {
      let candidateIso = item.dueDateIso;
      if (!candidateIso) {
        const milestone = milestonesById.get(item.milestoneId);
        if (milestone) {
          const startWeek = startWeeks.get(milestone.id) ?? 0;
          candidateIso = milestoneDeliveryDateIso(planStart, startWeek, milestone.duration_weeks);
        }
      }
      if (!candidateIso) {
        continue;
      }
      const candidateDate = parseIsoDate(candidateIso);
      if (!nearestDueDate || candidateDate < nearestDueDate) {
        nearestDueDate = candidateDate;
        nearestDueIso = candidateIso;
      }
    }

    const todayDate = todayMidnight(referenceDate);
    const daysLeft = nearestDueDate ? Math.max(0, daysBetween(todayDate, nearestDueDate)) : 0;
    const weeksLeft = Math.max(0.5, daysLeft / 7);

    let unavailable: UnavailableDays = { vacationDays: 0, awayDays: 0, holidayDays: 0 };
    let vacationsApplied = false;
    if (key !== "__unassigned__" && vacations && nearestDueDate) {
      const employee = findEmployeeByName(displayName, vacations.employees);
      if (employee) {
        unavailable = countEmployeeUnavailableDays(
          employee,
          todayDate,
          nearestDueDate,
          vacations.entries,
          vacations.holidays,
        );
        vacationsApplied = true;
      }
    }

    const effectiveWeeks = effectiveWeeksLeft(daysLeft, unavailable);
    const density = items.length / effectiveWeeks;
    const severity =
      key === "__unassigned__" ? (items.length > 0 ? "caution" : "on_track") : severityFromDensity(density);

    rows.push({
      ownerLabel: displayName,
      openCount: items.length,
      density,
      weeksLeft,
      effectiveWeeksLeft: effectiveWeeks,
      vacationDays: unavailable.vacationDays,
      awayDays: unavailable.awayDays,
      holidayDays: unavailable.holidayDays,
      nearestDueIso,
      severity,
      detail:
        key === "__unassigned__"
          ? `${items.length} open deliverable${items.length === 1 ? "" : "s"} without owner`
          : buildOwnerWorkloadDetail(
              items.length,
              density,
              weeksLeft,
              effectiveWeeks,
              unavailable,
              vacationsApplied,
            ),
    });
  }

  return rows.sort((a, b) => SEVERITY_RANK[b.severity] - SEVERITY_RANK[a.severity] || b.openCount - a.openCount);
}

function buildFindings(
  milestoneRows: MilestoneAnalysisRow[],
  deliverableRows: DeliverableAnalysisRow[],
  ownerRows: OwnerWorkloadRow[],
): AnalysisFinding[] {
  const findings: AnalysisFinding[] = [];

  for (const row of deliverableRows) {
    for (const issue of row.issues) {
      findings.push({
        id: `deliverable-${row.deliverableId}-${issue}`,
        severity: issue === "overdue" || issue === "stale_risk" ? "risk" : "caution",
        itemLabel: `${row.milestoneName} / ${row.title}`,
        issueLabel: issueLabel(issue),
        detail: row.detail,
        milestoneId: row.milestoneId,
        deliverableId: row.deliverableId,
        ownerLabel: row.owner.trim() || null,
      });
    }
  }

  for (const row of milestoneRows) {
    if (row.scheduleSeverity !== "on_track") {
      findings.push({
        id: `milestone-${row.milestoneId}-schedule`,
        severity: row.scheduleSeverity,
        itemLabel: row.milestoneName,
        issueLabel: "Schedule overdue",
        detail: row.scheduleDetail,
        milestoneId: row.milestoneId,
        deliverableId: null,
        ownerLabel: null,
      });
    }
    if (row.paceSeverity !== "on_track") {
      findings.push({
        id: `milestone-${row.milestoneId}-pace`,
        severity: row.paceSeverity,
        itemLabel: row.milestoneName,
        issueLabel: "Behind pace",
        detail: row.paceDetail,
        milestoneId: row.milestoneId,
        deliverableId: null,
        ownerLabel: null,
      });
    }
  }

  for (const row of ownerRows) {
    if (row.severity === "on_track") {
      continue;
    }
    findings.push({
      id: `owner-${row.ownerLabel}`,
      severity: row.severity,
      itemLabel: row.ownerLabel,
      issueLabel: row.ownerLabel === "Unassigned" ? "Unassigned" : "Workload",
      detail: row.detail,
      milestoneId: null,
      deliverableId: null,
      ownerLabel: row.ownerLabel,
    });
  }

  return sortFindings(findings);
}

function buildSummary(
  deliverableRows: DeliverableAnalysisRow[],
  milestoneRows: MilestoneAnalysisRow[],
  ownerRows: OwnerWorkloadRow[],
): PlanningAnalysisSummary {
  const overdueDeliverables = deliverableRows.filter((row) => row.issues.includes("overdue")).length;
  const atRiskMilestones = milestoneRows.filter(
    (row) =>
      maxSeverity(row.scheduleSeverity, maxSeverity(row.paceSeverity, row.deliverablesSeverity)) !== "on_track",
  ).length;
  const overloadedOwners = ownerRows.filter(
    (row) => row.severity !== "on_track" && row.ownerLabel !== "Unassigned",
  ).length;

  const scoredItems = [
    ...deliverableRows.map((row) => row.computedSeverity),
    ...milestoneRows.map((row) =>
      maxSeverity(row.scheduleSeverity, maxSeverity(row.paceSeverity, row.deliverablesSeverity)),
    ),
  ];
  const onTrackCount = scoredItems.filter((severity) => severity === "on_track").length;
  const onTrackPct = scoredItems.length > 0 ? Math.round((onTrackCount / scoredItems.length) * 100) : 100;

  return {
    overdueDeliverables,
    atRiskMilestones,
    overloadedOwners,
    onTrackPct,
  };
}

export function analyzePlanning(
  graph: PlanningGraph,
  planStart: string,
  referenceDate: Date = new Date(),
  vacations?: PlanningAnalysisVacationContext,
): PlanningAnalysisResult {
  const orderedMilestones = [...graph.milestones].sort((a, b) => a.order_index - b.order_index);
  const startWeeks = computeMilestoneStartWeeks(graph.milestones);
  const milestonesById = new Map(orderedMilestones.map((milestone) => [milestone.id, milestone]));
  const currentWeek = currentPlanWeekIndex(planStart, referenceDate);

  const deliverableRows: DeliverableAnalysisRow[] = [];
  for (const deliverable of graph.deliverables) {
    const milestone = milestonesById.get(deliverable.milestone_id);
    if (!milestone) {
      continue;
    }
    const startWeek = startWeeks.get(milestone.id) ?? 0;
    const deliveryIso = milestoneDeliveryDateIso(planStart, startWeek, milestone.duration_weeks);
    deliverableRows.push(analyzeDeliverable(deliverable, milestone, deliveryIso, referenceDate));
  }

  const milestoneRows = orderedMilestones.map((milestone) =>
    analyzeMilestone(
      milestone,
      startWeeks.get(milestone.id) ?? 0,
      planStart,
      deliverableRows,
      currentWeek,
      referenceDate,
    ),
  );

  const ownerRows = analyzeOwners(
    deliverableRows,
    milestonesById,
    startWeeks,
    planStart,
    referenceDate,
    vacations,
  );
  const findings = buildFindings(milestoneRows, deliverableRows, ownerRows);
  const summary = buildSummary(deliverableRows, milestoneRows, ownerRows);

  return {
    generatedAt: referenceDate.toISOString(),
    summary,
    milestones: milestoneRows,
    deliverables: deliverableRows,
    owners: ownerRows,
    findings,
  };
}

export function milestoneAnalyzedSeverity(row: MilestoneAnalysisRow): AnalysisSeverity {
  return maxSeverity(
    row.scheduleSeverity,
    maxSeverity(row.paceSeverity, row.deliverablesSeverity),
  );
}

export function severityToRisk(severity: AnalysisSeverity): MilestoneRisk {
  return severity;
}

export type AnalyzedRiskUpdateItem = {
  id: string;
  risk: MilestoneRisk;
  previousRisk: MilestoneRisk;
};

export type AnalyzedRiskUpdates = {
  milestones: AnalyzedRiskUpdateItem[];
  deliverables: AnalyzedRiskUpdateItem[];
};

export function buildAnalyzedRiskUpdates(result: PlanningAnalysisResult): AnalyzedRiskUpdates {
  return {
    milestones: result.milestones.map((row) => ({
      id: row.milestoneId,
      risk: severityToRisk(milestoneAnalyzedSeverity(row)),
      previousRisk: row.manualRisk,
    })),
    deliverables: result.deliverables.map((row) => ({
      id: row.deliverableId,
      risk: severityToRisk(row.computedSeverity),
      previousRisk: row.manualRisk,
    })),
  };
}

export function countAnalyzedRiskChanges(updates: AnalyzedRiskUpdates): number {
  const milestoneChanges = updates.milestones.filter((row) => row.risk !== row.previousRisk).length;
  const deliverableChanges = updates.deliverables.filter(
    (row) => row.risk !== row.previousRisk,
  ).length;
  return milestoneChanges + deliverableChanges;
}

export function severityColor(severity: AnalysisSeverity): string {
  switch (severity) {
    case "risk":
      return "#ef4444";
    case "caution":
      return "#eab308";
    default:
      return "#22c55e";
  }
}

export function severityBackground(severity: AnalysisSeverity): string {
  switch (severity) {
    case "risk":
      return "rgba(239,68,68,0.22)";
    case "caution":
      return "rgba(234,179,8,0.2)";
    default:
      return "rgba(34,197,94,0.18)";
  }
}
