import {
  Course,
  DeadlineMode,
  LearningItem,
  LearningItemInput,
  LearningItemType,
  LearningUnit,
  LectureStudySession,
} from "../types";
import { addDays, getDateKey } from "./date";
import {
  clampLectureMinutes,
  clampPriority,
  clampRoadmapOrder,
  clampRoadmapPhase,
  normalizeDependencyIds,
  normalizeCourseIntensity,
  normalizeCourseRoadmapRoute,
  normalizeCourseRoadmapStatus,
  normalizeCourseRoadmapYear,
  normalizeRoadmapTrack,
  normalizeScheduleMode,
  normalizeDeadlineMode,
  normalizeScheduleCadence,
  normalizeWeeklySpacingDays,
  normalizeWeeklyTargetBlocks,
} from "./courseFactory";
import { scheduleModeForRoadmapStatus } from "./roadmapMetadata";

const DEFAULT_UNIT_MINUTES = 60;
const DEFAULT_DEADLINE_MODE: DeadlineMode = "auto";

function createId(prefix: string) {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return `${prefix}-${crypto.randomUUID()}`;
  }

  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function clampMinutes(value?: number | null) {
  if (value == null || Number.isNaN(value)) {
    return 0;
  }

  return Math.max(0, Math.round(value));
}

function normalizeStudySessions(value?: LectureStudySession[] | null) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((session) => ({
      date: session.date,
      minutes: clampMinutes(session.minutes),
    }))
    .filter((session) => session.date && session.minutes > 0)
    .sort((left, right) => left.date.localeCompare(right.date));
}

function normalizeLearningItemType(value?: string | null): LearningItemType {
  switch (value) {
    case "book":
    case "paper":
    case "roadmap":
    case "practice":
    case "project":
    case "course":
      return value;
    default:
      return "book";
  }
}

export function parseLearningUnitTitles(input: string) {
  return input
    .split(/\r?\n/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function createLearningUnit(order: number, title: string, estimatedMinutes: number): LearningUnit {
  return {
    id: createId("unit"),
    order,
    title: title.trim() || `Unit ${order}`,
    estimatedMinutes: clampLectureMinutes(estimatedMinutes || DEFAULT_UNIT_MINUTES),
    progressMinutes: 0,
    studySessions: [],
    actualMinutes: null,
    completed: false,
    notes: "",
  };
}

function normalizeLearningUnit(
  unit: LearningUnit,
  order: number,
  defaultEstimatedMinutes: number,
): LearningUnit {
  const estimatedMinutes = clampLectureMinutes(unit.estimatedMinutes ?? defaultEstimatedMinutes);
  const studySessions = normalizeStudySessions(unit.studySessions);
  const sessionMinutes = studySessions.reduce((total, session) => total + session.minutes, 0);
  const completed = Boolean(unit.completed);
  const progressMinutes = completed
    ? Math.max(estimatedMinutes, clampMinutes(unit.progressMinutes ?? sessionMinutes))
    : clampMinutes(unit.progressMinutes ?? sessionMinutes);

  return {
    ...unit,
    id: unit.id || createId("unit"),
    order,
    title: unit.title?.trim() || `Unit ${order}`,
    estimatedMinutes,
    progressMinutes,
    studySessions,
    actualMinutes: unit.actualMinutes == null ? null : clampMinutes(unit.actualMinutes),
    completed,
    completedAt: completed ? unit.completedAt || getDateKey(new Date()) : undefined,
    notes: unit.notes ?? "",
  };
}

function syncLearningUnits(
  existingUnits: LearningUnit[],
  unitTitlesText: string,
  defaultEstimatedMinutes: number,
) {
  const titles = parseLearningUnitTitles(unitTitlesText);
  const targetTitles = titles.length > 0 ? titles : existingUnits.map((unit) => unit.title);
  const finalTitles = targetTitles.length > 0 ? targetTitles : ["Unit 1"];

  return finalTitles.map((title, index) => {
    const existingUnit = existingUnits[index];
    if (!existingUnit) {
      return createLearningUnit(index + 1, title, defaultEstimatedMinutes);
    }

    return normalizeLearningUnit(
      {
        ...existingUnit,
        title,
      },
      index + 1,
      defaultEstimatedMinutes,
    );
  });
}

export function buildLearningItemFromInput(
  input: LearningItemInput,
  existing?: LearningItem,
): LearningItem {
  const now = new Date().toISOString();
  const estimatedMinutes = clampLectureMinutes(input.estimatedMinutes || DEFAULT_UNIT_MINUTES);
  const units = syncLearningUnits(existing?.units ?? [], input.unitTitlesText, estimatedMinutes);
  const roadmapTrack = normalizeRoadmapTrack(input.roadmapTrack ?? existing?.roadmapTrack);
  const roadmapPhase = clampRoadmapPhase(input.roadmapPhase ?? existing?.roadmapPhase);
  const roadmapOrder = clampRoadmapOrder(input.roadmapOrder ?? existing?.roadmapOrder);
  const roadmapStatus = normalizeCourseRoadmapStatus(
    input.roadmapStatus ?? existing?.roadmapStatus,
    input.scheduleMode ?? existing?.scheduleMode,
    roadmapPhase,
  );
  const scheduleMode = scheduleModeForRoadmapStatus(
    roadmapStatus,
    input.scheduleMode ?? existing?.scheduleMode,
  );
  const roadmapRoute = normalizeCourseRoadmapRoute(
    input.roadmapRoute ?? existing?.roadmapRoute,
    roadmapTrack,
  );
  const roadmapYear = normalizeCourseRoadmapYear(
    input.roadmapYear ?? existing?.roadmapYear,
    roadmapPhase,
  );

  return {
    id: existing?.id ?? createId("learning"),
    title: input.title.trim() || "未命名学习项",
    type: normalizeLearningItemType(input.type),
    intensity: normalizeCourseIntensity(input.intensity),
    deadline: input.deadline || getDateKey(addDays(new Date(), 30)),
    priority: clampPriority(input.priority),
    estimatedMinutes,
    progressMinutes: units.reduce((total, unit) => total + unit.progressMinutes, 0),
    dependencyIds: normalizeDependencyIds(input.dependencyIds),
    softDependencyIds: normalizeDependencyIds(input.softDependencyIds),
    roadmapId: input.roadmapId?.trim() || undefined,
    roadmapTrack,
    roadmapPhase,
    roadmapOrder,
    roadmapRoute,
    roadmapYear,
    roadmapStatus,
    scheduleMode,
    deadlineMode: normalizeDeadlineMode(
      input.deadlineMode ?? existing?.deadlineMode ?? DEFAULT_DEADLINE_MODE,
    ),
    scheduleCadence: normalizeScheduleCadence(
      input.scheduleCadence ?? existing?.scheduleCadence,
    ),
    weeklyTargetBlocks: normalizeWeeklyTargetBlocks(
      input.weeklyTargetBlocks ?? existing?.weeklyTargetBlocks,
    ),
    weeklySpacingDays: normalizeWeeklySpacingDays(
      input.weeklySpacingDays ?? existing?.weeklySpacingDays,
    ),
    notes: input.notes.trim(),
    sourceUrl: input.sourceUrl?.trim() || undefined,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
    units,
  };
}

export function makeLearningItemInputFromItem(item: LearningItem): LearningItemInput {
  return {
    title: item.title,
    type: item.type,
    intensity: item.intensity,
    deadline: item.deadline,
    priority: clampPriority(item.priority),
    estimatedMinutes: clampLectureMinutes(item.estimatedMinutes),
    dependencyIds: normalizeDependencyIds(item.dependencyIds),
    softDependencyIds: normalizeDependencyIds(item.softDependencyIds),
    roadmapId: item.roadmapId,
    roadmapTrack: normalizeRoadmapTrack(item.roadmapTrack),
    roadmapPhase: clampRoadmapPhase(item.roadmapPhase),
    roadmapOrder: clampRoadmapOrder(item.roadmapOrder),
    roadmapRoute: normalizeCourseRoadmapRoute(item.roadmapRoute, item.roadmapTrack),
    roadmapYear: normalizeCourseRoadmapYear(item.roadmapYear, item.roadmapPhase),
    roadmapStatus: normalizeCourseRoadmapStatus(
      item.roadmapStatus,
      item.scheduleMode,
      item.roadmapPhase,
    ),
    scheduleMode: normalizeScheduleMode(item.scheduleMode),
    deadlineMode: normalizeDeadlineMode(item.deadlineMode),
    scheduleCadence: normalizeScheduleCadence(item.scheduleCadence),
    weeklyTargetBlocks: normalizeWeeklyTargetBlocks(item.weeklyTargetBlocks),
    weeklySpacingDays: normalizeWeeklySpacingDays(item.weeklySpacingDays),
    notes: item.notes,
    sourceUrl: item.sourceUrl,
    unitTitlesText: item.units.map((unit) => unit.title).join("\n"),
  };
}

export function normalizeLearningItems(items: LearningItem[]) {
  return items
    .filter((item): item is LearningItem => Boolean(item?.id))
    .map((item) => {
      const estimatedMinutes = clampLectureMinutes(item.estimatedMinutes ?? DEFAULT_UNIT_MINUTES);
      const units = Array.isArray(item.units)
        ? item.units.map((unit, index) => normalizeLearningUnit(unit, index + 1, estimatedMinutes))
        : [createLearningUnit(1, "Unit 1", estimatedMinutes)];
      const now = new Date().toISOString();
      const roadmapTrack = normalizeRoadmapTrack(item.roadmapTrack);
      const roadmapPhase = clampRoadmapPhase(item.roadmapPhase);
      const roadmapOrder = clampRoadmapOrder(item.roadmapOrder);
      const roadmapStatus = normalizeCourseRoadmapStatus(
        item.roadmapStatus,
        item.scheduleMode,
        roadmapPhase,
      );
      const scheduleMode = scheduleModeForRoadmapStatus(roadmapStatus, item.scheduleMode);
      const roadmapRoute = normalizeCourseRoadmapRoute(item.roadmapRoute, roadmapTrack);
      const roadmapYear = normalizeCourseRoadmapYear(item.roadmapYear, roadmapPhase);

      return {
        ...item,
        title: item.title?.trim() || "未命名学习项",
        type: normalizeLearningItemType(item.type),
        intensity: normalizeCourseIntensity(item.intensity),
        deadline: item.deadline || getDateKey(addDays(new Date(), 30)),
        priority: clampPriority(item.priority),
        estimatedMinutes,
        progressMinutes: units.reduce((total, unit) => total + unit.progressMinutes, 0),
        dependencyIds: normalizeDependencyIds(item.dependencyIds),
        softDependencyIds: normalizeDependencyIds(item.softDependencyIds),
        roadmapId: item.roadmapId?.trim() || undefined,
        roadmapTrack,
        roadmapPhase,
        roadmapOrder,
        roadmapRoute,
        roadmapYear,
        roadmapStatus,
        scheduleMode,
        deadlineMode: normalizeDeadlineMode(item.deadlineMode),
        scheduleCadence: normalizeScheduleCadence(item.scheduleCadence),
        weeklyTargetBlocks: normalizeWeeklyTargetBlocks(item.weeklyTargetBlocks),
        weeklySpacingDays: normalizeWeeklySpacingDays(item.weeklySpacingDays),
        notes: item.notes ?? "",
        sourceUrl: item.sourceUrl?.trim() || undefined,
        createdAt: item.createdAt || now,
        updatedAt: item.updatedAt || now,
        units,
      };
    });
}

export function learningItemToCourse(item: LearningItem): Course {
  return {
    id: item.id,
    name: item.title,
    provider: item.type,
    totalUnits: item.units.length,
    lectureMinutes: item.estimatedMinutes,
    deadline: item.deadline,
    color: item.intensity === "heavy" ? "#1d4ed8" : "#0f766e",
    notes: item.notes,
    difficulty: item.priority,
    intensity: item.intensity,
    priority: item.priority,
    dependencyIds: item.dependencyIds,
    softDependencyIds: item.softDependencyIds,
    roadmapId: item.roadmapId,
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
    sourceType: "learningItem",
    learningItemType: item.type,
    sourceUrl: item.sourceUrl,
    createdAt: item.createdAt,
    updatedAt: item.updatedAt,
    lectures: item.units.map((unit) => ({
      id: unit.id,
      order: unit.order,
      title: unit.title,
      completed: unit.completed,
      completedAt: unit.completedAt,
      estimatedMinutes: unit.estimatedMinutes,
      progressMinutes: unit.progressMinutes,
      studySessions: unit.studySessions,
      actualMinutes: unit.actualMinutes ?? null,
      understanding: null,
      notes: unit.notes,
    })),
  };
}



