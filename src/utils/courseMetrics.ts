import {
  CompletionSeriesItem,
  Course,
  CourseMetrics,
  DashboardSummary,
  RiskLevel,
  RiskSeriesItem,
} from "../types";
import {
  differenceInCalendarDays,
  formatDateShort,
  getRecentDateKeys,
  isDateWithinLastDays,
} from "./date";
import { getLectureActualMinutes } from "./lectureTiming";
import {
  getStudyUnitProgressMinutes,
  getStudyUnitRemainingMinutes,
} from "./studyProgress";

function round(value: number) {
  return Math.round(value * 100) / 100;
}

export function minutesToHours(minutes: number) {
  return round(minutes / 60);
}

export function formatHours(hours: number) {
  return `${round(hours)} 小时`;
}

export function formatHoursPerDay(hours: number) {
  return `${round(hours)} 小时/天`;
}

function getLectureProgressMinutes(lecture: Course["lectures"][number]) {
  return getStudyUnitProgressMinutes(lecture);
}

function getLectureRemainingMinutes(lecture: Course["lectures"][number]) {
  return getStudyUnitRemainingMinutes(lecture);
}

function getLectureRecentMinutes(lecture: Course["lectures"][number], today: Date) {
  const sessionMinutes = (lecture.studySessions ?? [])
    .filter((session) => isDateWithinLastDays(session.date, 7, today))
    .reduce((total, session) => total + session.minutes, 0);

  if (sessionMinutes > 0) {
    return sessionMinutes;
  }

  if (
    lecture.completed &&
    lecture.completedAt &&
    isDateWithinLastDays(lecture.completedAt, 7, today)
  ) {
    return getLectureActualMinutes(lecture) ?? lecture.estimatedMinutes;
  }

  return 0;
}

function getLectureLastStudiedDate(lecture: Course["lectures"][number]) {
  const sessionDates = (lecture.studySessions ?? []).map((session) => session.date);
  const allDates = [...sessionDates, ...(lecture.completedAt ? [lecture.completedAt] : [])];
  return allDates.sort((left, right) => right.localeCompare(left))[0];
}

function riskRank(level: RiskLevel) {
  switch (level) {
    case "overdue":
      return 4;
    case "high":
      return 3;
    case "medium":
      return 2;
    case "low":
      return 1;
    default:
      return 0;
  }
}

export const RISK_THEME: Record<
  RiskLevel,
  { label: string; badgeClassName: string; panelClassName: string; chartColor: string }
> = {
  low: {
    label: "低风险",
    badgeClassName: "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200",
    panelClassName: "border-emerald-200/80 bg-emerald-50/80",
    chartColor: "#16a34a",
  },
  medium: {
    label: "中风险",
    badgeClassName: "bg-amber-50 text-amber-700 ring-1 ring-amber-200",
    panelClassName: "border-amber-200/80 bg-amber-50/80",
    chartColor: "#d97706",
  },
  high: {
    label: "高风险",
    badgeClassName: "bg-rose-50 text-rose-700 ring-1 ring-rose-200",
    panelClassName: "border-rose-200/80 bg-rose-50/80",
    chartColor: "#dc2626",
  },
  overdue: {
    label: "已延期",
    badgeClassName: "bg-slate-950 text-white",
    panelClassName: "border-slate-950/20 bg-slate-950 text-white",
    chartColor: "#0f172a",
  },
  completed: {
    label: "已完成",
    badgeClassName: "bg-sky-50 text-sky-700 ring-1 ring-sky-200",
    panelClassName: "border-sky-200/80 bg-sky-50/80",
    chartColor: "#0284c7",
  },
};

export function calculateCourseMetrics(
  course: Course,
  today: Date = new Date(),
): CourseMetrics {
  const completedUnits = course.lectures.filter((lecture) => lecture.completed).length;
  const remainingUnits = Math.max(course.totalUnits - completedUnits, 0);
  const totalEstimatedMinutes = course.lectures.reduce(
    (total, lecture) => total + lecture.estimatedMinutes,
    0,
  );
  const progressedMinutes = course.lectures.reduce(
    (total, lecture) => total + getLectureProgressMinutes(lecture),
    0,
  );
  const progressPct =
    totalEstimatedMinutes === 0 ? 0 : round((progressedMinutes / totalEstimatedMinutes) * 100);
  const daysLeft = differenceInCalendarDays(course.deadline, today);
  const recentCompletions = course.lectures.filter(
    (lecture) =>
      lecture.completed &&
      lecture.completedAt &&
      isDateWithinLastDays(lecture.completedAt, 7, today),
  ).length;
  const estimatedMinutesRemaining = course.lectures.reduce(
    (total, lecture) => total + getLectureRemainingMinutes(lecture),
    0,
  );
  const recentMinutes = course.lectures.reduce(
    (total, lecture) => total + getLectureRecentMinutes(lecture, today),
    0,
  );

  const requiredDailyPace =
    estimatedMinutesRemaining === 0
      ? 0
      : round(minutesToHours(estimatedMinutesRemaining) / (daysLeft <= 0 ? 1 : daysLeft));
  const recentDailyPace = round(minutesToHours(recentMinutes) / 7);
  const tomorrowRequiredDailyPace =
    estimatedMinutesRemaining === 0
      ? 0
      : daysLeft <= 1
        ? minutesToHours(estimatedMinutesRemaining)
        : round(minutesToHours(estimatedMinutesRemaining) / (daysLeft - 1));
  const skipPenalty = round(Math.max(0, tomorrowRequiredDailyPace - requiredDailyPace));
  const paceGap = round(Math.max(0, requiredDailyPace - recentDailyPace));
  const actualMinutesLogged = course.lectures.reduce(
    (total, lecture) => total + (getLectureActualMinutes(lecture) ?? 0),
    0,
  );
  const lastStudiedDate = course.lectures
    .map(getLectureLastStudiedDate)
    .filter((value): value is string => Boolean(value))
    .sort((left, right) => right.localeCompare(left))[0];
  const fallbackDate = course.createdAt.slice(0, 10);
  const daysSinceLastStudy = Math.max(
    0,
    differenceInCalendarDays(today, lastStudiedDate ?? fallbackDate),
  );

  let riskLevel: RiskLevel = "low";
  let statusLabel = "节奏稳定";
  const isAutoDeadline = course.deadlineMode === "auto";

  if (remainingUnits === 0) {
    riskLevel = "completed";
    statusLabel = "已完成";
  } else if (isAutoDeadline && daysLeft < 0) {
    riskLevel = "medium";
    statusLabel = "自动目标已过，建议重排";
  } else if (isAutoDeadline) {
    riskLevel = "low";
    statusLabel = "已纳入自动排课";
  } else if (daysLeft < 0) {
    riskLevel = "overdue";
    statusLabel = "已延期";
  } else if (recentDailyPace >= requiredDailyPace) {
    riskLevel = "low";
    statusLabel = "可按时完成";
  } else if (
    recentDailyPace >= requiredDailyPace * 0.75 ||
    requiredDailyPace - recentDailyPace <= 0.5
  ) {
    riskLevel = "medium";
    statusLabel = "略慢于计划";
  } else {
    riskLevel = "high";
    statusLabel = "明显落后";
  }

  let riskScore = 0;
  if (riskLevel === "completed") {
    riskScore = 0;
  } else if (riskLevel === "overdue") {
    riskScore = 100;
  } else if (isAutoDeadline) {
    const deadlinePressure = Math.min(1, 7 / Math.max(daysLeft, 1));
    const remainingPressure = estimatedMinutesRemaining / Math.max(totalEstimatedMinutes, 1);
    riskScore = Math.round((deadlinePressure * 0.2 + remainingPressure * 0.15) * 100);
  } else {
    const gapRatio =
      requiredDailyPace === 0
        ? 0
        : Math.max(0, (requiredDailyPace - recentDailyPace) / requiredDailyPace);
    const deadlinePressure = Math.min(1, 7 / Math.max(daysLeft, 1));
    const remainingPressure = estimatedMinutesRemaining / Math.max(totalEstimatedMinutes, 1);
    riskScore = Math.round(
      (gapRatio * 0.6 + deadlinePressure * 0.25 + remainingPressure * 0.15) * 100,
    );
  }

  return {
    completedUnits,
    remainingUnits,
    progressPct,
    daysLeft,
    requiredDailyPace,
    recentDailyPace,
    recentCompletions,
    tomorrowRequiredDailyPace,
    skipPenalty,
    paceGap,
    riskLevel,
    riskScore,
    statusLabel,
    estimatedMinutesRemaining,
    actualMinutesLogged,
    daysSinceLastStudy,
  };
}

export function sortCoursesByRisk(courses: Course[], today: Date = new Date()) {
  return courses
    .map((course) => ({
      course,
      metrics: calculateCourseMetrics(course, today),
    }))
    .sort((left, right) => {
      const completionDiff =
        Number(left.metrics.remainingUnits === 0) - Number(right.metrics.remainingUnits === 0);
      if (completionDiff !== 0) {
        return completionDiff;
      }

      const riskDiff = riskRank(right.metrics.riskLevel) - riskRank(left.metrics.riskLevel);
      if (riskDiff !== 0) {
        return riskDiff;
      }

      const scoreDiff = right.metrics.riskScore - left.metrics.riskScore;
      if (scoreDiff !== 0) {
        return scoreDiff;
      }

      return left.metrics.daysLeft - right.metrics.daysLeft;
    });
}

export function calculateDashboardSummary(
  courses: Course[],
  today: Date = new Date(),
): DashboardSummary {
  const metricsList = courses.map((course) => calculateCourseMetrics(course, today));
  const totalUnits = courses.reduce((total, course) => total + course.totalUnits, 0);
  const unitsCompleted = metricsList.reduce(
    (total, metrics) => total + metrics.completedUnits,
    0,
  );
  const unitsRemaining = metricsList.reduce(
    (total, metrics) => total + metrics.remainingUnits,
    0,
  );
  const totalEstimatedMinutes = courses.reduce(
    (total, course) =>
      total +
      course.lectures.reduce((courseTotal, lecture) => courseTotal + lecture.estimatedMinutes, 0),
    0,
  );
  const estimatedMinutesRemaining = metricsList.reduce(
    (total, metrics) => total + metrics.estimatedMinutesRemaining,
    0,
  );
  const estimatedMinutesCompleted = Math.max(totalEstimatedMinutes - estimatedMinutesRemaining, 0);

  return {
    totalCourses: courses.length,
    activeCourses: metricsList.filter((metrics) => metrics.remainingUnits > 0).length,
    completedCourses: metricsList.filter((metrics) => metrics.riskLevel === "completed").length,
    overdueCourses: metricsList.filter((metrics) => metrics.riskLevel === "overdue").length,
    dueSoonCourses: metricsList.filter(
      (metrics) => metrics.remainingUnits > 0 && metrics.daysLeft >= 0 && metrics.daysLeft <= 7,
    ).length,
    highRiskCourses: metricsList.filter(
      (metrics) => metrics.riskLevel === "high" || metrics.riskLevel === "overdue",
    ).length,
    unitsCompleted,
    unitsRemaining,
    estimatedMinutesCompleted,
    estimatedMinutesRemaining,
    totalEstimatedMinutes,
    totalUnits,
    overallCompletionRate:
      totalEstimatedMinutes === 0
        ? 0
        : round((estimatedMinutesCompleted / totalEstimatedMinutes) * 100),
    recentDailyPace: round(
      metricsList.reduce((total, metrics) => total + metrics.recentDailyPace, 0),
    ),
    requiredDailyPace: round(
      metricsList.reduce((total, metrics) => total + metrics.requiredDailyPace, 0),
    ),
  };
}

export function buildCompletionSeries(
  courses: Course[],
  days = 14,
  today: Date = new Date(),
): CompletionSeriesItem[] {
  return getRecentDateKeys(days, today).map((dateKey) => ({
    date: dateKey,
    label: formatDateShort(dateKey),
    completed: courses.reduce(
      (total, course) =>
        total +
        course.lectures
          .flatMap((lecture) => lecture.studySessions ?? [])
          .filter((session) => session.date === dateKey).length,
      0,
    ),
  }));
}

export function buildCourseCompletionSeries(
  course: Course,
  days = 14,
  today: Date = new Date(),
): CompletionSeriesItem[] {
  return getRecentDateKeys(days, today).map((dateKey) => ({
    date: dateKey,
    label: formatDateShort(dateKey),
    completed: course.lectures
      .flatMap((lecture) => lecture.studySessions ?? [])
      .filter((session) => session.date === dateKey).length,
  }));
}

export function buildRiskSeries(
  courses: Course[],
  today: Date = new Date(),
): RiskSeriesItem[] {
  return sortCoursesByRisk(courses, today)
    .filter(({ metrics }) => metrics.remainingUnits > 0)
    .map(({ course, metrics }) => ({
      courseId: course.id,
      name: course.name,
      riskScore: metrics.riskScore,
      level: metrics.riskLevel,
      color: RISK_THEME[metrics.riskLevel].chartColor,
      progressPct: metrics.progressPct,
    }));
}
