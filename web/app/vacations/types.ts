export type VacationEmployee = {
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
  employees: VacationEmployee[];
  entries: VacationEntry[];
  holidays: string[];
  range: { from: string; to: string };
};
