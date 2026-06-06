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

export type MilestoneTimelineRow = PlanningMilestone & {
  start_week: number;
};

export type PlanningEmployee = {
  id: string;
  name: string;
  title: string;
  start_date: string;
  order_index: number;
  created_at: string;
  updated_at: string;
};

export type VacationEntry = {
  id: string;
  employee_id: string;
  day_date: string;
  status: "vacation" | "away_working";
};

export type VacationCellStatus = "vacation" | "away_working" | null;

export type VacationGrid = {
  employees: PlanningEmployee[];
  entries: VacationEntry[];
  holidays: string[];
  range: { from: string; to: string };
};
