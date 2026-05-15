import { Course, CourseIntensity, LearningItem, UserCapacitySettings } from "../types";
import { addDays, getDateKey, parseDateKey } from "../utils/date";
import { isRoadmapActiveScheduled } from "../utils/roadmapMetadata";
import { sumStudyUnitRemainingMinutes } from "../utils/studyProgress";

export const DEADLINE_PROFILE_VERSION = "school-auto-v6";
export const DEADLINE_PROFILE_STORAGE_KEY = `study-runway:deadline-profile:${DEADLINE_PROFILE_VERSION}`;

interface DeadlineCandidate {
  id: string;
  sourceType: "course" | "learningItem";
  intensity: CourseIntensity;
  remainingMinutes: number;
  roadmapPhase: number;
  roadmapOrder: number;
  priority: number;
  dependencyIds: string[];
}

export interface DeadlineCalibrationResult {
  courses: Course[];
  learningItems: LearningItem[];
  changedCount: number;
}

function isWeekendDate(dateKey: string) {
  const day = parseDateKey(dateKey).getDay();
  return day === 0 || day === 6;
}

function getDailyCapacity(
  dateKey: string,
  settings: UserCapacitySettings,
  intensity: CourseIntensity,
) {
  if (isWeekendDate(dateKey)) {
    return intensity === "heavy" ? settings.weekendHeavyMinutes : settings.weekendLightMinutes;
  }

  return intensity === "heavy" ? settings.weekdayHeavyMinutes : settings.weekdayLightMinutes;
}

function getCourseRemainingMinutes(course: Course) {
  if (
    !isRoadmapActiveScheduled(course) ||
    course.deadlineMode !== "auto" ||
    course.scheduleCadence === "weekly"
  ) {
    return 0;
  }

  return sumStudyUnitRemainingMinutes(course.lectures.filter((lecture) => !lecture.completed));
}

function getLearningItemRemainingMinutes(item: LearningItem) {
  if (
    !isRoadmapActiveScheduled(item) ||
    item.deadlineMode !== "auto" ||
    item.scheduleCadence === "weekly"
  ) {
    return 0;
  }

  return sumStudyUnitRemainingMinutes(item.units.filter((unit) => !unit.completed));
}

function buildCandidates(courses: Course[], learningItems: LearningItem[]): DeadlineCandidate[] {
  return [
    ...courses.map((course) => ({
      id: course.id,
      sourceType: "course" as const,
      intensity: course.intensity,
      remainingMinutes: getCourseRemainingMinutes(course),
      roadmapPhase: course.roadmapPhase ?? 99,
      roadmapOrder: course.roadmapOrder ?? 999,
      priority: course.priority ?? course.difficulty ?? 3,
      dependencyIds: course.dependencyIds ?? [],
    })),
    ...learningItems.map((item) => ({
      id: item.id,
      sourceType: "learningItem" as const,
      intensity: item.intensity,
      remainingMinutes: getLearningItemRemainingMinutes(item),
      roadmapPhase: item.roadmapPhase,
      roadmapOrder: item.roadmapOrder,
      priority: item.priority,
      dependencyIds: item.dependencyIds,
    })),
  ].filter((candidate) => candidate.remainingMinutes > 0);
}

function sortCandidates(left: DeadlineCandidate, right: DeadlineCandidate) {
  const leftDependsOnRight = left.dependencyIds.includes(right.id);
  const rightDependsOnLeft = right.dependencyIds.includes(left.id);
  if (leftDependsOnRight !== rightDependsOnLeft) {
    return leftDependsOnRight ? 1 : -1;
  }

  if (left.roadmapPhase !== right.roadmapPhase) {
    return left.roadmapPhase - right.roadmapPhase;
  }
  if (left.roadmapOrder !== right.roadmapOrder) {
    return left.roadmapOrder - right.roadmapOrder;
  }
  if (left.priority !== right.priority) {
    return right.priority - left.priority;
  }

  return right.remainingMinutes - left.remainingMinutes;
}

function assignDeadline(
  remainingMinutes: number,
  cursorDateKey: string,
  remainingDayCapacity: number,
  settings: UserCapacitySettings,
  intensity: CourseIntensity,
) {
  let minutesLeft = remainingMinutes;
  let dateKey = cursorDateKey;
  let dayCapacityLeft = remainingDayCapacity;

  while (minutesLeft > 0) {
    const dailyCapacity = getDailyCapacity(dateKey, settings, intensity);
    if (dailyCapacity <= 0) {
      dateKey = getDateKey(addDays(dateKey, 1));
      dayCapacityLeft = 0;
      continue;
    }

    const availableToday = dayCapacityLeft > 0 ? dayCapacityLeft : dailyCapacity;
    const consumed = Math.min(minutesLeft, availableToday);
    minutesLeft -= consumed;
    dayCapacityLeft = availableToday - consumed;

    if (minutesLeft > 0 && dayCapacityLeft <= 0) {
      dateKey = getDateKey(addDays(dateKey, 1));
      dayCapacityLeft = 0;
    }
  }

  return {
    deadline: dateKey,
    cursorDateKey: dateKey,
    remainingDayCapacity: dayCapacityLeft,
  };
}

export function hasAppliedDeadlineProfile() {
  if (typeof window === "undefined") {
    return true;
  }

  return window.localStorage.getItem(DEADLINE_PROFILE_STORAGE_KEY) === "1";
}

export function hasAppliedDeadlineCalibrationFingerprint(fingerprint: string) {
  if (typeof window === "undefined") {
    return true;
  }

  return window.localStorage.getItem(DEADLINE_PROFILE_STORAGE_KEY) === fingerprint;
}

export function markDeadlineProfileApplied(fingerprint = "1") {
  if (typeof window === "undefined") {
    return;
  }

  try {
    window.localStorage.setItem(DEADLINE_PROFILE_STORAGE_KEY, fingerprint);
  } catch (error) {
    console.warn("Unable to persist deadline calibration profile.", error);
  }
}

function buildCourseCalibrationFingerprint(course: Course) {
  return {
    id: course.id,
    sourceType: "course",
    intensity: course.intensity,
    priority: course.priority ?? course.difficulty,
    dependencyIds: course.dependencyIds ?? [],
    softDependencyIds: course.softDependencyIds ?? [],
    roadmapTrack: course.roadmapTrack,
    roadmapPhase: course.roadmapPhase,
    roadmapOrder: course.roadmapOrder,
    roadmapRoute: course.roadmapRoute,
    roadmapYear: course.roadmapYear,
    roadmapStatus: course.roadmapStatus,
    scheduleMode: course.scheduleMode,
    deadlineMode: course.deadlineMode,
    scheduleCadence: course.scheduleCadence,
    weeklyTargetBlocks: course.weeklyTargetBlocks,
    weeklySpacingDays: course.weeklySpacingDays,
    lectures: course.lectures.map((lecture) => ({
      id: lecture.id,
      order: lecture.order,
      estimatedMinutes: lecture.estimatedMinutes,
      completed: lecture.completed,
    })),
  };
}

function buildLearningItemCalibrationFingerprint(item: LearningItem) {
  return {
    id: item.id,
    sourceType: "learningItem",
    type: item.type,
    intensity: item.intensity,
    priority: item.priority,
    dependencyIds: item.dependencyIds,
    softDependencyIds: item.softDependencyIds,
    roadmapTrack: item.roadmapTrack,
    roadmapPhase: item.roadmapPhase,
    roadmapOrder: item.roadmapOrder,
    roadmapRoute: item.roadmapRoute,
    roadmapYear: item.roadmapYear,
    roadmapStatus: item.roadmapStatus,
    scheduleMode: item.scheduleMode,
    deadlineMode: item.deadlineMode,
    scheduleCadence: item.scheduleCadence,
    weeklyTargetBlocks: item.weeklyTargetBlocks,
    weeklySpacingDays: item.weeklySpacingDays,
    units: item.units.map((unit) => ({
      id: unit.id,
      order: unit.order,
      estimatedMinutes: unit.estimatedMinutes,
      completed: unit.completed,
    })),
  };
}

export function buildDeadlineCalibrationFingerprint(
  courses: Course[],
  learningItems: LearningItem[],
  settings: UserCapacitySettings,
) {
  return JSON.stringify({
    version: DEADLINE_PROFILE_VERSION,
    settings: {
      weekdayHeavyMinutes: settings.weekdayHeavyMinutes,
      weekdayLightMinutes: settings.weekdayLightMinutes,
      weekendHeavyMinutes: settings.weekendHeavyMinutes,
      weekendLightMinutes: settings.weekendLightMinutes,
    },
    courses: courses.map(buildCourseCalibrationFingerprint),
    learningItems: learningItems.map(buildLearningItemCalibrationFingerprint),
  });
}

export function calibrateStudyDeadlines(
  courses: Course[],
  learningItems: LearningItem[],
  settings: UserCapacitySettings,
  referenceDate: Date = new Date(),
): DeadlineCalibrationResult {
  const candidates = buildCandidates(courses, learningItems).sort(sortCandidates);
  const cursors: Record<CourseIntensity, { dateKey: string; remainingCapacity: number }> = {
    heavy: { dateKey: getDateKey(referenceDate), remainingCapacity: 0 },
    light: { dateKey: getDateKey(referenceDate), remainingCapacity: 0 },
  };
  const deadlineById = new Map<string, string>();

  candidates.forEach((candidate) => {
    const cursor = cursors[candidate.intensity];
    const assignment = assignDeadline(
      candidate.remainingMinutes,
      cursor.dateKey,
      cursor.remainingCapacity,
      settings,
      candidate.intensity,
    );

    deadlineById.set(candidate.id, assignment.deadline);
    cursors[candidate.intensity] = {
      dateKey: assignment.cursorDateKey,
      remainingCapacity: assignment.remainingDayCapacity,
    };
  });

  let changedCount = 0;
  const now = new Date().toISOString();
  const nextCourses = courses.map((course) => {
    const deadline = deadlineById.get(course.id);
    if (!deadline || deadline === course.deadline) {
      return course;
    }

    changedCount += 1;
    return { ...course, deadline, updatedAt: now };
  });
  const nextLearningItems = learningItems.map((item) => {
    const deadline = deadlineById.get(item.id);
    if (!deadline || deadline === item.deadline) {
      return item;
    }

    changedCount += 1;
    return { ...item, deadline, updatedAt: now };
  });

  return {
    courses: nextCourses,
    learningItems: nextLearningItems,
    changedCount,
  };
}

