import { describe, expect, it } from "vitest";
import {
  buildCalendarWeekColumns,
  buildWeekColumns,
  currentPlanWeekIndex,
  formatWeekRangeLabel,
  monthLongName,
  planningTimelineAnchor,
  startOfWeekSunday,
  todayLineLeftPx,
  weekColumnOffsets,
  weekIndexForDate,
} from "./planningTimeline";
import { PLANNING_STICKY_LEFT_W } from "./components/PlanningTimelineHeader";

describe("planningTimeline", () => {
  it("snaps to Sunday for week start", () => {
    const wednesday = new Date(2026, 0, 14);
    const sunday = startOfWeekSunday(wednesday);
    expect(sunday.getDay()).toBe(0);
    expect(sunday.getDate()).toBe(11);
  });

  it("builds Sun-Sat week columns anchored before plan start", () => {
    const columns = buildWeekColumns("2026-01-14", 4);
    expect(columns[0].week_start_iso).toBe("2026-01-11");
    expect(columns[0].week_end_iso).toBe("2026-01-17");
    expect(columns[0].range_label).toBe("11-17");
  });

  it("uses full month names", () => {
    const columns = buildWeekColumns("2026-01-14", 2);
    expect(columns[0].month_label).toBe("January");
    expect(monthLongName(new Date(2026, 5, 1))).toBe("June");
  });

  it("formats cross-month week range labels", () => {
    const weekStart = new Date(2026, 0, 25);
    const weekEnd = new Date(2026, 1, 1);
    expect(formatWeekRangeLabel(weekStart, weekEnd)).toBe("25-1");
  });

  it("alternates month stripe by calendar month", () => {
    const jan = buildWeekColumns("2026-01-14", 1)[0].month_stripe;
    const feb = buildWeekColumns("2026-02-10", 1)[0].month_stripe;
    expect(jan).not.toBe(feb);
  });

  it("maps today to the correct plan week index after Sunday anchor", () => {
    const anchor = planningTimelineAnchor("2026-01-14");
    expect(anchor.getDate()).toBe(11);
    const today = new Date(2026, 0, 15);
    expect(currentPlanWeekIndex("2026-01-14", today)).toBe(0);
    const nextWeek = new Date(2026, 0, 20);
    expect(currentPlanWeekIndex("2026-01-14", nextWeek)).toBe(1);
  });

  it("finds week index for a delivery date in calendar columns", () => {
    const columns = buildCalendarWeekColumns("2026-01-01", "2026-03-31");
    const index = weekIndexForDate(columns, "2026-02-15");
    expect(index).not.toBeNull();
    const col = columns[index ?? -1];
    expect(col.week_start_iso <= "2026-02-15").toBe(true);
    expect(col.week_end_iso >= "2026-02-15").toBe(true);
  });

  it("places today line earlier on Monday than on Friday within the same week", () => {
    const columns = buildCalendarWeekColumns("2026-01-01", "2026-03-31");
    const offsets = weekColumnOffsets(columns);
    const monday = new Date(2026, 0, 12);
    const friday = new Date(2026, 0, 16);
    const mondayLeft = todayLineLeftPx(columns, offsets, PLANNING_STICKY_LEFT_W, monday);
    const fridayLeft = todayLineLeftPx(columns, offsets, PLANNING_STICKY_LEFT_W, friday);
    expect(mondayLeft).not.toBeNull();
    expect(fridayLeft).not.toBeNull();
    expect(mondayLeft ?? 0).toBeLessThan(fridayLeft ?? 0);
  });
});
