import {
  Course,
  CourseIntensity,
  DeadlineMode,
  LearningItem,
  LearningItemType,
  LearningSourceType,
  PriorityScoreEntry,
  RoadmapRoute,
  RoadmapScheduleMode,
  RoadmapStatus,
  RoadmapYear,
  ScheduleCadence,
} from "../types";
import { roadmapRouteLabels, roadmapStatusLabels } from "./roadmapMetadata";
import { sumStudyUnitRemainingMinutes } from "./studyProgress";

export interface UnifiedStudyItem {
  id: string;
  title: string;
  type: LearningItemType;
  sourceType: LearningSourceType;
  provider: string;
  color: string;
  intensity: CourseIntensity;
  deadline: string;
  priority: number;
  roadmapTrack: string;
  roadmapPhase: number;
  roadmapOrder: number;
  roadmapRoute: RoadmapRoute;
  roadmapYear: RoadmapYear;
  roadmapStatus: RoadmapStatus;
  scheduleMode: RoadmapScheduleMode;
  deadlineMode: DeadlineMode;
  scheduleCadence: ScheduleCadence;
  weeklyTargetBlocks?: number;
  weeklySpacingDays?: number;
  dependencyIds: string[];
  softDependencyIds: string[];
  completedUnits: number;
  totalUnits: number;
  progressMinutes: number;
  totalMinutes: number;
  remainingMinutes: number;
  progressPct: number;
  sourceUrl?: string;
  notes: string;
  priorityEntry?: PriorityScoreEntry;
  course?: Course;
  learningItem?: LearningItem;
}

export const unifiedTypeLabels = {
  course: "课程",
  book: "书籍",
  paper: "论文",
  roadmap: "Roadmap",
  practice: "练习",
  project: "项目",
} satisfies Record<LearningItemType, string>;

export const unifiedIntensityLabels = {
  heavy: "重学习",
  light: "轻学习",
} satisfies Record<CourseIntensity, string>;

export const unifiedScheduleModeLabels = {
  scheduled: "可排课",
  reference: "不排课",
} satisfies Record<RoadmapScheduleMode, string>;

export const unifiedRoadmapRouteLabels = roadmapRouteLabels;
export const unifiedRoadmapStatusLabels = roadmapStatusLabels;

export const unifiedDeadlineModeLabels = {
  auto: "自动目标日",
  manual: "手动锁定",
} satisfies Record<DeadlineMode, string>;

export const unifiedScheduleCadenceLabels = {
  roadmap: "Roadmap",
  weekly: "每周固定",
} satisfies Record<ScheduleCadence, string>;

function clampProgressPct(completedUnits: number, totalUnits: number) {
  if (totalUnits <= 0) {
    return 0;
  }

  return Math.round((completedUnits / totalUnits) * 100);
}

function getLectureRemainingMinutes(course: Course) {
  return sumStudyUnitRemainingMinutes(course.lectures.filter((lecture) => !lecture.completed));
}

function getLearningItemRemainingMinutes(item: LearningItem) {
  return sumStudyUnitRemainingMinutes(item.units.filter((unit) => !unit.completed));
}

export function courseToUnifiedStudyItem(
  course: Course,
  priorityEntry?: PriorityScoreEntry,
): UnifiedStudyItem {
  const completedUnits = course.lectures.filter((lecture) => lecture.completed).length;
  const totalMinutes = course.lectures.reduce(
    (total, lecture) => total + lecture.estimatedMinutes,
    0,
  );
  const progressMinutes = course.lectures.reduce(
    (total, lecture) => total + Math.max(0, lecture.progressMinutes ?? 0),
    0,
  );

  return {
    id: course.id,
    title: course.name,
    type: "course",
    sourceType: "course",
    provider: course.provider,
    color: course.color,
    intensity: course.intensity,
    deadline: course.deadline,
    priority: course.priority ?? course.difficulty,
    roadmapTrack: course.roadmapTrack ?? "general",
    roadmapPhase: course.roadmapPhase ?? 99,
    roadmapOrder: course.roadmapOrder ?? 999,
    roadmapRoute: course.roadmapRoute ?? "foundation",
    roadmapYear: course.roadmapYear ?? 1,
    roadmapStatus: course.roadmapStatus ?? "backlog",
    scheduleMode: course.scheduleMode ?? "scheduled",
    deadlineMode: course.deadlineMode ?? "manual",
    scheduleCadence: course.scheduleCadence ?? "roadmap",
    weeklyTargetBlocks: course.weeklyTargetBlocks,
    weeklySpacingDays: course.weeklySpacingDays,
    dependencyIds: course.dependencyIds ?? [],
    softDependencyIds: course.softDependencyIds ?? [],
    completedUnits,
    totalUnits: course.lectures.length,
    progressMinutes,
    totalMinutes,
    remainingMinutes: getLectureRemainingMinutes(course),
    progressPct: clampProgressPct(completedUnits, course.lectures.length),
    sourceUrl: course.sourceUrl,
    notes: course.notes,
    priorityEntry,
    course,
  };
}

export function learningItemToUnifiedStudyItem(
  item: LearningItem,
  priorityEntry?: PriorityScoreEntry,
): UnifiedStudyItem {
  const completedUnits = item.units.filter((unit) => unit.completed).length;
  const totalMinutes = item.units.reduce((total, unit) => total + unit.estimatedMinutes, 0);
  const progressMinutes = item.units.reduce(
    (total, unit) => total + Math.max(0, unit.progressMinutes ?? 0),
    0,
  );

  return {
    id: item.id,
    title: item.title,
    type: item.type,
    sourceType: "learningItem",
    provider: item.type,
    color: item.intensity === "heavy" ? "#1d4ed8" : "#0f766e",
    intensity: item.intensity,
    deadline: item.deadline,
    priority: item.priority,
    roadmapTrack: item.roadmapTrack,
    roadmapPhase: item.roadmapPhase,
    roadmapOrder: item.roadmapOrder,
    roadmapRoute: item.roadmapRoute,
    roadmapYear: item.roadmapYear,
    roadmapStatus: item.roadmapStatus,
    scheduleMode: item.scheduleMode,
    deadlineMode: item.deadlineMode ?? "manual",
    scheduleCadence: item.scheduleCadence ?? "roadmap",
    weeklyTargetBlocks: item.weeklyTargetBlocks,
    weeklySpacingDays: item.weeklySpacingDays,
    dependencyIds: item.dependencyIds,
    softDependencyIds: item.softDependencyIds,
    completedUnits,
    totalUnits: item.units.length,
    progressMinutes,
    totalMinutes,
    remainingMinutes: getLearningItemRemainingMinutes(item),
    progressPct: clampProgressPct(completedUnits, item.units.length),
    sourceUrl: item.sourceUrl,
    notes: item.notes,
    priorityEntry,
    learningItem: item,
  };
}

export function buildUnifiedStudyItems(
  courses: Course[],
  learningItems: LearningItem[],
  priorityRanking: PriorityScoreEntry[] = [],
) {
  const priorityMap = new Map(priorityRanking.map((entry) => [entry.courseId, entry]));

  return [
    ...courses.map((course) => courseToUnifiedStudyItem(course, priorityMap.get(course.id))),
    ...learningItems.map((item) => learningItemToUnifiedStudyItem(item, priorityMap.get(item.id))),
  ].sort((left, right) => {
    if (left.scheduleCadence !== right.scheduleCadence) {
      return left.scheduleCadence === "weekly" ? -1 : 1;
    }
    if (left.roadmapPhase !== right.roadmapPhase) {
      return left.roadmapPhase - right.roadmapPhase;
    }
    if (left.roadmapOrder !== right.roadmapOrder) {
      return left.roadmapOrder - right.roadmapOrder;
    }
    if (left.roadmapStatus !== right.roadmapStatus) {
      const statusOrder: Record<RoadmapStatus, number> = {
        active: 0,
        backlog: 1,
        reference: 2,
        archived: 3,
      };
      return statusOrder[left.roadmapStatus] - statusOrder[right.roadmapStatus];
    }
    if (left.scheduleMode !== right.scheduleMode) {
      return left.scheduleMode === "scheduled" ? -1 : 1;
    }
    return right.priority - left.priority;
  });
}

export function getUnifiedStudyItemPath(item: Pick<UnifiedStudyItem, "id" | "sourceType">) {
  return item.sourceType === "learningItem" ? `/learning-items/${item.id}` : `/courses/${item.id}`;
}

