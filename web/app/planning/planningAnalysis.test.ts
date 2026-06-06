import { describe, expect, it } from "vitest";
import {
  analyzePlanning,
  buildAnalyzedRiskUpdates,
  countAnalyzedRiskChanges,
  countEmployeeUnavailableDays,
} from "./planningAnalysis";
import type { PlanningEmployee, PlanningGraph, VacationEntry } from "./types";

const REFERENCE = new Date("2026-03-15T12:00:00");
const PLAN_START = "2026-01-01";

function makeGraph(overrides: Partial<PlanningGraph> = {}): PlanningGraph {
  return {
    plan: {
      id: "plan-1",
      project_key: "test",
      start_date: PLAN_START,
      created_at: "",
      updated_at: "",
    },
    milestones: [],
    deliverables: [],
    events: [],
    ...overrides,
  };
}

describe("analyzePlanning", () => {
  it("flags overdue deliverables", () => {
    const graph = makeGraph({
      milestones: [
        {
          id: "m1",
          project_plan_id: "plan-1",
          name: "M01 Alpha",
          duration_weeks: 4,
          status: "in_progress",
          risk: "on_track",
          goals: [],
          order_index: 0,
          created_at: "",
          updated_at: "",
        },
      ],
      deliverables: [
        {
          id: "d1",
          milestone_id: "m1",
          title: "Auth: Login flow",
          status: "in_progress",
          risk: "on_track",
          owner: "Alice",
          due_date: "2026-03-01",
          order_index: 0,
          created_at: "",
          updated_at: "",
        },
      ],
    });

    const result = analyzePlanning(graph, PLAN_START, REFERENCE);
    const deliverable = result.deliverables[0];
    expect(deliverable.issues).toContain("overdue");
    expect(deliverable.computedSeverity).toBe("risk");
    expect(result.summary.overdueDeliverables).toBe(1);
  });

  it("flags milestone behind pace when elapsed time exceeds completion", () => {
    const graph = makeGraph({
      milestones: [
        {
          id: "m1",
          project_plan_id: "plan-1",
          name: "M01 Alpha",
          duration_weeks: 10,
          status: "in_progress",
          risk: "on_track",
          goals: [],
          order_index: 0,
          created_at: "",
          updated_at: "",
        },
      ],
      deliverables: [
        {
          id: "d1",
          milestone_id: "m1",
          title: "Item A",
          status: "todo",
          risk: "on_track",
          owner: "Bob",
          due_date: "2026-05-01",
          order_index: 0,
          created_at: "",
          updated_at: "",
        },
        {
          id: "d2",
          milestone_id: "m1",
          title: "Item B",
          status: "todo",
          risk: "on_track",
          owner: "Bob",
          due_date: "2026-05-15",
          order_index: 1,
          created_at: "",
          updated_at: "",
        },
        {
          id: "d3",
          milestone_id: "m1",
          title: "Item C",
          status: "completed",
          risk: "on_track",
          owner: "Bob",
          due_date: "2026-04-01",
          order_index: 2,
          created_at: "",
          updated_at: "",
        },
        {
          id: "d4",
          milestone_id: "m1",
          title: "Item D",
          status: "completed",
          risk: "on_track",
          owner: "Bob",
          due_date: "2026-04-15",
          order_index: 3,
          created_at: "",
          updated_at: "",
        },
      ],
    });

    const result = analyzePlanning(graph, PLAN_START, REFERENCE);
    const milestone = result.milestones[0];
    expect(milestone.paceSeverity).not.toBe("on_track");
    expect(result.findings.some((finding) => finding.issueLabel === "Behind pace")).toBe(true);
  });

  it("flags overloaded owner by density threshold", () => {
    const graph = makeGraph({
      milestones: [
        {
          id: "m1",
          project_plan_id: "plan-1",
          name: "M01 Alpha",
          duration_weeks: 8,
          status: "in_progress",
          risk: "on_track",
          goals: [],
          order_index: 0,
          created_at: "",
          updated_at: "",
        },
      ],
      deliverables: [
        {
          id: "d1",
          milestone_id: "m1",
          title: "Task 1",
          status: "todo",
          risk: "on_track",
          owner: "Carol",
          due_date: "2026-03-20",
          order_index: 0,
          created_at: "",
          updated_at: "",
        },
        {
          id: "d2",
          milestone_id: "m1",
          title: "Task 2",
          status: "in_progress",
          risk: "on_track",
          owner: "Carol",
          due_date: "2026-03-22",
          order_index: 1,
          created_at: "",
          updated_at: "",
        },
        {
          id: "d3",
          milestone_id: "m1",
          title: "Task 3",
          status: "todo",
          risk: "on_track",
          owner: "Carol",
          due_date: "2026-03-25",
          order_index: 2,
          created_at: "",
          updated_at: "",
        },
        {
          id: "d4",
          milestone_id: "m1",
          title: "Task 4",
          status: "todo",
          risk: "on_track",
          owner: "Carol",
          due_date: "2026-03-28",
          order_index: 3,
          created_at: "",
          updated_at: "",
        },
      ],
    });

    const result = analyzePlanning(graph, PLAN_START, REFERENCE);
    const carol = result.owners.find((owner) => owner.ownerLabel === "Carol");
    expect(carol).toBeDefined();
    expect(carol?.severity).not.toBe("on_track");
    expect(result.summary.overloadedOwners).toBeGreaterThan(0);
  });

  it("flags unassigned open deliverables", () => {
    const graph = makeGraph({
      milestones: [
        {
          id: "m1",
          project_plan_id: "plan-1",
          name: "M01 Alpha",
          duration_weeks: 4,
          status: "in_progress",
          risk: "on_track",
          goals: [],
          order_index: 0,
          created_at: "",
          updated_at: "",
        },
      ],
      deliverables: [
        {
          id: "d1",
          milestone_id: "m1",
          title: "Unowned task",
          status: "todo",
          risk: "on_track",
          owner: "",
          due_date: "2026-04-01",
          order_index: 0,
          created_at: "",
          updated_at: "",
        },
      ],
    });

    const result = analyzePlanning(graph, PLAN_START, REFERENCE);
    expect(result.deliverables[0].issues).toContain("unassigned");
    expect(result.owners.some((owner) => owner.ownerLabel === "Unassigned")).toBe(true);
  });

  it("detects stale manual risk when computed severity is risk", () => {
    const graph = makeGraph({
      milestones: [
        {
          id: "m1",
          project_plan_id: "plan-1",
          name: "M01 Alpha",
          duration_weeks: 4,
          status: "in_progress",
          risk: "on_track",
          goals: [],
          order_index: 0,
          created_at: "",
          updated_at: "",
        },
      ],
      deliverables: [
        {
          id: "d1",
          milestone_id: "m1",
          title: "Late task",
          status: "todo",
          risk: "on_track",
          owner: "Dave",
          due_date: "2026-02-01",
          order_index: 0,
          created_at: "",
          updated_at: "",
        },
      ],
    });

    const result = analyzePlanning(graph, PLAN_START, REFERENCE);
    expect(result.deliverables[0].issues).toContain("stale_risk");
    expect(result.findings.some((finding) => finding.issueLabel === "Stale risk")).toBe(true);
  });

  it("increases owner workload severity when vacations reduce effective time", () => {
    const graph = makeGraph({
      milestones: [
        {
          id: "m1",
          project_plan_id: "plan-1",
          name: "M01 Alpha",
          duration_weeks: 8,
          status: "in_progress",
          risk: "on_track",
          goals: [],
          order_index: 0,
          created_at: "",
          updated_at: "",
        },
      ],
      deliverables: [
        {
          id: "d1",
          milestone_id: "m1",
          title: "Task 1",
          status: "todo",
          risk: "on_track",
          owner: "Erin",
          due_date: "2026-03-29",
          order_index: 0,
          created_at: "",
          updated_at: "",
        },
        {
          id: "d2",
          milestone_id: "m1",
          title: "Task 2",
          status: "todo",
          risk: "on_track",
          owner: "Erin",
          due_date: "2026-03-29",
          order_index: 1,
          created_at: "",
          updated_at: "",
        },
      ],
    });

    const employee: PlanningEmployee = {
      id: "emp-erin",
      name: "Erin",
      title: "Dev",
      start_date: "2026-01-01",
      order_index: 0,
      created_at: "",
      updated_at: "",
    };

    const withoutVacations = analyzePlanning(graph, PLAN_START, REFERENCE);
    const erinWithout = withoutVacations.owners.find((owner) => owner.ownerLabel === "Erin");
    expect(erinWithout?.severity).toBe("on_track");

    const vacationEntries: VacationEntry[] = [
      { id: "v1", employee_id: "emp-erin", day_date: "2026-03-16", status: "vacation" },
      { id: "v2", employee_id: "emp-erin", day_date: "2026-03-17", status: "vacation" },
      { id: "v3", employee_id: "emp-erin", day_date: "2026-03-18", status: "vacation" },
      { id: "v4", employee_id: "emp-erin", day_date: "2026-03-19", status: "vacation" },
      { id: "v5", employee_id: "emp-erin", day_date: "2026-03-20", status: "vacation" },
      { id: "v6", employee_id: "emp-erin", day_date: "2026-03-21", status: "vacation" },
      { id: "v7", employee_id: "emp-erin", day_date: "2026-03-22", status: "vacation" },
    ];

    const withVacations = analyzePlanning(graph, PLAN_START, REFERENCE, {
      employees: [employee],
      entries: vacationEntries,
      holidays: [],
    });
    const erinWith = withVacations.owners.find((owner) => owner.ownerLabel === "Erin");
    expect(erinWith?.vacationDays).toBe(7);
    expect(erinWith?.effectiveWeeksLeft).toBeLessThan(erinWithout?.effectiveWeeksLeft ?? 0);
    expect(erinWith?.severity).toBe("caution");
  });

  it("counts unavailable days for employee vacation and holidays", () => {
    const employee: PlanningEmployee = {
      id: "emp-1",
      name: "Alex",
      title: "",
      start_date: "2026-01-01",
      order_index: 0,
      created_at: "",
      updated_at: "",
    };
    const from = new Date("2026-03-15T00:00:00");
    const to = new Date("2026-03-25T00:00:00");
    const counts = countEmployeeUnavailableDays(
      employee,
      from,
      to,
      [
        { id: "e1", employee_id: "emp-1", day_date: "2026-03-18", status: "vacation" },
        { id: "e2", employee_id: "emp-1", day_date: "2026-03-19", status: "away_working" },
      ],
      ["2026-03-20"],
    );
    expect(counts.vacationDays).toBe(1);
    expect(counts.awayDays).toBe(1);
    expect(counts.holidayDays).toBe(1);
  });

  it("builds risk updates from milestone and deliverable analysis", () => {
    const graph = makeGraph({
      milestones: [
        {
          id: "m1",
          project_plan_id: "plan-1",
          name: "M01 Alpha",
          duration_weeks: 4,
          status: "in_progress",
          risk: "on_track",
          goals: [],
          order_index: 0,
          created_at: "",
          updated_at: "",
        },
      ],
      deliverables: [
        {
          id: "d1",
          milestone_id: "m1",
          title: "Late task",
          status: "todo",
          risk: "on_track",
          owner: "Dave",
          due_date: "2026-02-01",
          order_index: 0,
          created_at: "",
          updated_at: "",
        },
      ],
    });

    const result = analyzePlanning(graph, PLAN_START, REFERENCE);
    const updates = buildAnalyzedRiskUpdates(result);
    expect(updates.deliverables[0].risk).toBe("risk");
    expect(updates.deliverables[0].previousRisk).toBe("on_track");
    expect(countAnalyzedRiskChanges(updates)).toBeGreaterThan(0);
  });
});
