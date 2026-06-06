import type { MilestoneRisk, MilestoneStatus } from "./types";

export type ImportApplyMode = "append" | "replace";

export type ImportedDeliverable = {
  title: string;
  status: MilestoneStatus;
  owner: string;
  due_date: string | null;
};

export type ImportedPlanningEvent = {
  name: string;
  week_offset: number;
};

export type ImportedMilestone = {
  name: string;
  start_date: string | null;
  delivery_date: string | null;
  duration_weeks: number;
  status: MilestoneStatus;
  risk: MilestoneRisk;
  goals: string[];
  deliverables: ImportedDeliverable[];
  events: ImportedPlanningEvent[];
};

export type ImportedPlanningData = {
  project_name: string | null;
  project_start_date: string | null;
  milestones: ImportedMilestone[];
};

export type ImportParseResult = {
  data: ImportedPlanningData;
  warnings: string[];
};
