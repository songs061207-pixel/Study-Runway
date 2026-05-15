import { useEffect, useMemo, useState } from "react";
import { useCourseContext } from "../context/CourseContext";
import {
  buildPlannerSnapshot,
  getWeekStartDateKey,
} from "../scheduling/scheduleEngine";
import { learningItemToCourse } from "../utils/learningFactory";
import {
  Course,
  CourseIntensity,
  CourseTaskSuggestion,
  DayPlan,
  IntensityLoadSummary,
  LoadLevel,
  MasterPlanWeek,
  PlannerSnapshot,
  StudyTaskDecision,
  TodayPlanSummary,
  WeeklyPlan,
} from "../types";
import { getDateKey, parseDateKey } from "../utils/date";

interface StablePlanCache {
  planKey: string;
  weeklyPlan: WeeklyPlan;
  nextWeekPlan: WeeklyPlan;
  masterPlan: MasterPlanWeek[];
  planningHorizonEnd: string;
  lastDeadline: string | null;
  projectedFinishByItemId: Record<string, string>;
  roadmapProjectedFinishDate: string | null;
  unfinishedUnscheduledItemIds: string[];
}

const STABLE_PLAN_CACHE_KEY = "study-runway:stable-plan:v29";
const STABLE_PLAN_ALGORITHM_VERSION = "manual-deadline-focus-v1";
const MAX_PERSISTED_STABLE_PLAN_CACHE_CHARACTERS = 750_000;

const emptyWeeklyPlan: WeeklyPlan = {
  weekKey: "current:",
  startDate: "",
  endDate: "",
  view: "current",
  days: [],
  totalMinutes: 0,
  totalUnits: 0,
  overloadedDates: [],
  underloadedDates: [],
  generatedAt: new Date(0).toISOString(),
};

const emptyNextWeekPlan: WeeklyPlan = {
  ...emptyWeeklyPlan,
  weekKey: "next:",
  view: "next",
};

const emptyMasterPlan: MasterPlanWeek[] = [];

function isWeeklyPlan(value: unknown): value is WeeklyPlan {
  if (!value || typeof value !== "object") {
    return false;
  }

  const candidate = value as WeeklyPlan;
  return Array.isArray(candidate.days) && typeof candidate.weekKey === "string";
}

function isMasterPlanWeek(value: unknown): value is MasterPlanWeek {
  if (!value || typeof value !== "object") {
    return false;
  }

  const candidate = value as MasterPlanWeek;
  return Array.isArray(candidate.days) && typeof candidate.weekKey === "string";
}

function loadStablePlanCache(): StablePlanCache {
  if (typeof window === "undefined") {
    return {
      planKey: "",
      weeklyPlan: emptyWeeklyPlan,
      nextWeekPlan: emptyNextWeekPlan,
      masterPlan: emptyMasterPlan,
      planningHorizonEnd: "",
      lastDeadline: null,
      projectedFinishByItemId: {},
      roadmapProjectedFinishDate: null,
      unfinishedUnscheduledItemIds: [],
    };
  }

  try {
    const rawValue = window.localStorage.getItem(STABLE_PLAN_CACHE_KEY);
    if (rawValue) {
      const parsedValue = JSON.parse(rawValue) as Partial<StablePlanCache>;
      if (
        typeof parsedValue.planKey === "string" &&
        isWeeklyPlan(parsedValue.weeklyPlan) &&
        isWeeklyPlan(parsedValue.nextWeekPlan) &&
        Array.isArray(parsedValue.masterPlan) &&
        parsedValue.masterPlan.every(isMasterPlanWeek) &&
        typeof parsedValue.planningHorizonEnd === "string"
      ) {
        return {
          planKey: parsedValue.planKey,
          weeklyPlan: parsedValue.weeklyPlan,
          nextWeekPlan: parsedValue.nextWeekPlan,
          masterPlan: parsedValue.masterPlan,
          planningHorizonEnd: parsedValue.planningHorizonEnd,
          lastDeadline: parsedValue.lastDeadline ?? null,
          projectedFinishByItemId: parsedValue.projectedFinishByItemId ?? {},
          roadmapProjectedFinishDate: parsedValue.roadmapProjectedFinishDate ?? null,
          unfinishedUnscheduledItemIds: parsedValue.unfinishedUnscheduledItemIds ?? [],
        };
      }
    }
  } catch {
    return {
      planKey: "",
      weeklyPlan: emptyWeeklyPlan,
      nextWeekPlan: emptyNextWeekPlan,
      masterPlan: emptyMasterPlan,
      planningHorizonEnd: "",
      lastDeadline: null,
      projectedFinishByItemId: {},
      roadmapProjectedFinishDate: null,
      unfinishedUnscheduledItemIds: [],
    };
  }

  return {
    planKey: "",
    weeklyPlan: emptyWeeklyPlan,
    nextWeekPlan: emptyNextWeekPlan,
    masterPlan: emptyMasterPlan,
    planningHorizonEnd: "",
    lastDeadline: null,
    projectedFinishByItemId: {},
    roadmapProjectedFinishDate: null,
    unfinishedUnscheduledItemIds: [],
  };
}

function saveStablePlanCache(cache: StablePlanCache) {
  if (typeof window === "undefined") {
    return;
  }

  function clearPersistedStablePlanCache() {
    try {
      window.localStorage.removeItem(STABLE_PLAN_CACHE_KEY);
    } catch {
      // Derived cache only; keep rendering even if storage is unavailable.
    }
  }

  try {
    const payload = JSON.stringify(cache);
    if (payload.length > MAX_PERSISTED_STABLE_PLAN_CACHE_CHARACTERS) {
      clearPersistedStablePlanCache();
      return;
    }

    window.localStorage.setItem(STABLE_PLAN_CACHE_KEY, payload);
  } catch (error) {
    clearPersistedStablePlanCache();
    console.warn("Study Runway stable plan cache skipped.", error);
  }
}

const stablePlanCache: StablePlanCache = loadStablePlanCache();

function buildCourseFingerprint(courses: Course[]) {
  return courses
    .map((course) =>
      [
        course.id,
        course.updatedAt,
        course.deadline,
        course.intensity,
        course.priority,
        course.dependencyIds?.join(","),
        course.softDependencyIds?.join(","),
        course.roadmapTrack,
        course.roadmapPhase,
        course.roadmapOrder,
        course.roadmapRoute,
        course.roadmapYear,
        course.roadmapStatus,
        course.scheduleMode,
        course.deadlineMode,
        course.scheduleCadence ?? "roadmap",
        course.weeklyTargetBlocks ?? "",
        course.weeklySpacingDays ?? "",
        course.sourceType ?? "course",
      ].join(":"),
    )
    .join("|");
}
function syncTaskStatuses(
  tasks: CourseTaskSuggestion[],
  decisionMap: Map<string, StudyTaskDecision>,
  isPastDay: boolean,
) {
  return tasks.map((task) => {
    const decision = decisionMap.get(task.taskId);
    const nextStatus =
      decision?.status ??
      (isPastDay && task.status === "pending" ? "skipped" : task.status);

    return {
      ...task,
      status: nextStatus,
      estimatedMinutes:
        nextStatus === "completed" && decision?.actualMinutes != null
          ? decision.actualMinutes
          : task.estimatedMinutes,
    };
  });
}

function getLoadLevel(totalMinutes: number, capacityMinutes: number): LoadLevel {
  const ratio = capacityMinutes <= 0 ? 0 : totalMinutes / capacityMinutes;
  if (ratio > 1) {
    return "overload";
  }
  if (ratio >= 0.85) {
    return "heavy";
  }
  if (ratio <= 0.4) {
    return "light";
  }
  return "balanced";
}

function getCombinedLoadLevel(
  totalMinutes: number,
  capacityMinutes: number,
  intensityLoads: Record<CourseIntensity, IntensityLoadSummary>,
): LoadLevel {
  const overallLoadLevel = getLoadLevel(totalMinutes, capacityMinutes);
  const laneLoadLevels = [intensityLoads.heavy.loadLevel, intensityLoads.light.loadLevel];

  if (laneLoadLevels.includes("overload") || overallLoadLevel === "overload") {
    return "overload";
  }
  if (laneLoadLevels.includes("heavy") || overallLoadLevel === "heavy") {
    return "heavy";
  }
  if (laneLoadLevels.every((level) => level === "light") && overallLoadLevel === "light") {
    return "light";
  }

  return overallLoadLevel === "light" ? "balanced" : overallLoadLevel;
}

function getEmptyIntensityLoad(capacityMinutes = 0): IntensityLoadSummary {
  return {
    minutes: 0,
    capacityMinutes,
    loadRatio: 0,
    loadLevel: getLoadLevel(0, capacityMinutes),
    scheduledCourses: 0,
    totalUnits: 0,
  };
}

function summarizeIntensityLoad(
  tasks: CourseTaskSuggestion[],
  capacityMinutes: number,
): IntensityLoadSummary {
  const minutes = tasks.reduce((total, task) => total + task.estimatedMinutes, 0);
  const totalUnits = tasks.reduce((total, task) => total + task.studyBlockCount, 0);

  return {
    minutes,
    capacityMinutes,
    loadRatio:
      capacityMinutes <= 0 ? 0 : Math.round((minutes / capacityMinutes) * 100) / 100,
    loadLevel: getLoadLevel(minutes, capacityMinutes),
    scheduledCourses: tasks.length,
    totalUnits,
  };
}

function getTaskSlotCount(task: CourseTaskSuggestion) {
  return Math.max(1, Math.round(task.slotCount ?? 1));
}

function summarizeIntensityLoads(
  day: DayPlan,
  tasks: CourseTaskSuggestion[],
): Record<CourseIntensity, IntensityLoadSummary> {
  const capacities = {
    heavy: day.intensityLoads?.heavy?.capacityMinutes ?? 0,
    light: day.intensityLoads?.light?.capacityMinutes ?? 0,
  };

  return {
    heavy: summarizeIntensityLoad(
      tasks.filter((task) => task.intensity === "heavy"),
      capacities.heavy,
    ),
    light: summarizeIntensityLoad(
      tasks.filter((task) => task.intensity === "light"),
      capacities.light,
    ),
  };
}

function summarizeDay(day: DayPlan, tasks: CourseTaskSuggestion[], isPastDay: boolean) {
  const totalMinutes = tasks.reduce((total, task) => total + task.estimatedMinutes, 0);
  const totalUnits = tasks.reduce((total, task) => total + task.studyBlockCount, 0);
  const intensityLoads = summarizeIntensityLoads(day, tasks);
  const loadLevel = getCombinedLoadLevel(totalMinutes, day.capacityMinutes, intensityLoads);

  if (isPastDay) {
    return {
      totalMinutes,
      totalUnits,
      loadLevel,
      intensityLoads,
      summary:
        totalUnits > 0
          ? `这一天实际完成了 ${totalUnits} 个学习块。`
          : "这一天未标记完成，已按未执行处理。",
    };
  }

  return {
    totalMinutes,
    totalUnits,
    loadLevel,
    intensityLoads,
    summary: day.summary,
  };
}

function refreshDayState(
  day: DayPlan,
  referenceKey: string,
  decisionMap: Map<string, StudyTaskDecision>,
) {
  const isPastDay = day.date < referenceKey;
  const tasks = syncTaskStatuses(day.tasks, decisionMap, isPastDay).filter((task) =>
    isPastDay ? task.status === "completed" : task.status !== "skipped",
  );
  const daySummary = summarizeDay(day, tasks, isPastDay);

  return {
    ...day,
    ...daySummary,
    isToday: day.date === referenceKey,
    isPast: isPastDay,
    tasks,
    loadRatio:
      day.capacityMinutes <= 0
        ? 0
        : Math.round((daySummary.totalMinutes / day.capacityMinutes) * 100) / 100,
  } satisfies DayPlan;
}

function refreshWeekState(
  plan: WeeklyPlan,
  referenceKey: string,
  decisionMap: Map<string, StudyTaskDecision>,
) {
  const days = plan.days.map((day) => refreshDayState(day, referenceKey, decisionMap));

  return {
    ...plan,
    days,
    totalMinutes: days.reduce((total, day) => total + day.totalMinutes, 0),
    totalUnits: days.reduce((total, day) => total + day.totalUnits, 0),
    overloadedDates: days
      .filter((day) => day.loadLevel === "overload")
      .map((day) => day.date),
    underloadedDates: days
      .filter((day) => day.loadLevel === "light")
      .map((day) => day.date),
  } satisfies WeeklyPlan;
}

function refreshMasterPlanWeek(
  week: MasterPlanWeek,
  referenceKey: string,
  decisionMap: Map<string, StudyTaskDecision>,
) {
  const days = week.days.map((day) => refreshDayState(day, referenceKey, decisionMap));

  return {
    ...week,
    days,
    totalMinutes: days.reduce((total, day) => total + day.totalMinutes, 0),
    totalUnits: days.reduce((total, day) => total + day.totalUnits, 0),
    overloadedDates: days
      .filter((day) => day.loadLevel === "overload")
      .map((day) => day.date),
    underloadedDates: days
      .filter((day) => day.loadLevel === "light")
      .map((day) => day.date),
  } satisfies MasterPlanWeek;
}

function summarizeTodayPlan(todayPlan: DayPlan | undefined): TodayPlanSummary {
  if (!todayPlan) {
    return {
      tasks: [],
      baselineUnits: 0,
      baselineMinutes: 0,
      totalSkipPenalty: 0,
      highestRiskCourse: null,
      capacityMinutes: 0,
      withinCapacity: true,
      overloadMinutes: 0,
      scheduledCourses: 0,
      intensityLoads: {
        heavy: getEmptyIntensityLoad(),
        light: getEmptyIntensityLoad(),
      },
    };
  }

  const laneOverloadMinutes =
    Math.max(0, todayPlan.intensityLoads.heavy.minutes - todayPlan.intensityLoads.heavy.capacityMinutes) +
    Math.max(0, todayPlan.intensityLoads.light.minutes - todayPlan.intensityLoads.light.capacityMinutes);

  return {
    tasks: todayPlan.tasks,
    baselineUnits: todayPlan.totalUnits,
    baselineMinutes: todayPlan.totalMinutes,
    totalSkipPenalty:
      Math.round(
        todayPlan.tasks.reduce((total, task) => total + task.skipPenalty, 0) * 100,
      ) / 100,
    highestRiskCourse: todayPlan.tasks[0] ?? null,
    capacityMinutes: todayPlan.capacityMinutes,
    withinCapacity: laneOverloadMinutes <= 0 && todayPlan.totalMinutes <= todayPlan.capacityMinutes,
    overloadMinutes: Math.max(
      laneOverloadMinutes,
      Math.max(0, todayPlan.totalMinutes - todayPlan.capacityMinutes),
    ),
    scheduledCourses: todayPlan.tasks.length,
    intensityLoads: todayPlan.intensityLoads,
  };
}

function refreshPriorityPlanFlags(
  snapshot: PlannerSnapshot,
  weeklyPlan: WeeklyPlan,
  referenceKey: string,
) {
  const todayPlan = weeklyPlan.days.find((day) => day.date === referenceKey);
  const todayCourseIds = new Set(todayPlan?.tasks.map((task) => task.courseId) ?? []);
  const weeklyStats = new Map<string, { minutes: number; units: number }>();

  weeklyPlan.days.forEach((day) => {
    day.tasks.forEach((task) => {
      const currentValue = weeklyStats.get(task.courseId) ?? { minutes: 0, units: 0 };
      weeklyStats.set(task.courseId, {
        minutes: currentValue.minutes + task.estimatedMinutes,
        units: currentValue.units + getTaskSlotCount(task),
      });
    });
  });

  const todayMinutes = todayPlan?.totalMinutes ?? 0;
  const todayCapacity = todayPlan?.capacityMinutes ?? 0;
  const todayIntensityLoads = todayPlan?.intensityLoads ?? {
    heavy: getEmptyIntensityLoad(),
    light: getEmptyIntensityLoad(),
  };

  return {
    ...snapshot,
    priorityRanking: snapshot.priorityRanking.map((entry) => {
      const weeklyValue = weeklyStats.get(entry.courseId) ?? { minutes: 0, units: 0 };

      return {
        ...entry,
        scheduledMinutesThisWeek: weeklyValue.minutes,
        scheduledUnitsThisWeek: weeklyValue.units,
        inTodayPlan: todayCourseIds.has(entry.courseId),
        inWeeklyPlan: weeklyValue.units > 0,
      };
    }),
    capacitySummary: {
      todayMinutes,
      todayCapacity,
      todayLoadRatio:
        todayCapacity <= 0
          ? 0
          : Math.round((todayMinutes / todayCapacity) * 100) / 100,
      weeklyMinutes: weeklyPlan.totalMinutes,
      weeklyCapacity: weeklyPlan.days.reduce(
        (total, day) => total + day.capacityMinutes,
        0,
      ),
      todayHeavyMinutes: todayIntensityLoads.heavy.minutes,
      todayHeavyCapacity: todayIntensityLoads.heavy.capacityMinutes,
      todayLightMinutes: todayIntensityLoads.light.minutes,
      todayLightCapacity: todayIntensityLoads.light.capacityMinutes,
      weeklyHeavyMinutes: weeklyPlan.days.reduce(
        (total, day) => total + day.intensityLoads.heavy.minutes,
        0,
      ),
      weeklyHeavyCapacity: weeklyPlan.days.reduce(
        (total, day) => total + day.intensityLoads.heavy.capacityMinutes,
        0,
      ),
      weeklyLightMinutes: weeklyPlan.days.reduce(
        (total, day) => total + day.intensityLoads.light.minutes,
        0,
      ),
      weeklyLightCapacity: weeklyPlan.days.reduce(
        (total, day) => total + day.intensityLoads.light.capacityMinutes,
        0,
      ),
      overloadedDays: weeklyPlan.overloadedDates.length,
      underloadedDays: weeklyPlan.underloadedDates.length,
    },
  } satisfies PlannerSnapshot;
}

function getMillisecondsUntilNextDate() {
  const now = new Date();
  const nextDate = new Date(now);
  nextDate.setHours(24, 0, 1, 0);
  return Math.max(1000, nextDate.getTime() - now.getTime());
}
export function usePlannerSnapshot(referenceDate?: Date) {
  const {
    courses,
    learningItems,
    plannerSettings,
    taskDecisions,
    dayAdjustments,
    manualTaskMoves,
    lastReplanAt,
  } = useCourseContext();
  const [liveReferenceDate, setLiveReferenceDate] = useState<Date>(() => new Date());
  const effectiveReferenceDate = referenceDate ?? liveReferenceDate;
  const referenceKey = getDateKey(effectiveReferenceDate);
  const schedulableCourses = useMemo(
    () => [...courses, ...learningItems.map(learningItemToCourse)],
    [courses, learningItems],
  );
  const courseFingerprint = buildCourseFingerprint(schedulableCourses);
  const planKey = JSON.stringify({
    algorithmVersion: STABLE_PLAN_ALGORITHM_VERSION,
    referenceKey,
    weekStartKey: getWeekStartDateKey(effectiveReferenceDate),
    lastReplanAt: lastReplanAt || "",
    plannerSettings,
    dayAdjustments,
    manualTaskMoves,
    courseFingerprint,
  });

  useEffect(() => {
    if (referenceDate) {
      return;
    }

    const timerId = window.setTimeout(
      () => setLiveReferenceDate(new Date()),
      getMillisecondsUntilNextDate(),
    );

    return () => window.clearTimeout(timerId);
  }, [referenceDate, referenceKey]);

  const snapshot = useMemo(() => {
    const nextSnapshot = buildPlannerSnapshot(
      schedulableCourses,
      plannerSettings,
      taskDecisions,
      dayAdjustments,
      manualTaskMoves,
      parseDateKey(referenceKey),
    );

    if (stablePlanCache.planKey !== planKey) {
      stablePlanCache.planKey = planKey;
      stablePlanCache.weeklyPlan = nextSnapshot.weeklyPlan;
      stablePlanCache.nextWeekPlan = nextSnapshot.nextWeekPlan;
      stablePlanCache.masterPlan = nextSnapshot.masterPlan;
      stablePlanCache.planningHorizonEnd = nextSnapshot.planningHorizonEnd;
      stablePlanCache.lastDeadline = nextSnapshot.lastDeadline;
      stablePlanCache.projectedFinishByItemId = nextSnapshot.projectedFinishByItemId;
      stablePlanCache.roadmapProjectedFinishDate = nextSnapshot.roadmapProjectedFinishDate;
      stablePlanCache.unfinishedUnscheduledItemIds = nextSnapshot.unfinishedUnscheduledItemIds;
      saveStablePlanCache(stablePlanCache);
    }

    const decisionMap = new Map(
      taskDecisions.map((decision) => [decision.taskId, decision]),
    );
    const weeklyPlan = refreshWeekState(
      stablePlanCache.weeklyPlan,
      referenceKey,
      decisionMap,
    );
    const nextWeekPlan = refreshWeekState(
      stablePlanCache.nextWeekPlan,
      referenceKey,
      decisionMap,
    );
    const masterPlan = stablePlanCache.masterPlan.map((week) =>
      refreshMasterPlanWeek(week, referenceKey, decisionMap),
    );

    return refreshPriorityPlanFlags(
      {
        ...nextSnapshot,
        weeklyPlan,
        nextWeekPlan,
        masterPlan,
        planningHorizonEnd: stablePlanCache.planningHorizonEnd,
        lastDeadline: stablePlanCache.lastDeadline,
        projectedFinishByItemId: stablePlanCache.projectedFinishByItemId,
        roadmapProjectedFinishDate: stablePlanCache.roadmapProjectedFinishDate,
        unfinishedUnscheduledItemIds: stablePlanCache.unfinishedUnscheduledItemIds,
        todayPlan: summarizeTodayPlan(
          weeklyPlan.days.find((day) => day.date === referenceKey) ??
            nextWeekPlan.days.find((day) => day.date === referenceKey),
        ),
      },
      weeklyPlan,
      referenceKey,
    );
  }, [
    schedulableCourses,
    plannerSettings,
    taskDecisions,
    dayAdjustments,
    manualTaskMoves,
    referenceKey,
    planKey,
  ]);

  return {
    referenceKey,
    snapshot,
  };
}

