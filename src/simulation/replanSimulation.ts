import {
  Course,
  PlannerSnapshot,
  ReplanCourseChange,
  ReplanDayChange,
  ReplanImpact,
  ManualTaskMove,
  StudyTaskDecision,
  UserCapacitySettings,
} from "../types";
import { addDays, formatDateShort, getDateKey } from "../utils/date";
import { buildPlannerSnapshot } from "../scheduling/scheduleEngine";

function buildDayMap(snapshot: PlannerSnapshot) {
  return new Map(snapshot.horizonPlans.map((day) => [day.date, day]));
}

function isPresent<T>(value: T | null | undefined): value is T {
  return value != null;
}

export function buildReplanImpact(
  courses: Course[],
  settings: UserCapacitySettings,
  taskDecisions: StudyTaskDecision[],
  dayAdjustments: Record<string, number>,
  manualTaskMoves: ManualTaskMove[],
  currentSnapshot: PlannerSnapshot,
  skippedTaskId: string,
  referenceDate: Date = new Date(),
): ReplanImpact | null {
  const skippedTask = currentSnapshot.todayPlan.tasks.find((task) => task.taskId === skippedTaskId);
  if (!skippedTask) {
    return null;
  }

  const tomorrow = addDays(referenceDate, 1);
  const afterSnapshot = buildPlannerSnapshot(
    courses,
    settings,
    taskDecisions,
    dayAdjustments,
    manualTaskMoves,
    tomorrow,
  );

  const beforePriorityMap = new Map(
    currentSnapshot.priorityRanking.map((entry) => [entry.courseId, entry]),
  );
  const afterPriorityMap = new Map(
    afterSnapshot.priorityRanking.map((entry) => [entry.courseId, entry]),
  );

  const riskChanges: ReplanCourseChange[] = [...afterPriorityMap.values()]
    .map((afterEntry) => {
      const beforeEntry = beforePriorityMap.get(afterEntry.courseId);
      if (!beforeEntry) {
        return null;
      }

      return {
        courseId: afterEntry.courseId,
        courseName: afterEntry.courseName,
        beforeScore: beforeEntry.score,
        afterScore: afterEntry.score,
        delta: Math.round((afterEntry.score - beforeEntry.score) * 100) / 100,
        beforeLevel: beforeEntry.riskLevel,
        afterLevel: afterEntry.riskLevel,
      } satisfies ReplanCourseChange;
    })
    .filter(isPresent)
    .filter((item) => item.delta > 0.5 || item.beforeLevel !== item.afterLevel)
    .sort((left, right) => right.delta - left.delta)
    .slice(0, 4);

  const beforeDayMap = buildDayMap(currentSnapshot);
  const afterDayMap = buildDayMap(afterSnapshot);
  const startCompareDate = getDateKey(tomorrow);

  const heavierDays: ReplanDayChange[] = [...afterDayMap.values()]
    .filter((day) => day.date >= startCompareDate)
    .map((afterDay) => {
      const beforeDay = beforeDayMap.get(afterDay.date);
      if (!beforeDay) {
        return null;
      }

      return {
        date: afterDay.date,
        label: formatDateShort(afterDay.date),
        beforeMinutes: beforeDay.totalMinutes,
        afterMinutes: afterDay.totalMinutes,
        deltaMinutes: afterDay.totalMinutes - beforeDay.totalMinutes,
        beforeLoad: beforeDay.loadLevel,
        afterLoad: afterDay.loadLevel,
      } satisfies ReplanDayChange;
    })
    .filter(isPresent)
    .filter((item) => item.deltaMinutes > 0)
    .sort((left, right) => right.deltaMinutes - left.deltaMinutes)
    .slice(0, 4);

  const afterCourse = afterPriorityMap.get(skippedTask.courseId);
  const overloadedDaysAfter = afterSnapshot.horizonPlans
    .filter((day) => day.date >= startCompareDate && day.loadLevel === "overload")
    .map((day) => day.date);

  const firstHeavierDay = heavierDays[0];
  const summaryParts = [
    `今天跳过 ${skippedTask.courseName} 后，后续安排会自动顺延并变紧。`,
    firstHeavierDay
      ? `${firstHeavierDay.label} 会增加 ${firstHeavierDay.deltaMinutes} 分钟负载。`
      : "接下来几天的压力会略微上升。",
  ];

  return {
    skippedTaskId,
    skippedCourseId: skippedTask.courseId,
    skippedCourseName: skippedTask.courseName,
    tomorrowRequiredDelta: afterCourse
      ? Math.round(
          (afterCourse.requiredDailyPace - skippedTask.requiredDailyPace) * 100,
        ) / 100
      : skippedTask.skipPenalty,
    riskChanges,
    heavierDays,
    overloadedDaysAfter,
    summary: summaryParts.join(" "),
  };
}
