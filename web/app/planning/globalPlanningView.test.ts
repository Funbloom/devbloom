import { describe, expect, it } from "vitest";
import {
  aggregateProjectRisk,
  aggregateProjectStatus,
  buildGlobalProjectRow,
  defaultEnabledProjectKeys,
  formatGlobalBarLabel,
  milestoneNamePrefix,
} from "./globalPlanningView";
import { buildCalendarWeekColumns } from "./planningTimeline";
import type { GlobalPlanningProject, PlanningMilestone } from "./types";

function milestone(partial: Partial<PlanningMilestone> & { id: string; name: string }): PlanningMilestone {
  return {
    project_plan_id: "plan-1",
    duration_weeks: 2,
    status: "todo",
    risk: "on_track",
    goals: [],
    notes: "",
    order_index: 0,
    created_at: "",
    updated_at: "",
    ...partial,
  };
}

describe("globalPlanningView", () => {
  it("aggregates project status from first active milestone", () => {
    const milestones = [
      milestone({ id: "m1", name: "A", status: "completed", order_index: 0 }),
      milestone({ id: "m2", name: "B", status: "in_progress", order_index: 1 }),
    ];
    expect(aggregateProjectStatus(milestones)).toBe("in_progress");
  });

  it("aggregates worst project risk", () => {
    const milestones = [
      milestone({ id: "m1", name: "A", risk: "on_track", order_index: 0 }),
      milestone({ id: "m2", name: "B", risk: "risk", order_index: 1 }),
    ];
    expect(aggregateProjectRisk(milestones)).toBe("risk");
  });

  it("defaults enabled keys to projects with planning data", () => {
    const projects: GlobalPlanningProject[] = [
      {
        project_key: "a",
        display_name: "A",
        plan: { id: "p1", project_key: "a", start_date: "2026-01-01", created_at: "", updated_at: "" },
        milestones: [milestone({ id: "m1", name: "M1" })],
      },
      {
        project_key: "b",
        display_name: "B",
        plan: null,
        milestones: [],
      },
    ];
    expect(defaultEnabledProjectKeys(projects)).toEqual(new Set(["a"]));
  });

  it("extracts milestone code prefix from name", () => {
    expect(milestoneNamePrefix("M00 Alpha", 3)).toBe("M00");
    expect(milestoneNamePrefix("m12 Beta", 0)).toBe("M12");
    expect(milestoneNamePrefix("MVP", 2)).toBe("M02");
  });

  it("formats bar label with milestone prefix and due date", () => {
    expect(formatGlobalBarLabel("M00 Ship", 0, "2026-07-03")).toBe("M00: Due: Jul 3");
  });

  it("builds milestone bars on calendar columns", () => {
    const columns = buildCalendarWeekColumns("2026-01-01", "2026-06-30");
    const project: GlobalPlanningProject = {
      project_key: "alpha",
      display_name: "Alpha",
      plan: {
        id: "plan-1",
        project_key: "alpha",
        start_date: "2026-01-15",
        created_at: "",
        updated_at: "",
      },
      milestones: [
        milestone({ id: "m1", name: "M00 MVP", duration_weeks: 2, order_index: 0, risk: "caution" }),
      ],
    };
    const row = buildGlobalProjectRow(project, columns);
    expect(row).not.toBeNull();
    expect(row?.bars.length).toBe(1);
    expect(row?.bars[0].label).toMatch(/^M00: Due: /);
    expect(row?.bars[0].risk).toBe("caution");
    expect(row?.bars[0].widthPx).toBeGreaterThan(0);
  });
});
