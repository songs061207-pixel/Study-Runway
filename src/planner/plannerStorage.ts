import {
  LearningSourceType,
  ManualTaskMove,
  PlannerStorageState,
  ScheduleFillMode,
  StudyActionType,
  StudyTaskDecision,
  UserCapacitySettings,
} from "../types";

const PLANNER_STORAGE_KEY = "study-runway:planner:v5";
const LEGACY_PLANNER_STORAGE_KEY = "study-runway:planner:v2";
const PREVIOUS_PLANNER_STORAGE_KEY = "study-runway:planner:v4";
const OLDER_PREVIOUS_PLANNER_STORAGE_KEY = "study-runway:planner:v3";
const LEGACY_WEEKEND_HEAVY_MINUTES = 240;
const LEGACY_WEEKEND_LIGHT_MINUTES = 120;
const LEGACY_WEEKDAY_LIGHT_MINUTES = 120;
const LEGACY_WEEKDAY_HEAVY_SLOT_COUNT = 3;
const LEGACY_WEEKDAY_LIGHT_SLOT_COUNT = 2;
const PREVIOUS_DEFAULT_WEEKEND_TOTAL_MINUTES = 220;
const PREVIOUS_DEFAULT_WEEKEND_HEAVY_MINUTES = 160;

export const DEFAULT_CAPACITY_SETTINGS: UserCapacitySettings = {
  weekdayMinutes: 300,
  weekendMinutes: 300,
  weekdayHeavyMinutes: 240,
  weekdayLightMinutes: 60,
  weekendHeavyMinutes: 240,
  weekendLightMinutes: 60,
  heavyCoursesPerDay: 2,
  lightCoursesPerDay: 1,
  weekendHeavyCoursesPerDay: 2,
  weekendLightCoursesPerDay: 1,
  maxCoursesPerDay: 2,
  scheduleFillMode: "school",
  bufferRatio: 0.8,
  prioritizeHighRisk: true,
};

export interface PlannerStateSnapshot {
  settings: UserCapacitySettings;
  taskDecisions: StudyTaskDecision[];
  dayAdjustments: Record<string, number>;
  manualTaskMoves: ManualTaskMove[];
  lastReplanAt?: string;
}

function isPlannerStorageState(value: unknown): value is PlannerStorageState {
  if (!value || typeof value !== "object") {
    return false;
  }

  const candidate = value as PlannerStorageState;
  return (
    candidate.version === 1 &&
    typeof candidate.settings === "object" &&
    Array.isArray(candidate.taskDecisions) &&
    typeof candidate.dayAdjustments === "object" &&
    candidate.dayAdjustments !== null
  );
}

function normalizeCapacityMinutes(value: number | undefined, fallback: number) {
  return Math.max(0, Math.round(value ?? fallback));
}

function normalizeSlotCount(value: number | undefined, fallback: number) {
  return Math.min(5, Math.max(1, Math.round(value ?? fallback)));
}

function normalizeScheduleFillMode(value?: ScheduleFillMode | string | null): ScheduleFillMode {
  return value === "deadline" ? "deadline" : "school";
}

function normalizeSourceType(value?: LearningSourceType | string): LearningSourceType | undefined {
  if (value === "course" || value === "learningItem") {
    return value;
  }

  return undefined;
}

function normalizeActionType(value?: StudyActionType | string): StudyActionType | undefined {
  if (
    value === "watch" ||
    value === "read" ||
    value === "practice" ||
    value === "build" ||
    value === "reference"
  ) {
    return value;
  }

  return undefined;
}

function normalizeStringList(values?: string[]) {
  return Array.from(new Set((values ?? []).filter((value) => typeof value === "string" && value)));
}

export function normalizePlannerSettings(
  settings?: Partial<UserCapacitySettings>,
  options?: { migrateLegacyWeekdayDefaults?: boolean },
): UserCapacitySettings {
  const hasWeekendSlotSettings =
    settings?.weekendHeavyCoursesPerDay != null ||
    settings?.weekendLightCoursesPerDay != null;
  const shouldMigrateLegacyWeekdayDefaults =
    options?.migrateLegacyWeekdayDefaults === true &&
    settings?.weekdayHeavyMinutes === DEFAULT_CAPACITY_SETTINGS.weekdayHeavyMinutes &&
    settings?.weekdayLightMinutes === LEGACY_WEEKDAY_LIGHT_MINUTES &&
    settings?.heavyCoursesPerDay === LEGACY_WEEKDAY_HEAVY_SLOT_COUNT &&
    settings?.lightCoursesPerDay === LEGACY_WEEKDAY_LIGHT_SLOT_COUNT;
  const weekdayHeavyMinutes = normalizeCapacityMinutes(
    settings?.weekdayHeavyMinutes,
    DEFAULT_CAPACITY_SETTINGS.weekdayHeavyMinutes,
  );
  const weekdayLightMinutes = normalizeCapacityMinutes(
    shouldMigrateLegacyWeekdayDefaults ? undefined : settings?.weekdayLightMinutes,
    DEFAULT_CAPACITY_SETTINGS.weekdayLightMinutes,
  );
  const rawWeekendHeavyMinutes = settings?.weekendHeavyMinutes;
  const rawWeekendLightMinutes = settings?.weekendLightMinutes;
  const shouldMigratePreviousWeekendDefaults =
    (settings?.weekendMinutes == null ||
      settings.weekendMinutes === PREVIOUS_DEFAULT_WEEKEND_TOTAL_MINUTES) &&
    rawWeekendHeavyMinutes === PREVIOUS_DEFAULT_WEEKEND_HEAVY_MINUTES &&
    rawWeekendLightMinutes === DEFAULT_CAPACITY_SETTINGS.weekendLightMinutes &&
    settings?.weekendHeavyCoursesPerDay === DEFAULT_CAPACITY_SETTINGS.weekendHeavyCoursesPerDay &&
    settings?.weekendLightCoursesPerDay === DEFAULT_CAPACITY_SETTINGS.weekendLightCoursesPerDay;
  const weekendHeavyMinutes = normalizeCapacityMinutes(
    shouldMigratePreviousWeekendDefaults ||
      (!hasWeekendSlotSettings && rawWeekendHeavyMinutes === LEGACY_WEEKEND_HEAVY_MINUTES)
      ? undefined
      : rawWeekendHeavyMinutes,
    DEFAULT_CAPACITY_SETTINGS.weekendHeavyMinutes,
  );
  const weekendLightMinutes = normalizeCapacityMinutes(
    !hasWeekendSlotSettings && rawWeekendLightMinutes === LEGACY_WEEKEND_LIGHT_MINUTES
      ? undefined
      : rawWeekendLightMinutes,
    DEFAULT_CAPACITY_SETTINGS.weekendLightMinutes,
  );
  const heavyCoursesPerDay = normalizeSlotCount(
    shouldMigrateLegacyWeekdayDefaults ? undefined : settings?.heavyCoursesPerDay,
    DEFAULT_CAPACITY_SETTINGS.heavyCoursesPerDay,
  );
  const lightCoursesPerDay = normalizeSlotCount(
    shouldMigrateLegacyWeekdayDefaults ? undefined : settings?.lightCoursesPerDay,
    DEFAULT_CAPACITY_SETTINGS.lightCoursesPerDay,
  );
  const weekendHeavyCoursesPerDay = normalizeSlotCount(
    settings?.weekendHeavyCoursesPerDay,
    DEFAULT_CAPACITY_SETTINGS.weekendHeavyCoursesPerDay,
  );
  const weekendLightCoursesPerDay = normalizeSlotCount(
    settings?.weekendLightCoursesPerDay,
    DEFAULT_CAPACITY_SETTINGS.weekendLightCoursesPerDay,
  );

  return {
    weekdayMinutes: weekdayHeavyMinutes + weekdayLightMinutes,
    weekendMinutes: weekendHeavyMinutes + weekendLightMinutes,
    weekdayHeavyMinutes,
    weekdayLightMinutes,
    weekendHeavyMinutes,
    weekendLightMinutes,
    heavyCoursesPerDay,
    lightCoursesPerDay,
    weekendHeavyCoursesPerDay,
    weekendLightCoursesPerDay,
    maxCoursesPerDay: Math.min(
      5,
      Math.max(
        1,
        Math.round(
          (shouldMigrateLegacyWeekdayDefaults ? undefined : settings?.maxCoursesPerDay) ??
            heavyCoursesPerDay,
        ),
      ),
    ),
    scheduleFillMode: normalizeScheduleFillMode(settings?.scheduleFillMode),
    bufferRatio: Math.min(
      1,
      Math.max(0.5, Number(settings?.bufferRatio ?? DEFAULT_CAPACITY_SETTINGS.bufferRatio)),
    ),
    prioritizeHighRisk:
      settings?.prioritizeHighRisk ?? DEFAULT_CAPACITY_SETTINGS.prioritizeHighRisk,
  };
}

function normalizeDecision(decision: StudyTaskDecision): StudyTaskDecision {
  return {
    taskId: decision.taskId,
    courseId: decision.courseId,
    itemId: decision.itemId || undefined,
    sourceType: normalizeSourceType(decision.sourceType),
    unitIds: normalizeStringList(decision.unitIds),
    actionType: normalizeActionType(decision.actionType),
    date: decision.date,
    status: decision.status,
    decidedAt: decision.decidedAt,
    unitCount: Math.max(0, Math.round(decision.unitCount || 0)),
    estimatedMinutes: Math.max(0, Math.round(decision.estimatedMinutes || 0)),
    actualMinutes:
      decision.actualMinutes == null
        ? undefined
        : Math.max(0, Math.round(decision.actualMinutes || 0)),
  };
}

function normalizeTaskMove(taskMove: ManualTaskMove): ManualTaskMove {
  return {
    id: taskMove.id,
    courseId: taskMove.courseId,
    itemId: taskMove.itemId || undefined,
    sourceType: normalizeSourceType(taskMove.sourceType),
    unitIds: normalizeStringList(taskMove.unitIds),
    actionType: normalizeActionType(taskMove.actionType),
    sourceDate: taskMove.sourceDate,
    targetDate: taskMove.targetDate,
    lectureIds: normalizeStringList(taskMove.lectureIds),
    lectureTitles: normalizeStringList(taskMove.lectureTitles),
    studyBlockCount: Math.max(0, Math.round(taskMove.studyBlockCount ?? 0)),
    slotCount: Math.max(1, Math.round(taskMove.slotCount ?? 1)),
    estimatedMinutes: Math.max(0, Math.round(taskMove.estimatedMinutes ?? 0)),
    segments: Array.isArray(taskMove.segments)
      ? taskMove.segments
          .map((segment) => ({
            lectureId: segment.lectureId,
            lectureTitle: segment.lectureTitle,
            minutes: Math.max(0, Math.round(segment.minutes ?? 0)),
            startMinute:
              segment.startMinute == null
                ? undefined
                : Math.max(0, Math.round(segment.startMinute)),
            endMinute:
              segment.endMinute == null
                ? undefined
                : Math.max(0, Math.round(segment.endMinute)),
          }))
          .filter((segment) => segment.lectureId && segment.minutes > 0)
      : [],
    createdAt: taskMove.createdAt,
  };
}

function createDefaultPlannerState(): PlannerStateSnapshot {
  return {
    settings: DEFAULT_CAPACITY_SETTINGS,
    taskDecisions: [],
    dayAdjustments: {},
    manualTaskMoves: [],
  };
}

function readPlannerState(rawValue: string | null) {
  if (!rawValue) {
    return null;
  }

  const parsedValue = JSON.parse(rawValue);
  if (!isPlannerStorageState(parsedValue)) {
    return null;
  }

  return parsedValue;
}

function normalizePlannerState(
  state: PlannerStorageState,
  options?: { dropManualTaskMoves?: boolean; migrateLegacyWeekdayDefaults?: boolean },
): PlannerStateSnapshot {
  return {
    settings: normalizePlannerSettings(state.settings, {
      migrateLegacyWeekdayDefaults: options?.migrateLegacyWeekdayDefaults,
    }),
    taskDecisions: state.taskDecisions.map(normalizeDecision),
    dayAdjustments: Object.fromEntries(
      Object.entries(state.dayAdjustments).map(([date, level]) => [
        date,
        Math.min(1, Math.max(-1, Math.round(Number(level) || 0))),
      ]),
    ),
    manualTaskMoves: options?.dropManualTaskMoves
      ? []
      : (state.manualTaskMoves ?? []).map(normalizeTaskMove),
    lastReplanAt: state.lastReplanAt,
  };
}

export function loadPlannerStateFromStorage(): PlannerStateSnapshot {
  if (typeof window === "undefined") {
    return createDefaultPlannerState();
  }

  try {
    const currentState = readPlannerState(window.localStorage.getItem(PLANNER_STORAGE_KEY));
    if (currentState) {
      return normalizePlannerState(currentState);
    }

    const previousState = readPlannerState(window.localStorage.getItem(PREVIOUS_PLANNER_STORAGE_KEY));
    if (previousState) {
      return normalizePlannerState(previousState, { migrateLegacyWeekdayDefaults: true });
    }

    const olderPreviousState = readPlannerState(
      window.localStorage.getItem(OLDER_PREVIOUS_PLANNER_STORAGE_KEY),
    );
    if (olderPreviousState) {
      return normalizePlannerState(olderPreviousState, { migrateLegacyWeekdayDefaults: true });
    }

    const legacyState = readPlannerState(window.localStorage.getItem(LEGACY_PLANNER_STORAGE_KEY));
    if (legacyState) {
      // The scheduling model changed from fragmented slices to whole blocks, so legacy manual moves
      // can preserve stale 30/50-minute segments. Keep decisions/settings, but rebuild moves fresh.
      return normalizePlannerState(legacyState, {
        dropManualTaskMoves: true,
        migrateLegacyWeekdayDefaults: true,
      });
    }
  } catch {
    return createDefaultPlannerState();
  }

  return createDefaultPlannerState();
}

export function savePlannerStateToStorage(state: PlannerStateSnapshot) {
  if (typeof window === "undefined") {
    return;
  }

  const payload: PlannerStorageState = {
    version: 1,
    updatedAt: new Date().toISOString(),
    settings: normalizePlannerSettings(state.settings),
    taskDecisions: state.taskDecisions.map(normalizeDecision),
    dayAdjustments: state.dayAdjustments,
    manualTaskMoves: state.manualTaskMoves.map(normalizeTaskMove),
    lastReplanAt: state.lastReplanAt,
  };

  try {
    window.localStorage.setItem(PLANNER_STORAGE_KEY, JSON.stringify(payload));
    window.localStorage.removeItem(PREVIOUS_PLANNER_STORAGE_KEY);
    window.localStorage.removeItem(OLDER_PREVIOUS_PLANNER_STORAGE_KEY);
    window.localStorage.removeItem(LEGACY_PLANNER_STORAGE_KEY);
  } catch (error) {
    console.warn("Unable to persist planner state to localStorage.", error);
  }
}
