import {
  Course,
  CourseTimingCalibrationSummary,
  CourseTimingDirection,
  Lecture,
  LectureTimingInsight,
  LectureTimingStatus,
} from "../types";

const TIMING_ACCURACY_TOLERANCE_MINUTES = 10;

function round(value: number) {
  return Math.round(value * 100) / 100;
}

export function roundMinutesToNearestFive(minutes: number) {
  return Math.max(5, Math.round(minutes / 5) * 5);
}

export function getLectureSessionMinutes(lecture: Lecture) {
  return Math.max(
    0,
    Math.round(
      (lecture.studySessions ?? []).reduce(
        (total, session) => total + Math.max(0, Math.round(session.minutes || 0)),
        0,
      ),
    ),
  );
}

export function getLectureActualMinutes(lecture: Lecture) {
  const sessionMinutes = getLectureSessionMinutes(lecture);
  if (sessionMinutes > 0) {
    return sessionMinutes;
  }

  if (typeof lecture.actualMinutes === "number" && lecture.actualMinutes > 0) {
    return Math.max(0, Math.round(lecture.actualMinutes));
  }

  return null;
}

export function buildLectureTimingInsight(lecture: Lecture): LectureTimingInsight {
  const actualMinutes = getLectureActualMinutes(lecture);
  const deltaMinutes = actualMinutes === null ? null : actualMinutes - lecture.estimatedMinutes;
  const deltaRatio =
    actualMinutes === null || lecture.estimatedMinutes <= 0 || deltaMinutes === null
      ? null
      : round(deltaMinutes / lecture.estimatedMinutes);
  const usedLegacyActualMinutes =
    getLectureSessionMinutes(lecture) <= 0 &&
    typeof lecture.actualMinutes === "number" &&
    lecture.actualMinutes > 0;

  let timingStatus: LectureTimingStatus = "missing";
  if (actualMinutes !== null && !lecture.completed) {
    timingStatus = "inProgress";
  } else if (actualMinutes !== null && deltaMinutes !== null) {
    if (Math.abs(deltaMinutes) <= TIMING_ACCURACY_TOLERANCE_MINUTES) {
      timingStatus = "accurate";
    } else if (deltaMinutes > 0) {
      timingStatus = "longer";
    } else {
      timingStatus = "shorter";
    }
  }

  return {
    lectureId: lecture.id,
    order: lecture.order,
    title: lecture.title,
    estimatedMinutes: lecture.estimatedMinutes,
    actualMinutes,
    deltaMinutes,
    deltaRatio,
    timingStatus,
    suggestedEstimateMinutes:
      lecture.completed && actualMinutes !== null
        ? roundMinutesToNearestFive(actualMinutes)
        : null,
    usedLegacyActualMinutes,
  };
}

function getDominantDirection(insights: LectureTimingInsight[]): CourseTimingDirection {
  const longerCount = insights.filter((insight) => insight.timingStatus === "longer").length;
  const shorterCount = insights.filter((insight) => insight.timingStatus === "shorter").length;
  const accurateCount = insights.filter((insight) => insight.timingStatus === "accurate").length;

  if (longerCount === 0 && shorterCount === 0 && accurateCount === 0) {
    return "insufficientData";
  }

  if (longerCount > shorterCount && longerCount > accurateCount) {
    return "mostlyLonger";
  }

  if (shorterCount > longerCount && shorterCount > accurateCount) {
    return "mostlyShorter";
  }

  return "mostlyAccurate";
}

export function buildCourseTimingCalibrationSummary(
  courseOrLectures: Course | Lecture[],
): CourseTimingCalibrationSummary {
  const lectures = Array.isArray(courseOrLectures)
    ? courseOrLectures
    : courseOrLectures.lectures;
  const insights = lectures.map(buildLectureTimingInsight);
  const insightsWithActual = insights.filter((insight) => insight.actualMinutes !== null);
  const completedInsights = insights.filter(
    (insight) => insight.actualMinutes !== null && lectures.some(
      (lecture) => lecture.id === insight.lectureId && lecture.completed,
    ),
  );
  const calibrationInsights = completedInsights.length > 0 ? completedInsights : insightsWithActual;
  const totalEstimatedMinutes = insightsWithActual.reduce(
    (total, insight) => total + insight.estimatedMinutes,
    0,
  );
  const totalActualMinutes = insightsWithActual.reduce(
    (total, insight) => total + (insight.actualMinutes ?? 0),
    0,
  );
  const totalDeltaMinutes = insightsWithActual.reduce(
    (total, insight) => total + (insight.deltaMinutes ?? 0),
    0,
  );
  const averageDeltaMinutes =
    insightsWithActual.length > 0 ? round(totalDeltaMinutes / insightsWithActual.length) : null;
  const suggestedEstimateMinutes =
    calibrationInsights.length > 0
      ? roundMinutesToNearestFive(
          calibrationInsights.reduce(
            (total, insight) => total + (insight.actualMinutes ?? 0),
            0,
          ) / calibrationInsights.length,
        )
      : null;

  return {
    comparableLectureCount: insightsWithActual.length,
    completedLectureCount: completedInsights.length,
    totalEstimatedMinutes,
    totalActualMinutes,
    averageDeltaMinutes,
    dominantDirection: getDominantDirection(calibrationInsights),
    suggestedEstimateMinutes,
    largestVarianceLectures: [...calibrationInsights]
      .sort(
        (left, right) =>
          Math.abs(right.deltaMinutes ?? 0) - Math.abs(left.deltaMinutes ?? 0) ||
          left.order - right.order,
      )
      .slice(0, 3),
  };
}