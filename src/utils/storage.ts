import { DEMO_COURSE_IDS } from "../data/demoCourses";
import {
  buildRequestedCourseInputs,
} from "../data/requestedCourseImports";
import {
  getCanonicalCourseIdForSourceUrl,
  getCourseCatalogEntryByCanonicalId,
  getCourseCatalogEntryForCourse,
} from "../catalog/courseCatalog";
import { getCourseImportPreset } from "../data/importPresets";
import { Course, CourseStorageState } from "../types";
import {
  buildCourseFromInput,
  getCanonicalSyllabusPreview,
  normalizeCourses,
  syncCourseToCanonicalSyllabus,
} from "./courseFactory";
import { migrateLegacyRoadmapCourses } from "./roadmapMigration";

const STORAGE_KEY = "study-runway:state:v2";
const LEGACY_STORAGE_KEY = "study-runway:courses:v1";
const REQUESTED_COURSE_DISMISSALS_KEY =
  "study-runway:requested-course-dismissals:v1";
const CALCULUS_1A_CANONICAL_ID = "mit-18-01-1x";
const MECHANICS_1_CANONICAL_ID = "mit-8-01-1x";
const DEFAULT_COURSE_LECTURE_MINUTES = 60;
const STABLE_PLAN_CACHE_PREFIX = "study-runway:stable-plan:";
const TASK_LECTURE_PINS_STORAGE_KEY = "study-runway:task-lecture-pins:v2";

function isStorageState(value: unknown): value is CourseStorageState {
  if (!value || typeof value !== "object") {
    return false;
  }

  const candidate = value as CourseStorageState;
  return (
    candidate.version === 2 &&
    Array.isArray(candidate.courseOrder) &&
    typeof candidate.coursesById === "object" &&
    candidate.coursesById !== null
  );
}

function hasUserStudyData(course: Course) {
  return course.lectures.some(
    (lecture) =>
      lecture.completed ||
      Boolean(lecture.completedAt) ||
      (lecture.progressMinutes ?? 0) > 0 ||
      (lecture.studySessions ?? []).length > 0 ||
      (lecture.actualMinutes ?? 0) > 0 ||
      (lecture.notes ?? "").trim().length > 0 ||
      lecture.understanding != null,
  );
}

function normalizeComparableText(value?: string) {
  return value?.replace(/\s+/g, " ").trim().toLowerCase() ?? "";
}

function getCanonicalMetadataForCourse(course: Course) {
  const entry = getCourseCatalogEntryForCourse(course);
  if (!entry) {
    return null;
  }

  let preset: ReturnType<typeof getCourseImportPreset>;
  try {
    preset = getCourseImportPreset(new URL(entry.sourceUrl));
  } catch {
    preset = undefined;
  }

  return {
    entry,
    preset,
    lectureMinutes:
      entry.lectureMinutes ?? preset?.lectureMinutes ?? DEFAULT_COURSE_LECTURE_MINUTES,
  };
}

function hasTimingConfigurationEdits(course: Course) {
  const metadata = getCanonicalMetadataForCourse(course);
  if (!metadata) {
    return false;
  }

  if (Math.round(course.lectureMinutes) !== metadata.lectureMinutes) {
    return true;
  }

  return course.lectures.some(
    (lecture) => Math.round(lecture.estimatedMinutes) !== metadata.lectureMinutes,
  );
}

function hasManualSyllabusEdits(course: Course) {
  const metadata = getCanonicalMetadataForCourse(course);
  const preset = metadata?.preset;
  if (!preset || course.updatedAt === course.createdAt) {
    return false;
  }

  const currentTitles = course.lectures.map((lecture) => normalizeComparableText(lecture.title));
  const presetTitles = preset.lectureTitles.map(normalizeComparableText);
  const hasTitleEdits =
    currentTitles.length !== presetTitles.length ||
    currentTitles.some((title, index) => title !== presetTitles[index]);

  return (
    normalizeComparableText(course.name) !== normalizeComparableText(preset.name) ||
    normalizeComparableText(course.provider) !== normalizeComparableText(preset.provider) ||
    hasTitleEdits
  );
}

function hasUserProtectedCourseData(course: Course) {
  return (
    hasUserStudyData(course) ||
    hasTimingConfigurationEdits(course) ||
    hasManualSyllabusEdits(course)
  );
}

function stripEmptyDemoCourses(courses: Course[]) {
  return courses.filter(
    (course) => !DEMO_COURSE_IDS.has(course.id) || hasUserProtectedCourseData(course),
  );
}

function mapStateToCourses(state: CourseStorageState) {
  return state.courseOrder
    .map((courseId) => state.coursesById[courseId])
    .filter(Boolean);
}

function normalizeSourceUrl(value?: string) {
  if (!value) {
    return "";
  }

  try {
    return new URL(value).toString();
  } catch {
    return value.trim();
  }
}

function isDefaultRoadmapPlacement(course: Course) {
  const track = course.roadmapTrack?.trim() || "general";
  const phase = Math.round(course.roadmapPhase ?? 99);

  return track === "general" && phase >= 99;
}

function isMissingText(value?: string) {
  return !value?.trim();
}

function hasLegacyModernRoboticsPlacement(course: Course) {
  return (
    course.roadmapTrack === "robotics-foundation" &&
    Math.round(course.roadmapPhase ?? -1) === 3 &&
    Math.round(course.roadmapOrder ?? -1) === 30
  );
}

function hasLegacyThreeJsPlacement(course: Course) {
  return (
    Math.round(course.roadmapPhase ?? -1) === 4 &&
    Math.round(course.roadmapOrder ?? -1) === 30 &&
    ["project-practice", "spatial-interface"].includes(course.roadmapTrack)
  );
}

function repairKnownRoadmapPlacement(course: Course, canonicalId: string) {
  if (canonicalId === "modern-robotics-coursera" && hasLegacyModernRoboticsPlacement(course)) {
    return {
      ...course,
      roadmapPhase: 4,
      roadmapOrder: 5,
      roadmapRoute: "robotics" as const,
      roadmapYear: 3 as const,
    } satisfies Course;
  }

  if (canonicalId === "threejs-journey" && hasLegacyThreeJsPlacement(course)) {
    return {
      ...course,
      roadmapTrack: "spatial-intelligence-graphics",
      roadmapPhase: 2,
      roadmapOrder: 34,
      roadmapRoute: "spatial-interface" as const,
      roadmapYear: 1 as const,
    } satisfies Course;
  }

  if (canonicalId === "deeplearning-advanced-retrieval-chroma") {
    return {
      ...course,
      roadmapTrack: "portfolio-ai-systems",
      roadmapPhase: 5,
      roadmapOrder: 40,
      roadmapRoute: "ai-agent" as const,
      roadmapYear: 4 as const,
    } satisfies Course;
  }

  if (canonicalId === "nvidia-building-rag-agents") {
    return {
      ...course,
      roadmapTrack: "portfolio-ai-systems",
      roadmapPhase: 5,
      roadmapOrder: 50,
      roadmapRoute: "ai-agent" as const,
      roadmapYear: 4 as const,
    } satisfies Course;
  }

  return course;
}

function applyCatalogMetadata(courses: Course[]) {
  return courses.map((course) => {
    const entry = getCourseCatalogEntryForCourse(course);
    if (!entry) {
      return course;
    }

    const preset = getCourseImportPreset(new URL(entry.sourceUrl));
    const isLegacyCourse = entry.legacyIds?.includes(course.id) ?? false;
    const shouldApplyRoadmapDefaults =
      isLegacyCourse || isDefaultRoadmapPlacement(course);

    const nextCourse = {
      ...course,
      canonicalId: course.canonicalId?.trim() || entry.canonicalId,
      sourceUrl: course.sourceUrl?.trim() || entry.sourceUrl,
      name: isMissingText(course.name) && preset ? preset.name : course.name,
      provider:
        isMissingText(course.provider) && preset ? preset.provider : course.provider,
      color: course.color || preset?.color || course.color,
      difficulty: course.difficulty ?? preset?.difficulty ?? entry.difficulty,
      intensity: course.intensity ?? entry.intensity ?? preset?.intensity,
      roadmapTrack:
        shouldApplyRoadmapDefaults && preset?.roadmapTrack
          ? preset.roadmapTrack
          : course.roadmapTrack,
      roadmapPhase:
        shouldApplyRoadmapDefaults && typeof preset?.roadmapPhase === "number"
          ? preset.roadmapPhase
          : course.roadmapPhase,
      roadmapOrder:
        shouldApplyRoadmapDefaults && typeof preset?.roadmapOrder === "number"
          ? preset.roadmapOrder
          : course.roadmapOrder,
      roadmapRoute:
        shouldApplyRoadmapDefaults && preset?.roadmapRoute
          ? preset.roadmapRoute
          : course.roadmapRoute,
      roadmapYear:
        shouldApplyRoadmapDefaults && typeof preset?.roadmapYear === "number"
          ? preset.roadmapYear
          : course.roadmapYear,
      roadmapStatus:
        shouldApplyRoadmapDefaults && preset?.roadmapStatus
          ? preset.roadmapStatus
          : course.roadmapStatus,
      scheduleMode:
        shouldApplyRoadmapDefaults && preset?.scheduleMode
          ? preset.scheduleMode
          : course.scheduleMode,
    } satisfies Course;

    return repairKnownRoadmapPlacement(nextCourse, entry.canonicalId);
  });
}

function hasCalculus1ALectureShape(course: Course) {
  const lectureText = course.lectures
    .map((lecture) => normalizeSearchText(lecture.title))
    .join(" ");

  return (
    lectureText.includes("calculating derivatives") ||
    lectureText.includes("what is the derivative") ||
    lectureText.includes("limits of quotients") ||
    lectureText.includes("related rates")
  );
}

function hasMechanicsIdentity(course: Course) {
  const searchText = `${normalizeSearchText(course.canonicalId)} ${normalizeSearchText(
    course.name,
  )} ${normalizeSearchText(course.sourceUrl)}`;

  return (
    searchText.includes(MECHANICS_1_CANONICAL_ID) ||
    searchText.includes("mechanics: kinematics and dynamics") ||
    searchText.includes("mitx+8.01.1x") ||
    searchText.includes("8.01.1x")
  );
}

function repairMisclassifiedCalculus1A(courses: Course[]) {
  const entry = getCourseCatalogEntryByCanonicalId(CALCULUS_1A_CANONICAL_ID);
  if (!entry) {
    return courses;
  }

  const preset = getCourseImportPreset(new URL(entry.sourceUrl));
  return courses.map((course) => {
    if (!hasCalculus1ALectureShape(course) || !hasMechanicsIdentity(course)) {
      return course;
    }

    const hadMechanicsName = normalizeSearchText(course.name).includes("mechanics");
    const hadMechanicsColor = course.color === "#b45309";
    const hadMechanicsRoadmap =
      course.roadmapTrack === "science-foundation" &&
      Math.round(course.roadmapOrder ?? -1) === 50;

    return {
      ...course,
      canonicalId: entry.canonicalId,
      sourceUrl: entry.sourceUrl,
      name: hadMechanicsName && preset ? preset.name : course.name,
      provider: isMissingText(course.provider) && preset ? preset.provider : course.provider,
      color: hadMechanicsColor && preset ? preset.color : course.color,
      roadmapTrack:
        (hadMechanicsRoadmap || isDefaultRoadmapPlacement(course)) && preset?.roadmapTrack
          ? preset.roadmapTrack
          : course.roadmapTrack,
      roadmapPhase:
        (hadMechanicsRoadmap || isDefaultRoadmapPlacement(course)) &&
        typeof preset?.roadmapPhase === "number"
          ? preset.roadmapPhase
          : course.roadmapPhase,
      roadmapOrder:
        (hadMechanicsRoadmap || isDefaultRoadmapPlacement(course)) &&
        typeof preset?.roadmapOrder === "number"
          ? preset.roadmapOrder
          : course.roadmapOrder,
    } satisfies Course;
  });
}

function repairKnownCourseImports(courses: Course[]) {
  return courses.map((course) => {
    const sourceUrl = normalizeSourceUrl(course.sourceUrl);
    if (!sourceUrl) {
      return course;
    }

    let parsedSourceUrl: URL;
    try {
      parsedSourceUrl = new URL(sourceUrl);
    } catch {
      return course;
    }

    const preset = getCourseImportPreset(parsedSourceUrl);
    if (!preset?.preferCanonicalTitles) {
      return course;
    }

    if (hasUserProtectedCourseData(course)) {
      return course;
    }

    const preview = getCanonicalSyllabusPreview(course);
    if (!preview?.hasChanges) {
      return course;
    }

    return syncCourseToCanonicalSyllabus(course) ?? course;
  });
}

function normalizeSearchText(value?: string) {
  return value?.toLowerCase().trim() ?? "";
}

function getExistingSourceUrls(courses: Course[]) {
  return new Set(
    courses.map((course) => normalizeSourceUrl(course.sourceUrl)).filter(Boolean),
  );
}

function getExistingCanonicalIds(courses: Course[]) {
  return new Set(
    courses
      .map((course) => getCourseCatalogEntryForCourse(course)?.canonicalId)
      .filter((value): value is string => Boolean(value)),
  );
}

function normalizeRequestedCourseDismissalId(value?: string) {
  if (!value) {
    return "";
  }

  const trimmedValue = value.trim();
  const directCatalogEntry = getCourseCatalogEntryByCanonicalId(trimmedValue);
  if (directCatalogEntry) {
    return directCatalogEntry.canonicalId;
  }

  return getCanonicalCourseIdForSourceUrl(trimmedValue) || normalizeSourceUrl(trimmedValue);
}

function loadDismissedRequestedCourseIds() {
  if (typeof window === "undefined") {
    return new Set<string>();
  }

  try {
    const rawValue = window.localStorage.getItem(REQUESTED_COURSE_DISMISSALS_KEY);
    if (!rawValue) {
      return new Set<string>();
    }

    const parsedValue = JSON.parse(rawValue);
    if (!Array.isArray(parsedValue)) {
      return new Set<string>();
    }

    return new Set(
      parsedValue
        .map((value) =>
          normalizeRequestedCourseDismissalId(typeof value === "string" ? value : ""),
        )
        .filter(Boolean),
    );
  } catch {
    return new Set<string>();
  }
}

function saveDismissedRequestedCourseIds(identifiers: Iterable<string>) {
  if (typeof window === "undefined") {
    return;
  }

  const normalizedIdentifiers = [
    ...new Set([...identifiers].map(normalizeRequestedCourseDismissalId)),
  ]
    .filter(Boolean)
    .sort((left, right) => left.localeCompare(right));

  if (normalizedIdentifiers.length === 0) {
    try {
      window.localStorage.removeItem(REQUESTED_COURSE_DISMISSALS_KEY);
    } catch (error) {
      console.warn("Unable to clear requested course dismissals.", error);
    }
    return;
  }

  try {
    window.localStorage.setItem(
      REQUESTED_COURSE_DISMISSALS_KEY,
      JSON.stringify(normalizedIdentifiers),
    );
  } catch (error) {
    console.warn("Unable to persist requested course dismissals.", error);
  }
}

function getRequestedCourseIdForCourse(course: Course) {
  return getCourseCatalogEntryForCourse(course)?.canonicalId || "";
}

function prepareCourses(courses: Course[]) {
  return normalizeCourses(
    migrateLegacyRoadmapCourses(
      repairKnownCourseImports(
        applyCatalogMetadata(
          repairMisclassifiedCalculus1A(stripEmptyDemoCourses(courses)),
        ),
      ),
    ),
  );
}

function prepareCoursesForStorage(courses: Course[]) {
  return normalizeCourses(courses);
}

function prepareCoursesSafely(courses: Course[]) {
  try {
    return prepareCourses(courses);
  } catch (error) {
    console.warn("Course migration failed; preserving normalized stored courses.", error);
    return normalizeCourses(courses);
  }
}

function clearDerivedCourseStorageCache() {
  if (typeof window === "undefined") {
    return;
  }

  const keysToRemove: string[] = [TASK_LECTURE_PINS_STORAGE_KEY];
  for (let index = 0; index < window.localStorage.length; index += 1) {
    const key = window.localStorage.key(index);
    if (key?.startsWith(STABLE_PLAN_CACHE_PREFIX)) {
      keysToRemove.push(key);
    }
  }

  keysToRemove.forEach((key) => {
    try {
      window.localStorage.removeItem(key);
    } catch {
      // Derived cache only; keep the primary course save path moving.
    }
  });
}

export function rememberDismissedRequestedCourse(course: Course) {
  const requestedCourseId = getRequestedCourseIdForCourse(course);
  if (!requestedCourseId) {
    return;
  }

  const dismissedCourseIds = loadDismissedRequestedCourseIds();
  dismissedCourseIds.add(requestedCourseId);
  saveDismissedRequestedCourseIds(dismissedCourseIds);
}

export function rememberDismissedRequestedCourses(courses: Course[]) {
  const dismissedCourseIds = loadDismissedRequestedCourseIds();

  courses.forEach((course) => {
    const requestedCourseId = getRequestedCourseIdForCourse(course);
    if (requestedCourseId) {
      dismissedCourseIds.add(requestedCourseId);
    }
  });

  saveDismissedRequestedCourseIds(dismissedCourseIds);
}

export function ensureRequestedCourses(courses: Course[]) {
  if (typeof window === "undefined") {
    return courses;
  }

  const normalizedCourses = prepareCoursesSafely(courses);
  const existingSourceUrls = getExistingSourceUrls(normalizedCourses);
  const existingCanonicalIds = getExistingCanonicalIds(normalizedCourses);
  const dismissedCourseIds = loadDismissedRequestedCourseIds();

  const requestedCourses = buildRequestedCourseInputs()
    .filter((input) => {
      const sourceUrl = normalizeSourceUrl(input.sourceUrl);
      const canonicalId =
        input.canonicalId || getCanonicalCourseIdForSourceUrl(input.sourceUrl);
      return (
        sourceUrl &&
        canonicalId &&
        !existingSourceUrls.has(sourceUrl) &&
        !existingCanonicalIds.has(canonicalId) &&
        !dismissedCourseIds.has(canonicalId) &&
        !dismissedCourseIds.has(sourceUrl)
      );
    })
    .map((input) => buildCourseFromInput(input));

  if (requestedCourses.length === 0) {
    return normalizedCourses;
  }

  return normalizeCourses([...normalizedCourses, ...requestedCourses]);
}

export function loadCoursesFromStorage(): Course[] {
  if (typeof window === "undefined") {
    return [];
  }

  try {
    const currentValue = window.localStorage.getItem(STORAGE_KEY);
    if (currentValue) {
      const parsedValue = JSON.parse(currentValue);
      if (isStorageState(parsedValue)) {
        return prepareCoursesSafely(mapStateToCourses(parsedValue));
      }
    }

    const legacyValue = window.localStorage.getItem(LEGACY_STORAGE_KEY);
    if (legacyValue) {
      const parsedValue = JSON.parse(legacyValue) as Course[] | CourseStorageState;

      if (Array.isArray(parsedValue)) {
        return prepareCoursesSafely(parsedValue);
      }

      if (isStorageState(parsedValue)) {
        return prepareCoursesSafely(mapStateToCourses(parsedValue));
      }
    }
  } catch {
    return [];
  }

  return [];
}

export function saveCoursesToStorage(courses: Course[]) {
  if (typeof window === "undefined") {
    return;
  }

  const normalizedCourses = prepareCoursesForStorage(courses);
  const payload: CourseStorageState = {
    version: 2,
    updatedAt: new Date().toISOString(),
    courseOrder: normalizedCourses.map((course) => course.id),
    coursesById: Object.fromEntries(
      normalizedCourses.map((course) => [course.id, course]),
    ),
  };

  const serializedPayload = JSON.stringify(payload);

  try {
    window.localStorage.removeItem(LEGACY_STORAGE_KEY);
    window.localStorage.setItem(STORAGE_KEY, serializedPayload);
    return;
  } catch (firstError) {
    clearDerivedCourseStorageCache();
    try {
      window.localStorage.setItem(STORAGE_KEY, serializedPayload);
      return;
    } catch (secondError) {
      console.warn("Unable to persist courses to localStorage.", secondError, firstError);
    }
  }
}




