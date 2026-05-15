import { DEFAULT_CAPACITY_SETTINGS } from "../planner/plannerStorage";
import { buildPlannerSnapshot } from "../scheduling/scheduleEngine";
import { Course, TodayPlanSummary } from "../types";

export function buildTodayPlan(
  courses: Course[],
  today: Date = new Date(),
): TodayPlanSummary {
  return buildPlannerSnapshot(
    courses,
    DEFAULT_CAPACITY_SETTINGS,
    [],
    {},
    [],
    today,
  ).todayPlan;
}
