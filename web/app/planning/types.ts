export type MilestoneStatus = "todo" | "in_progress" | "ready" | "completed";
export type MilestoneRisk = "on_track" | "caution" | "risk";
export type DeliverableStatus = MilestoneStatus;

export type ProjectPlan = {
  id: string;
  project_key: string;
  start_date: string;
  created_at: string;
  updated_at: string;
};

export type PlanningMilestone = {
  id: string;
  project_plan_id: string;
  name: string;
  duration_weeks: number;
  status: MilestoneStatus;
  risk: MilestoneRisk;
  goals: string[];
  order_index: number;
  created_at: string;
  updated_at: string;
};

export type PlanningDeliverable = {
  id: string;
  milestone_id: string;
  title: string;
  status: DeliverableStatus;
  risk: MilestoneRisk;
  owner: string;
  due_date: string | null;
  order_index: number;
  created_at: string;
  updated_at: string;
};

export type PlanningEvent = {
  id: string;
  milestone_id: string;
  name: string;
  weeks_after_milestone_start: number;
  order_index: number;
  created_at: string;
  updated_at: string;
};

export type PlanningGraph = {
  plan: ProjectPlan | null;
  milestones: PlanningMilestone[];
  deliverables: PlanningDeliverable[];
  events: PlanningEvent[];
};

export type GlobalPlanningProject = {
  project_key: string;
  display_name: string;
  plan: ProjectPlan | null;
  milestones: PlanningMilestone[];
};

export type GlobalPlanningResponse = {
  projects: GlobalPlanningProject[];
};

export type MilestoneTimelineRow = PlanningMilestone & {
  start_week: number;
};

export type { VacationEmployee as PlanningEmployee } from "../vacations/types";
