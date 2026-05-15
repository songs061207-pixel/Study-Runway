import { addDays, getDateKey } from "./date";
import {
  Course,
  CourseIntensity,
  CourseInput,
  CourseSyllabusSyncPreview,
  DeadlineMode,
  Lecture,
  LectureStudySession,
  RoadmapRoute,
  RoadmapScheduleMode,
  RoadmapStatus,
  RoadmapYear,
  ScheduleCadence,
} from "../types";
import { getCourseCatalogEntryForSourceUrl } from "../catalog/courseCatalog";
import { getCourseImportPreset } from "../data/importPresets";
import { MAX_STUDY_UNIT_MINUTES } from "./studyLimits";
import {
  inferRoadmapRouteFromTrack,
  normalizeRoadmapRoute,
  normalizeRoadmapStatus,
  normalizeRoadmapYear,
  scheduleModeForRoadmapStatus,
} from "./roadmapMetadata";

const DEFAULT_COLOR = "#0f766e";
const DEFAULT_ESTIMATED_MINUTES = 60;
const DEFAULT_DIFFICULTY = 3;
const DEFAULT_INTENSITY: CourseIntensity = "heavy";
const DEFAULT_PRIORITY = 3;
const DEFAULT_ROADMAP_TRACK = "general";
const DEFAULT_ROADMAP_PHASE = 99;
const DEFAULT_ROADMAP_ORDER = 999;
const DEFAULT_SCHEDULE_MODE: RoadmapScheduleMode = "scheduled";
const DEFAULT_DEADLINE_MODE: DeadlineMode = "auto";

function createId(prefix: string) {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return `${prefix}-${crypto.randomUUID()}`;
  }

  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function clampUnderstanding(value?: number | null) {
  if (value == null || Number.isNaN(value)) {
    return null;
  }

  return Math.min(5, Math.max(1, Math.round(value)));
}

function clampMinutes(value?: number | null) {
  if (value == null || Number.isNaN(value)) {
    return 0;
  }

  return Math.max(0, Math.round(value));
}

export function normalizeCourseIntensity(value?: CourseIntensity | string | null): CourseIntensity {
  return value === "light" ? "light" : DEFAULT_INTENSITY;
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

function clampProgressMinutes(
  progressMinutes: number,
  estimatedMinutes: number,
  completed: boolean,
) {
  const roundedProgressMinutes = Math.max(0, Math.round(progressMinutes));

  if (completed) {
    return Math.max(estimatedMinutes, roundedProgressMinutes);
  }

  return roundedProgressMinutes;
}

export function clampLectureMinutes(value?: number | null) {
  if (value == null || Number.isNaN(value)) {
    return DEFAULT_ESTIMATED_MINUTES;
  }

  return Math.min(MAX_STUDY_UNIT_MINUTES, Math.max(1, Math.round(value)));
}

function normalizeComparableTitle(value?: string) {
  return (value ?? "")
    .replace(/\u2013/g, "-")
    .replace(/\u00a0/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function normalizeLectureFromExisting(
  lecture: Lecture,
  order: number,
  title: string,
  defaultLectureMinutes: number,
): Lecture {
  const estimatedMinutes = clampLectureMinutes(
    lecture.estimatedMinutes ?? defaultLectureMinutes,
  );
  const completed = Boolean(lecture.completed);
  const studySessions = normalizeStudySessions(lecture.studySessions);
  const progressMinutes = clampProgressMinutes(
    lecture.progressMinutes ?? studySessions.reduce((total, session) => total + session.minutes, 0),
    estimatedMinutes,
    completed,
  );

  return {
    ...lecture,
    order,
    title,
    estimatedMinutes,
    progressMinutes,
    studySessions,
    actualMinutes:
      lecture.actualMinutes == null ? null : Math.max(0, Number(lecture.actualMinutes) || 0),
    understanding: clampUnderstanding(lecture.understanding),
    notes: lecture.notes ?? "",
    completed,
    completedAt: completed ? lecture.completedAt || getDateKey(new Date()) : undefined,
  };
}

function buildCanonicalLectureSet(
  existingLectures: Lecture[],
  lectureTitles: string[],
  defaultLectureMinutes: number,
) {
  const exactMatchBuckets = new Map<string, Lecture[]>();
  const remainingLectures = [...existingLectures];
  const usedLectureIds = new Set<string>();
  let matchedByTitle = 0;

  remainingLectures.forEach((lecture) => {
    const key = normalizeComparableTitle(lecture.title);
    const bucket = exactMatchBuckets.get(key) ?? [];
    bucket.push(lecture);
    exactMatchBuckets.set(key, bucket);
  });

  function takeExactMatch(title: string) {
    const key = normalizeComparableTitle(title);
    const bucket = exactMatchBuckets.get(key);
    if (!bucket?.length) {
      return null;
    }

    while (bucket.length > 0) {
      const nextLecture = bucket.shift();
      if (nextLecture && !usedLectureIds.has(nextLecture.id)) {
        usedLectureIds.add(nextLecture.id);
        matchedByTitle += 1;
        return nextLecture;
      }
    }

    return null;
  }

  function takeFallbackLecture(index: number) {
    const indexedLecture = remainingLectures[index];
    if (indexedLecture && !usedLectureIds.has(indexedLecture.id)) {
      usedLectureIds.add(indexedLecture.id);
      return indexedLecture;
    }

    const nextUnusedLecture = remainingLectures.find(
      (lecture) => !usedLectureIds.has(lecture.id),
    );

    if (nextUnusedLecture) {
      usedLectureIds.add(nextUnusedLecture.id);
      return nextUnusedLecture;
    }

    return null;
  }

  const lectures = lectureTitles.map((title, index) => {
    const matchedLecture = takeExactMatch(title) ?? takeFallbackLecture(index);
    if (!matchedLecture) {
      return createLectureWithMinutes(index + 1, defaultLectureMinutes, title);
    }

    return normalizeLectureFromExisting(
      matchedLecture,
      index + 1,
      title,
      defaultLectureMinutes,
    );
  });

  return {
    lectures,
    matchedByTitle,
  };
}

export function clampDifficulty(value?: number | null) {
  if (value == null || Number.isNaN(value)) {
    return DEFAULT_DIFFICULTY;
  }

  return Math.min(5, Math.max(1, Math.round(value)));
}

export function clampPriority(value?: number | null) {
  if (value == null || Number.isNaN(value)) {
    return DEFAULT_PRIORITY;
  }

  return Math.min(5, Math.max(1, Math.round(value)));
}

export function normalizeDependencyIds(value?: string[] | null) {
  if (!Array.isArray(value)) {
    return [];
  }

  return Array.from(new Set(value.map((item) => item.trim()).filter(Boolean)));
}

export function normalizeScheduleMode(value?: RoadmapScheduleMode | string | null): RoadmapScheduleMode {
  return value === "reference" ? "reference" : DEFAULT_SCHEDULE_MODE;
}

export function normalizeDeadlineMode(value?: DeadlineMode | string | null): DeadlineMode {
  return value === "manual" ? "manual" : DEFAULT_DEADLINE_MODE;
}

export function normalizeScheduleCadence(value?: ScheduleCadence | string | null): ScheduleCadence {
  return value === "weekly" ? "weekly" : "roadmap";
}

export function normalizeWeeklyTargetBlocks(value?: number | null) {
  if (value == null || Number.isNaN(value)) {
    return undefined;
  }

  const normalizedValue = Math.round(value);
  if (normalizedValue <= 0) {
    return undefined;
  }

  return Math.min(14, normalizedValue);
}

export function normalizeWeeklySpacingDays(value?: number | null) {
  if (value == null || Number.isNaN(value)) {
    return undefined;
  }

  return Math.min(6, Math.max(0, Math.round(value)));
}

export function normalizeRoadmapTrack(value?: string | null) {
  return value?.trim() || DEFAULT_ROADMAP_TRACK;
}

export function normalizeCourseRoadmapRoute(
  value?: RoadmapRoute | string | null,
  track?: string | null,
): RoadmapRoute {
  return normalizeRoadmapRoute(value ?? inferRoadmapRouteFromTrack(track));
}

export function normalizeCourseRoadmapYear(
  value?: RoadmapYear | number | null,
  phase?: number | null,
): RoadmapYear {
  return normalizeRoadmapYear(value, phase);
}

export function normalizeCourseRoadmapStatus(
  value?: RoadmapStatus | string | null,
  scheduleMode?: RoadmapScheduleMode | string | null,
  phase?: number | null,
): RoadmapStatus {
  return normalizeRoadmapStatus(value, scheduleMode, phase);
}

export function clampRoadmapPhase(value?: number | null) {
  if (value == null || Number.isNaN(value)) {
    return DEFAULT_ROADMAP_PHASE;
  }

  return Math.min(99, Math.max(0, Math.round(value)));
}

export function clampRoadmapOrder(value?: number | null) {
  if (value == null || Number.isNaN(value)) {
    return DEFAULT_ROADMAP_ORDER;
  }

  return Math.min(9999, Math.max(0, Math.round(value)));
}

function getPresetRoadmapDefaults(sourceUrl?: string) {
  if (!sourceUrl) {
    return null;
  }

  try {
    const catalogEntry = getCourseCatalogEntryForSourceUrl(sourceUrl);
    const preset = getCourseImportPreset(new URL(sourceUrl));
    if (!preset) {
      return catalogEntry
        ? {
            canonicalId: catalogEntry.canonicalId,
            roadmapTrack: undefined,
            roadmapPhase: undefined,
            roadmapOrder: undefined,
            scheduleMode: undefined,
          }
        : null;
    }

    return {
      canonicalId: catalogEntry?.canonicalId,
      roadmapTrack: preset.roadmapTrack,
      roadmapPhase: preset.roadmapPhase,
      roadmapOrder: preset.roadmapOrder,
      roadmapRoute: preset.roadmapRoute,
      roadmapYear: preset.roadmapYear,
      roadmapStatus: preset.roadmapStatus,
      scheduleMode: preset.scheduleMode,
    };
  } catch {
    return null;
  }
}

export function createEmptyLecture(order: number, title?: string): Lecture {
  return {
    id: createId("lecture"),
    order,
    title: title?.trim() || `Lecture ${order}`,
    completed: false,
    estimatedMinutes: DEFAULT_ESTIMATED_MINUTES,
    progressMinutes: 0,
    studySessions: [],
    actualMinutes: null,
    understanding: null,
    notes: "",
  };
}

export function createLectureWithMinutes(
  order: number,
  lectureMinutes: number,
  title?: string,
) {
  return {
    ...createEmptyLecture(order, title),
    estimatedMinutes: clampLectureMinutes(lectureMinutes),
  } satisfies Lecture;
}

export function parseLectureTitles(input: string) {
  return input
    .split(/\r?\n/)
    .map((item) => item.trim())
    .filter(Boolean);
}

export function syncLectures(
  existingLectures: Lecture[],
  totalUnits: number,
  lectureTitlesText: string,
  defaultLectureMinutes: number,
) {
  const providedTitles = parseLectureTitles(lectureTitlesText);

  return Array.from({ length: totalUnits }, (_, index) => {
    const existingLecture = existingLectures[index];
    const title = providedTitles[index] || existingLecture?.title || `Lecture ${index + 1}`;

    if (!existingLecture) {
      return createLectureWithMinutes(index + 1, defaultLectureMinutes, title);
    }

    return normalizeLectureFromExisting(
      existingLecture,
      index + 1,
      title,
      defaultLectureMinutes,
    );
  });
}

function canApplyUpdatedDefaultMinutes(
  lecture: Lecture,
  previousLectureMinutes: number,
) {
  const hasRecordedStudy =
    lecture.completed ||
    Boolean(lecture.completedAt) ||
    (lecture.progressMinutes ?? 0) > 0 ||
    (lecture.studySessions ?? []).length > 0 ||
    (lecture.actualMinutes ?? 0) > 0;

  return !hasRecordedStudy && lecture.estimatedMinutes === previousLectureMinutes;
}

function applyUpdatedDefaultMinutesToUnstartedLectures(
  lectures: Lecture[],
  previousLectureMinutes: number,
  nextLectureMinutes: number,
) {
  return lectures.map((lecture) =>
    canApplyUpdatedDefaultMinutes(lecture, previousLectureMinutes)
      ? { ...lecture, estimatedMinutes: nextLectureMinutes }
      : lecture,
  );
}

export function buildCourseFromInput(input: CourseInput, existing?: Course): Course {
  const now = new Date().toISOString();
  const sourceUrl = input.sourceUrl?.trim() || existing?.sourceUrl;
  const roadmapDefaults = getPresetRoadmapDefaults(sourceUrl);
  const totalUnits = Math.max(1, Number(input.totalUnits) || 1);
  const lectureMinutes = clampLectureMinutes(
    input.lectureMinutes ??
      existing?.lectureMinutes ??
      existing?.lectures[0]?.estimatedMinutes ??
      DEFAULT_ESTIMATED_MINUTES,
  );
  const previousLectureMinutes = existing
    ? clampLectureMinutes(
        existing.lectureMinutes ??
          existing.lectures[0]?.estimatedMinutes ??
          DEFAULT_ESTIMATED_MINUTES,
      )
    : lectureMinutes;
  const existingLectures =
    existing && previousLectureMinutes !== lectureMinutes
      ? applyUpdatedDefaultMinutesToUnstartedLectures(
          existing.lectures,
          previousLectureMinutes,
          lectureMinutes,
        )
      : existing?.lectures ?? [];
  const roadmapTrack = normalizeRoadmapTrack(
    input.roadmapTrack ?? existing?.roadmapTrack ?? roadmapDefaults?.roadmapTrack,
  );
  const roadmapPhase = clampRoadmapPhase(
    input.roadmapPhase ?? existing?.roadmapPhase ?? roadmapDefaults?.roadmapPhase,
  );
  const roadmapOrder = clampRoadmapOrder(
    input.roadmapOrder ?? existing?.roadmapOrder ?? roadmapDefaults?.roadmapOrder,
  );
  const roadmapStatus = normalizeCourseRoadmapStatus(
    input.roadmapStatus ?? existing?.roadmapStatus ?? roadmapDefaults?.roadmapStatus,
    input.scheduleMode ?? existing?.scheduleMode ?? roadmapDefaults?.scheduleMode,
    roadmapPhase,
  );
  const scheduleMode = scheduleModeForRoadmapStatus(
    roadmapStatus,
    input.scheduleMode ?? existing?.scheduleMode ?? roadmapDefaults?.scheduleMode,
  );
  const roadmapRoute = normalizeCourseRoadmapRoute(
    input.roadmapRoute ?? existing?.roadmapRoute ?? roadmapDefaults?.roadmapRoute,
    roadmapTrack,
  );
  const roadmapYear = normalizeCourseRoadmapYear(
    input.roadmapYear ?? existing?.roadmapYear ?? roadmapDefaults?.roadmapYear,
    roadmapPhase,
  );

  return {
    id: existing?.id ?? createId("course"),
    canonicalId:
      input.canonicalId?.trim() ||
      existing?.canonicalId ||
      roadmapDefaults?.canonicalId ||
      undefined,
    name: input.name.trim() || "Untitled Course",
    provider: input.provider.trim() || "Unknown",
    totalUnits,
    lectureMinutes,
    deadline: input.deadline || getDateKey(addDays(new Date(), 30)),
    color: input.color || existing?.color || DEFAULT_COLOR,
    notes: input.notes.trim(),
    difficulty: clampDifficulty(input.difficulty ?? existing?.difficulty),
    intensity: normalizeCourseIntensity(input.intensity ?? existing?.intensity),
    priority: clampPriority(input.priority ?? existing?.priority),
    dependencyIds: normalizeDependencyIds(input.dependencyIds ?? existing?.dependencyIds),
    softDependencyIds: normalizeDependencyIds(
      input.softDependencyIds ?? existing?.softDependencyIds,
    ),
    roadmapId: input.roadmapId?.trim() || existing?.roadmapId || undefined,
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
    sourceType: "course",
    learningItemType: "course",
    sourceUrl: sourceUrl || undefined,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
    lectures: syncLectures(
      existingLectures,
      totalUnits,
      input.lectureTitlesText,
      lectureMinutes,
    ),
  };
}

export function getCanonicalSyllabusPreview(
  course: Course,
): CourseSyllabusSyncPreview | null {
  if (!course.sourceUrl) {
    return null;
  }

  let sourceUrl: URL;
  try {
    sourceUrl = new URL(course.sourceUrl);
  } catch {
    return null;
  }

  const preset = getCourseImportPreset(sourceUrl);
  if (!preset?.preferCanonicalTitles) {
    return null;
  }

  const { lectures, matchedByTitle } = buildCanonicalLectureSet(
    course.lectures,
    preset.lectureTitles,
    clampLectureMinutes(course.lectureMinutes ?? course.lectures[0]?.estimatedMinutes),
  );

  const currentTitles = course.lectures.map((lecture) =>
    normalizeComparableTitle(lecture.title),
  );
  const nextTitles = lectures.map((lecture) => normalizeComparableTitle(lecture.title));
  const hasChanges =
    course.lectures.length !== lectures.length ||
    currentTitles.some((title, index) => title !== nextTitles[index]);

  return {
    presetName: preset.name,
    provider: preset.provider,
    currentUnits: course.lectures.length,
    canonicalUnits: lectures.length,
    currentCompletedUnits: course.lectures.filter((lecture) => lecture.completed).length,
    preservedCompletedUnits: lectures.filter((lecture) => lecture.completed).length,
    matchedByTitle,
    hasChanges,
  };
}

export function syncCourseToCanonicalSyllabus(course: Course) {
  const preview = getCanonicalSyllabusPreview(course);
  if (!preview) {
    return null;
  }

  const preset = getCourseImportPreset(new URL(course.sourceUrl!));
  if (!preset) {
    return null;
  }

  const lectureMinutes = clampLectureMinutes(
    course.lectureMinutes ?? course.lectures[0]?.estimatedMinutes,
  );
  const { lectures } = buildCanonicalLectureSet(
    course.lectures,
    preset.lectureTitles,
    lectureMinutes,
  );

  return {
    ...course,
    totalUnits: lectures.length,
    lectureMinutes,
    updatedAt: new Date().toISOString(),
    lectures,
  } satisfies Course;
}

export function makeCourseInputFromCourse(course: Course): CourseInput {
  return {
    canonicalId: course.canonicalId,
    name: course.name,
    provider: course.provider,
    totalUnits: course.totalUnits,
    lectureMinutes: clampLectureMinutes(
      course.lectureMinutes ?? course.lectures[0]?.estimatedMinutes,
    ),
    deadline: course.deadline,
    color: course.color,
    notes: course.notes,
    difficulty: clampDifficulty(course.difficulty),
    intensity: normalizeCourseIntensity(course.intensity),
    priority: clampPriority(course.priority),
    dependencyIds: normalizeDependencyIds(course.dependencyIds),
    softDependencyIds: normalizeDependencyIds(course.softDependencyIds),
    roadmapId: course.roadmapId,
    roadmapTrack: normalizeRoadmapTrack(course.roadmapTrack),
    roadmapPhase: clampRoadmapPhase(course.roadmapPhase),
    roadmapOrder: clampRoadmapOrder(course.roadmapOrder),
    roadmapRoute: normalizeCourseRoadmapRoute(course.roadmapRoute, course.roadmapTrack),
    roadmapYear: normalizeCourseRoadmapYear(course.roadmapYear, course.roadmapPhase),
    roadmapStatus: normalizeCourseRoadmapStatus(
      course.roadmapStatus,
      course.scheduleMode,
      course.roadmapPhase,
    ),
    scheduleMode: normalizeScheduleMode(course.scheduleMode),
    deadlineMode: normalizeDeadlineMode(course.deadlineMode),
    scheduleCadence: normalizeScheduleCadence(course.scheduleCadence),
    weeklyTargetBlocks: normalizeWeeklyTargetBlocks(course.weeklyTargetBlocks),
    weeklySpacingDays: normalizeWeeklySpacingDays(course.weeklySpacingDays),
    sourceUrl: course.sourceUrl,
    lectureTitlesText: course.lectures.map((lecture) => lecture.title).join("\n"),
  };
}

export function normalizeCourses(courses: Course[]) {
  return courses
    .filter((course): course is Course => Boolean(course?.id))
    .map((course) => {
      const baseLectures = Array.isArray(course.lectures) ? course.lectures : [];
      const totalUnits = Math.max(Number(course.totalUnits) || 0, baseLectures.length, 1);
      const now = new Date().toISOString();
      const sourceUrl = course.sourceUrl?.trim() || undefined;
      const roadmapDefaults = getPresetRoadmapDefaults(sourceUrl);
      const lectureMinutes = clampLectureMinutes(
        course.lectureMinutes ??
          baseLectures[0]?.estimatedMinutes ??
          DEFAULT_ESTIMATED_MINUTES,
      );
      const roadmapTrack = normalizeRoadmapTrack(course.roadmapTrack ?? roadmapDefaults?.roadmapTrack);
      const roadmapPhase = clampRoadmapPhase(course.roadmapPhase ?? roadmapDefaults?.roadmapPhase);
      const roadmapOrder = clampRoadmapOrder(course.roadmapOrder ?? roadmapDefaults?.roadmapOrder);
      const roadmapStatus = normalizeCourseRoadmapStatus(
        course.roadmapStatus ?? roadmapDefaults?.roadmapStatus,
        course.scheduleMode ?? roadmapDefaults?.scheduleMode,
        roadmapPhase,
      );
      const scheduleMode = scheduleModeForRoadmapStatus(
        roadmapStatus,
        course.scheduleMode ?? roadmapDefaults?.scheduleMode,
      );
      const roadmapRoute = normalizeCourseRoadmapRoute(
        course.roadmapRoute ?? roadmapDefaults?.roadmapRoute,
        roadmapTrack,
      );
      const roadmapYear = normalizeCourseRoadmapYear(
        course.roadmapYear ?? roadmapDefaults?.roadmapYear,
        roadmapPhase,
      );

      return {
        ...course,
        canonicalId:
          course.canonicalId?.trim() || roadmapDefaults?.canonicalId || undefined,
        name: course.name?.trim() || "Untitled Course",
        provider: course.provider?.trim() || "Unknown",
        totalUnits,
        lectureMinutes,
        deadline: course.deadline || getDateKey(addDays(new Date(), 30)),
        color: course.color || DEFAULT_COLOR,
        notes: course.notes ?? "",
        difficulty: clampDifficulty(course.difficulty),
        intensity: normalizeCourseIntensity(course.intensity),
        priority: clampPriority(course.priority),
        dependencyIds: normalizeDependencyIds(course.dependencyIds),
        softDependencyIds: normalizeDependencyIds(course.softDependencyIds),
        roadmapId: course.roadmapId?.trim() || undefined,
        roadmapTrack,
        roadmapPhase,
        roadmapOrder,
        roadmapRoute,
        roadmapYear,
        roadmapStatus,
        scheduleMode,
        deadlineMode: normalizeDeadlineMode(course.deadlineMode),
        scheduleCadence: normalizeScheduleCadence(course.scheduleCadence),
        weeklyTargetBlocks: normalizeWeeklyTargetBlocks(course.weeklyTargetBlocks),
        weeklySpacingDays: normalizeWeeklySpacingDays(course.weeklySpacingDays),
        sourceType: "course",
        learningItemType: "course",
        sourceUrl,
        createdAt: course.createdAt || now,
        updatedAt: course.updatedAt || now,
        lectures: syncLectures(baseLectures, totalUnits, "", lectureMinutes),
      } satisfies Course;
    });
}




