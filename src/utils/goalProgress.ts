import {
  Course,
  LearningItem,
  LearningItemType,
  LearningSourceType,
  StudyGoal,
} from "../types";
import { sumStudyUnitRemainingMinutes } from "./studyProgress";

export interface GoalLinkedItemSummary {
  id: string;
  title: string;
  type: LearningItemType;
  sourceType: LearningSourceType;
  completedUnits: number;
  totalUnits: number;
  progressMinutes: number;
  totalMinutes: number;
  remainingMinutes: number;
  progressPct: number;
  projectedFinishDate?: string;
}

export interface GoalProgressSummary {
  linkedItems: GoalLinkedItemSummary[];
  linkedProgressPct: number;
  checklistProgressPct: number;
  overallProgressPct: number;
  completedChecklistItems: number;
  totalChecklistItems: number;
  projectedFinishDate?: string;
}

function clampPct(value: number) {
  return Math.min(100, Math.max(0, Math.round(value)));
}

function calculatePct(completed: number, total: number) {
  if (total <= 0) {
    return 0;
  }

  return clampPct((completed / total) * 100);
}

function buildCourseSummary(
  course: Course,
  projectedFinishDate?: string,
): GoalLinkedItemSummary {
  const completedUnits = course.lectures.filter((lecture) => lecture.completed).length;
  const totalMinutes = course.lectures.reduce(
    (total, lecture) => total + Math.max(0, lecture.estimatedMinutes ?? 0),
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
    completedUnits,
    totalUnits: course.lectures.length,
    progressMinutes,
    totalMinutes,
    remainingMinutes: sumStudyUnitRemainingMinutes(
      course.lectures.filter((lecture) => !lecture.completed),
    ),
    progressPct: calculatePct(completedUnits, course.lectures.length),
    projectedFinishDate,
  };
}

function buildLearningItemSummary(
  item: LearningItem,
  projectedFinishDate?: string,
): GoalLinkedItemSummary {
  const completedUnits = item.units.filter((unit) => unit.completed).length;
  const totalMinutes = item.units.reduce(
    (total, unit) => total + Math.max(0, unit.estimatedMinutes ?? 0),
    0,
  );
  const progressMinutes = item.units.reduce(
    (total, unit) => total + Math.max(0, unit.progressMinutes ?? 0),
    0,
  );

  return {
    id: item.id,
    title: item.title,
    type: item.type,
    sourceType: "learningItem",
    completedUnits,
    totalUnits: item.units.length,
    progressMinutes,
    totalMinutes,
    remainingMinutes: sumStudyUnitRemainingMinutes(
      item.units.filter((unit) => !unit.completed),
    ),
    progressPct: calculatePct(completedUnits, item.units.length),
    projectedFinishDate,
  };
}

export function buildGoalItemMap(
  courses: Course[],
  learningItems: LearningItem[],
  projectedFinishByItemId: Record<string, string> = {},
) {
  const itemMap = new Map<string, GoalLinkedItemSummary>();

  courses.forEach((course) => {
    const summary = buildCourseSummary(course, projectedFinishByItemId[course.id]);
    itemMap.set(course.id, summary);
    if (course.canonicalId) {
      itemMap.set(course.canonicalId, summary);
    }
  });
  learningItems.forEach((item) => {
    itemMap.set(item.id, buildLearningItemSummary(item, projectedFinishByItemId[item.id]));
  });

  return itemMap;
}

export function calculateGoalProgress(
  goal: StudyGoal,
  itemMap: Map<string, GoalLinkedItemSummary>,
): GoalProgressSummary {
  const linkedItems = goal.linkedItemIds
    .map((itemId) => itemMap.get(itemId))
    .filter((item): item is GoalLinkedItemSummary => Boolean(item));
  const totalLinkedUnits = linkedItems.reduce((total, item) => total + item.totalUnits, 0);
  const completedLinkedUnits = linkedItems.reduce(
    (total, item) => total + item.completedUnits,
    0,
  );
  const linkedProgressPct = calculatePct(completedLinkedUnits, totalLinkedUnits);
  const totalChecklistItems = goal.checklist.length;
  const completedChecklistItems = goal.checklist.filter((item) => item.completed).length;
  const checklistProgressPct = calculatePct(completedChecklistItems, totalChecklistItems);
  const hasLinkedProgress = totalLinkedUnits > 0;
  const hasChecklistProgress = totalChecklistItems > 0;
  const overallProgressPct =
    hasLinkedProgress && hasChecklistProgress
      ? clampPct(linkedProgressPct * 0.6 + checklistProgressPct * 0.4)
      : hasLinkedProgress
        ? linkedProgressPct
        : hasChecklistProgress
          ? checklistProgressPct
          : goal.status === "completed"
            ? 100
            : 0;
  const projectedFinishDate = linkedItems
    .map((item) => item.projectedFinishDate)
    .filter((date): date is string => Boolean(date))
    .sort((left, right) => right.localeCompare(left))[0];

  return {
    linkedItems,
    linkedProgressPct,
    checklistProgressPct,
    overallProgressPct,
    completedChecklistItems,
    totalChecklistItems,
    projectedFinishDate,
  };
}

export function buildGoalsByLinkedItem(goals: StudyGoal[]) {
  const goalMap = new Map<string, StudyGoal[]>();

  goals
    .filter((goal) => goal.status !== "archived")
    .forEach((goal) => {
      goal.linkedItemIds.forEach((itemId) => {
        const currentGoals = goalMap.get(itemId) ?? [];
        currentGoals.push(goal);
        goalMap.set(itemId, currentGoals);
      });
    });

  return goalMap;
}

