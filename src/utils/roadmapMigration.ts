import type { Course, LearningItem, LearningUnit, Lecture } from "../types";

function normalizeSearchText(value?: string | null) {
  return (value ?? "")
    .toLowerCase()
    .replace(/\u2013|\u2014/g, "-")
    .replace(/\s+/g, " ")
    .trim();
}

function buildCourseSearchText(course: Course) {
  return normalizeSearchText(
    [
      course.id,
      course.canonicalId,
      course.name,
      course.provider,
      course.sourceUrl,
      course.notes,
      ...course.lectures.map((lecture) => lecture.title),
    ]
      .filter(Boolean)
      .join(" "),
  );
}

function buildLearningItemSearchText(item: LearningItem) {
  return normalizeSearchText(
    [
      item.id,
      item.title,
      item.type,
      item.sourceUrl,
      item.notes,
      ...item.units.map((unit) => unit.title),
    ]
      .filter(Boolean)
      .join(" "),
  );
}

function hasStudyEvidence(unit: Lecture | LearningUnit) {
  return (
    unit.completed ||
    unit.progressMinutes > 0 ||
    (unit.studySessions ?? []).length > 0 ||
    (unit.actualMinutes ?? 0) > 0 ||
    (unit.notes ?? "").trim().length > 0
  );
}

export function hasCourseStudyEvidence(course: Course) {
  return course.lectures.some(hasStudyEvidence);
}

export function hasLearningItemStudyEvidence(item: LearningItem) {
  return item.units.some(hasStudyEvidence);
}

function isLegacyConflictText(text: string) {
  const isOldCalculusSc =
    (text.includes("18.01sc") || text.includes("18-01sc")) ||
    (text.includes("single variable calculus") &&
      (text.includes("ocw") || text.includes("mit")));
  const isMit1805 =
    text.includes("18.05") ||
    (text.includes("probability and statistics") &&
      (text.includes("mit") || text.includes("ocw")));

  return (
    isMit1805 ||
    text.includes("6.100l") ||
    text.includes("6.0001") ||
    text.includes("introduction to computer science and programming using python") ||
    text.includes("docs.python.org/3/tutorial") ||
    text.includes("python official tutorial") ||
    text.includes("official python tutorial") ||
    text.includes("the python tutorial") ||
    text.includes("ostep") ||
    text.includes("operating systems: three easy pieces") ||
    text.includes("operating systems three easy pieces") ||
    isOldCalculusSc
  );
}

export function isLegacyConflictCourse(course: Course) {
  return isLegacyConflictText(buildCourseSearchText(course));
}

export function isLegacyConflictLearningItem(item: LearningItem) {
  return isLegacyConflictText(buildLearningItemSearchText(item));
}

function archiveLegacyCourse(course: Course): Course {
  if (course.roadmapStatus === "archived" && course.scheduleMode === "reference") {
    return {
      ...course,
      canonicalId: undefined,
    };
  }

  return {
    ...course,
    canonicalId: undefined,
    scheduleMode: "reference",
    roadmapStatus: "archived",
  };
}

function archiveLegacyLearningItem(item: LearningItem): LearningItem {
  if (item.roadmapStatus === "archived" && item.scheduleMode === "reference") {
    return item;
  }

  return {
    ...item,
    scheduleMode: "reference",
    roadmapStatus: "archived",
  };
}

export function migrateLegacyRoadmapCourses(courses: Course[]) {
  return courses.flatMap((course) => {
    if (!isLegacyConflictCourse(course)) {
      return [course];
    }

    return hasCourseStudyEvidence(course) ? [archiveLegacyCourse(course)] : [];
  });
}

export function migrateLegacyRoadmapLearningItems(items: LearningItem[]) {
  return items.flatMap((item) => {
    if (!isLegacyConflictLearningItem(item)) {
      return [item];
    }

    return hasLearningItemStudyEvidence(item) ? [archiveLegacyLearningItem(item)] : [];
  });
}
