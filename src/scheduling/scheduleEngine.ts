import {
  CompletionSeriesItem,
  Course,
  CourseIntensity,
  CourseTaskSuggestion,
  DeadlineOverflowCourse,
  DayPlan,
  IntensityLoadSummary,
  LearningItemType,
  LearningSourceType,
  Lecture,
  LoadLevel,
  ManualTaskMove,
  MasterPlanWeek,
  PlannerSnapshot,
  PlannerWeekMode,
  PriorityBreakdown,
  PriorityScoreEntry,
  ProjectedFinishSummary,
  RoadmapRoute,
  RoadmapScheduleMode,
  RoadmapReferenceResource,
  RoadmapStatus,
  RoadmapYear,
  RoadmapUnitCandidate,
  RiskLevel,
  ScheduleCadence,
  StudyActionType,
  StudyTaskDecision,
  StudyTaskSegment,
  TodayPlanSummary,
  UserCapacitySettings,
  WeeklyPlan,
} from "../types";
import { buildPriorityBreakdown } from "../scoring/priorityScoring";
import {
  addDays,
  differenceInCalendarDays,
  formatDateShort,
  getDateKey,
  parseDateKey,
} from "../utils/date";
import { calculateCourseMetrics, minutesToHours } from "../utils/courseMetrics";
import {
  getStudyUnitLoggedMinutes,
  getStudyUnitRemainingMinutes,
  isStudyUnitAwaitingCompletion,
} from "../utils/studyProgress";
import {
  getRoadmapRoute,
  getRoadmapStatus,
  getRoadmapYear,
  isRoadmapActiveScheduled,
} from "../utils/roadmapMetadata";

const STUDY_BLOCK_MINUTES = 90;
const COURSE_INTENSITIES: CourseIntensity[] = ["heavy", "light"];
const MIN_PLANNING_HORIZON_DAYS = 13;
const MAX_PLANNING_HORIZON_DAYS = 365 * 5;
const MANUAL_DEADLINE_FOCUS_WINDOW_DAYS = 60;

interface PlannableLecture {
  lecture: Lecture;
  remainingMinutes: number;
  cursorMinute: number;
  awaitingCompletion: boolean;
}

interface VirtualCourseState {
  course: Course;
  remainingLectures: PlannableLecture[];
  recentDailyPace: number;
  lastStudiedDate: string | null;
}

interface ScheduledCourseStats {
  units: number;
  minutes: number;
}

type DecisionMap = Map<string, StudyTaskDecision>;
type ManualMoveMap = Map<string, ManualTaskMove[]>;
type WeeklyCoverageCounts = Map<string, Map<string, number>>;
type WeeklyScheduledDates = Map<string, Map<string, Set<string>>>;
type CoursePaceStatus = "rescue" | "active" | "holdback";
type HeavySerialLane = "cs-engineering" | "math-science" | "general";

interface CoursePacingState {
  paceStatus: CoursePaceStatus;
  targetFinishDate: string;
  latestSafeStartWeek: string;
  weeklyTargetBlocks: number;
  weeklyMaxBlocks: number;
  scheduledBlocksThisWeek: number;
  scheduleDebtBlocks: number;
  isHoldback: boolean;
  maintenanceDue: boolean;
}

const ACTIVE_WEEKLY_BLOCK_CAP = 3;
const HOLDBACK_MAINTENANCE_INTERVAL_DAYS = 10;
const CS_ENGINEERING_TRACKS = new Set([
  "programming-foundation",
  "algorithms",
  "systems",
  "software-engineering",
  "project-practice",
  "ai-native-software",
  "rag-ai-systems",
  "ml-ai-core",
]);
const MATH_SCIENCE_TRACKS = new Set([
  "math-foundation",
  "science-foundation",
  "robotics-foundation",
  "rl-robotics",
  "embodied-intelligence",
]);

function getRescueDailyBlockCap(usableCapacity: number) {
  if (usableCapacity <= 0) {
    return 0;
  }

  return Math.max(1, Math.floor(usableCapacity / STUDY_BLOCK_MINUTES));
}

const EMPTY_BREAKDOWN: PriorityBreakdown = {
  total: 0,
  deadlinePressure: 0,
  backlogPressure: 0,
  paceLagPressure: 0,
  neglectPenalty: 0,
  difficultyModifier: 0,
  highRiskBoost: 0,
  feasibilityPenalty: 0,
  behindTargetBoost: 0,
  aheadOfSchedulePenalty: 0,
  explanation: "This is already a completed record.",
  items: [],
};

function round(value: number) {
  return Math.round(value * 100) / 100;
}

function formatDayLabel(dateKey: string) {
  const date = parseDateKey(dateKey);
  const weekday = new Intl.DateTimeFormat("zh-CN", { weekday: "short" }).format(date);
  return `${weekday} ${formatDateShort(dateKey)}`;
}

function isWeekendDate(dateKey: string) {
  const day = parseDateKey(dateKey).getDay();
  return day === 0 || day === 6;
}

function getCourseIntensity(course: Course): CourseIntensity {
  return course.intensity === "light" ? "light" : "heavy";
}

function getCourseSourceType(course: Course): LearningSourceType {
  return course.sourceType === "learningItem" ? "learningItem" : "course";
}

function getCourseLearningItemType(course: Course): LearningItemType {
  return course.learningItemType ?? "course";
}

function getCoursePriority(course: Course) {
  return Math.min(5, Math.max(1, Math.round(course.priority ?? course.difficulty ?? 3)));
}

function getCourseRoadmapTrack(course: Course) {
  return course.roadmapTrack?.trim() || "general";
}

function getCourseRoadmapPhase(course: Course) {
  return Math.min(99, Math.max(0, Math.round(course.roadmapPhase ?? 99)));
}

function getCourseRoadmapOrder(course: Course) {
  return Math.min(9999, Math.max(0, Math.round(course.roadmapOrder ?? 999)));
}

function getCourseRoadmapRoute(course: Course): RoadmapRoute {
  return getRoadmapRoute(course);
}

function getCourseRoadmapYear(course: Course): RoadmapYear {
  return getRoadmapYear(course);
}

function getCourseRoadmapStatus(course: Course): RoadmapStatus {
  return getRoadmapStatus(course);
}

function isCourseActiveScheduled(course: Course) {
  return isRoadmapActiveScheduled(course);
}

function getHeavySerialLane(course: Course): HeavySerialLane {
  const track = getCourseRoadmapTrack(course);
  if (CS_ENGINEERING_TRACKS.has(track)) {
    return "cs-engineering";
  }
  if (MATH_SCIENCE_TRACKS.has(track)) {
    return "math-science";
  }

  return "general";
}

function getCourseScheduleMode(course: Course): RoadmapScheduleMode {
  return course.scheduleMode === "reference" ? "reference" : "scheduled";
}

function getCourseScheduleCadence(course: Course): ScheduleCadence {
  return course.scheduleCadence === "weekly" ? "weekly" : "roadmap";
}

function isFiniteScheduledCourse(course: Course) {
  return isCourseActiveScheduled(course) && getCourseScheduleCadence(course) !== "weekly";
}

function getCourseWeeklySpacingDays(course: Course) {
  if (getCourseScheduleCadence(course) !== "weekly") {
    return 0;
  }

  const configuredDays = course.weeklySpacingDays;
  if (typeof configuredDays !== "number" || !Number.isFinite(configuredDays)) {
    return 0;
  }

  return Math.min(6, Math.max(0, Math.round(configuredDays)));
}

function getStudyActionType(course: Course): StudyActionType {
  if (getCourseScheduleMode(course) === "reference") {
    return "reference";
  }

  if (getCourseSourceType(course) === "course") {
    return "watch";
  }

  switch (getCourseLearningItemType(course)) {
    case "book":
    case "paper":
      return "read";
    case "practice":
      return "practice";
    case "project":
      return "build";
    case "roadmap":
      return "read";
    default:
      return "read";
  }
}

function getStudyActionLabel(actionType: StudyActionType) {
  switch (actionType) {
    case "watch":
      return "看课";
    case "read":
      return "阅读";
    case "practice":
      return "练习";
    case "build":
      return "项目";
    case "reference":
      return "参考";
    default:
      return "学习";
  }
}

function getSourceLabel(course: Course) {
  if (getCourseSourceType(course) === "course") {
    return course.provider || "课程";
  }

  switch (getCourseLearningItemType(course)) {
    case "book":
      return "书籍";
    case "paper":
      return "论文";
    case "practice":
      return "练习资料";
    case "project":
      return "项目";
    case "roadmap":
      return "Roadmap";
    default:
      return "资料";
  }
}

function buildRoadmapReferenceResource(course: Course): RoadmapReferenceResource {
  return {
    id: course.id,
    title: course.name,
    type: getCourseLearningItemType(course),
    sourceUrl: course.sourceUrl,
    notes: course.notes,
  };
}

function getReferenceResourcesForCourse(
  course: Course,
  allCourses: Course[],
): RoadmapReferenceResource[] {
  return allCourses
    .filter((candidate) => candidate.id !== course.id)
    .filter((candidate) => getCourseRoadmapStatus(candidate) === "reference")
    .filter((candidate) => {
      const dependencyMatch =
        (candidate.softDependencyIds ?? []).includes(course.id) ||
        (candidate.dependencyIds ?? []).includes(course.id);
      const sameRoadmapSlice =
        getCourseRoadmapTrack(candidate) === getCourseRoadmapTrack(course) &&
        getCourseRoadmapPhase(candidate) === getCourseRoadmapPhase(course) &&
        Math.abs(getCourseRoadmapOrder(candidate) - getCourseRoadmapOrder(course)) <= 3;

      return dependencyMatch || sameRoadmapSlice;
    })
    .sort((left, right) => getCourseRoadmapOrder(left) - getCourseRoadmapOrder(right))
    .slice(0, 3)
    .map(buildRoadmapReferenceResource);
}

function getRoadmapTaskBaseFields(
  course: Course,
  referenceResources: RoadmapReferenceResource[] = [],
) {
  const actionType = getStudyActionType(course);

  return {
    itemId: course.id,
    itemTitle: course.name,
    actionType,
    actionLabel: getStudyActionLabel(actionType),
    sourceLabel: getSourceLabel(course),
    roadmapTrack: getCourseRoadmapTrack(course),
    roadmapPhase: getCourseRoadmapPhase(course),
    roadmapOrder: getCourseRoadmapOrder(course),
    roadmapRoute: getCourseRoadmapRoute(course),
    roadmapYear: getCourseRoadmapYear(course),
    roadmapStatus: getCourseRoadmapStatus(course),
    scheduleMode: getCourseScheduleMode(course),
    referenceResources,
  };
}

function getCoursesPerDayForIntensity(
  settings: UserCapacitySettings,
  intensity: CourseIntensity,
  dateKey?: string,
) {
  if (dateKey && isWeekendDate(dateKey)) {
    return intensity === "heavy"
      ? settings.weekendHeavyCoursesPerDay
      : settings.weekendLightCoursesPerDay;
  }

  return intensity === "heavy"
    ? settings.heavyCoursesPerDay
    : settings.lightCoursesPerDay;
}

function getSlotMinutesForIntensity(
  dateKey: string,
  settings: UserCapacitySettings,
  dayAdjustments: Record<string, number>,
  intensity: CourseIntensity,
) {
  const { usableCapacity } = getAdjustedCapacityMinutesForIntensity(
    dateKey,
    settings,
    dayAdjustments,
    intensity,
  );
  const courseSlots = getCoursesPerDayForIntensity(settings, intensity, dateKey);

  return courseSlots <= 0 ? usableCapacity : Math.max(1, Math.floor(usableCapacity / courseSlots));
}

function buildVirtualCompletionMap(states: VirtualCourseState[]) {
  return new Map(
    states.flatMap((state) => {
      const completed = state.remainingLectures.length === 0;
      return [
        [state.course.id, completed] as const,
        ...(state.course.canonicalId ? [[state.course.canonicalId, completed] as const] : []),
      ];
    }),
  );
}

function areHardDependenciesSatisfied(
  course: Course,
  completionMap: Map<string, boolean>,
) {
  return (course.dependencyIds ?? []).every((dependencyId) =>
    completionMap.get(dependencyId),
  );
}

function getSoftDependencyCompletion(course: Course, completionMap: Map<string, boolean>) {
  const softDependencyIds = course.softDependencyIds ?? [];
  if (softDependencyIds.length === 0) {
    return 1;
  }

  const completedCount = softDependencyIds.filter((dependencyId) =>
    completionMap.get(dependencyId),
  ).length;

  return completedCount / softDependencyIds.length;
}

function getEmptyIntensityLoad(capacityMinutes = 0): IntensityLoadSummary {
  return {
    minutes: 0,
    capacityMinutes,
    loadRatio: 0,
    loadLevel: getLoadLevel(0, capacityMinutes),
    scheduledCourses: 0,
    totalUnits: 0,
  };
}

function getEmptyIntensityLoads(
  heavyCapacityMinutes = 0,
  lightCapacityMinutes = 0,
): Record<CourseIntensity, IntensityLoadSummary> {
  return {
    heavy: getEmptyIntensityLoad(heavyCapacityMinutes),
    light: getEmptyIntensityLoad(lightCapacityMinutes),
  };
}

function summarizeIntensityLoad(
  tasks: CourseTaskSuggestion[],
  capacityMinutes: number,
): IntensityLoadSummary {
  const minutes = tasks.reduce((total, task) => total + task.estimatedMinutes, 0);
  const totalUnits = tasks.reduce((total, task) => total + task.studyBlockCount, 0);

  return {
    minutes,
    capacityMinutes,
    loadRatio: capacityMinutes <= 0 ? 0 : round(minutes / capacityMinutes),
    loadLevel: getLoadLevel(minutes, capacityMinutes),
    scheduledCourses: tasks.length,
    totalUnits,
  };
}

function summarizeIntensityLoads(
  tasks: CourseTaskSuggestion[],
  capacities: Record<CourseIntensity, number>,
): Record<CourseIntensity, IntensityLoadSummary> {
  return {
    heavy: summarizeIntensityLoad(
      tasks.filter((task) => task.intensity === "heavy"),
      capacities.heavy,
    ),
    light: summarizeIntensityLoad(
      tasks.filter((task) => task.intensity === "light"),
      capacities.light,
    ),
  };
}

function getRawCapacityMinutes(dateKey: string, settings: UserCapacitySettings) {
  if (isWeekendDate(dateKey)) {
    return settings.weekendHeavyMinutes + settings.weekendLightMinutes;
  }

  return settings.weekdayHeavyMinutes + settings.weekdayLightMinutes;
}

function getRawCapacityMinutesForIntensity(
  dateKey: string,
  settings: UserCapacitySettings,
  intensity: CourseIntensity,
) {
  if (isWeekendDate(dateKey)) {
    return intensity === "heavy" ? settings.weekendHeavyMinutes : settings.weekendLightMinutes;
  }

  return intensity === "heavy" ? settings.weekdayHeavyMinutes : settings.weekdayLightMinutes;
}

function getDayAdjustmentLevel(dateKey: string, dayAdjustments: Record<string, number>) {
  return Math.min(1, Math.max(-1, Math.round(dayAdjustments[dateKey] || 0)));
}

function getAdjustedCapacityMinutes(
  dateKey: string,
  settings: UserCapacitySettings,
  dayAdjustments: Record<string, number>,
) {
  const rawCapacity = getRawCapacityMinutes(dateKey, settings);
  const adjustmentLevel = getDayAdjustmentLevel(dateKey, dayAdjustments);
  const usableRatio = Math.min(1.2, Math.max(0.5, 1 + adjustmentLevel * 0.2));

  return {
    rawCapacity,
    usableCapacity: Math.round(rawCapacity * usableRatio),
    adjustmentLevel,
  };
}

function getLoadLevel(totalMinutes: number, capacityMinutes: number): LoadLevel {
  const ratio = capacityMinutes <= 0 ? 0 : totalMinutes / capacityMinutes;
  if (ratio > 1) {
    return "overload";
  }
  if (ratio >= 0.85) {
    return "heavy";
  }
  if (ratio <= 0.4) {
    return "light";
  }
  return "balanced";
}

function getCombinedLoadLevel(
  totalMinutes: number,
  capacityMinutes: number,
  intensityLoads: Record<CourseIntensity, IntensityLoadSummary>,
): LoadLevel {
  const overallLoadLevel = getLoadLevel(totalMinutes, capacityMinutes);
  const laneLoadLevels = COURSE_INTENSITIES.map(
    (intensity) => intensityLoads[intensity].loadLevel,
  );

  if (laneLoadLevels.includes("overload") || overallLoadLevel === "overload") {
    return "overload";
  }
  if (laneLoadLevels.includes("heavy") || overallLoadLevel === "heavy") {
    return "heavy";
  }
  if (laneLoadLevels.every((level) => level === "light") && overallLoadLevel === "light") {
    return "light";
  }

  return overallLoadLevel === "light" ? "balanced" : overallLoadLevel;
}

function buildDaySummary(loadLevel: LoadLevel, tasks: CourseTaskSuggestion[]) {
  if (tasks.length === 0) {
    return "这一天暂时没有可安排的学习动作。";
  }

  switch (loadLevel) {
    case "overload":
      return "这一天已经超过当前容量，建议挪动一部分学习动作。";
    case "heavy":
      return "这一天安排接近满容量。";
    case "light":
      return "这一天安排较轻，可以用于复盘或补漏。";
    default:
      return "这一天负载均衡，按计划推进即可。";
  }
}

function buildDecisionMap(taskDecisions: StudyTaskDecision[]): DecisionMap {
  return new Map(taskDecisions.map((decision) => [decision.taskId, decision]));
}

function buildManualMoveMap(manualTaskMoves: ManualTaskMove[]): ManualMoveMap {
  const moveMap: ManualMoveMap = new Map();

  manualTaskMoves.forEach((taskMove) => {
    const currentItems = moveMap.get(taskMove.targetDate) ?? [];
    currentItems.push(taskMove);
    moveMap.set(taskMove.targetDate, currentItems);
  });

  return moveMap;
}

function buildReservedMinutesByCourse(manualTaskMoves: ManualTaskMove[]) {
  const reserved = new Map<string, number>();

  manualTaskMoves.forEach((taskMove) => {
    reserved.set(
      taskMove.courseId,
      (reserved.get(taskMove.courseId) ?? 0) + Math.max(0, taskMove.estimatedMinutes),
    );
  });

  return reserved;
}

function isCourseSchedulableOnDate(course: Course, dateKey: string) {
  if (!isCourseActiveScheduled(course)) {
    return false;
  }

  if (getCourseScheduleCadence(course) === "weekly") {
    return true;
  }

  if (course.deadlineMode === "auto") {
    return true;
  }

  return dateKey <= course.deadline;
}

function isManualDeadlineCourse(course: Course) {
  return course.deadlineMode === "manual" && getCourseScheduleCadence(course) !== "weekly";
}

function hasManualDeadlinePressure(course: Course, dateKey: string) {
  if (!isManualDeadlineCourse(course)) {
    return false;
  }

  const daysLeft = differenceInCalendarDays(course.deadline, dateKey);
  return daysLeft >= 0 && daysLeft <= MANUAL_DEADLINE_FOCUS_WINDOW_DAYS;
}

function hasManualDeadlineEntryPressure(entry: PriorityScoreEntry) {
  return (
    entry.deadlineMode === "manual" &&
    entry.daysLeft >= 0 &&
    entry.daysLeft <= MANUAL_DEADLINE_FOCUS_WINDOW_DAYS
  );
}

function compareManualDeadlineEntries(
  left: PriorityScoreEntry,
  right: PriorityScoreEntry,
) {
  const leftHasPressure = hasManualDeadlineEntryPressure(left);
  const rightHasPressure = hasManualDeadlineEntryPressure(right);
  if (leftHasPressure !== rightHasPressure) {
    return leftHasPressure ? -1 : 1;
  }

  if (!leftHasPressure || !rightHasPressure) {
    return 0;
  }

  if (left.impossibleToFinish !== right.impossibleToFinish) {
    return left.impossibleToFinish ? -1 : 1;
  }

  const riskDiff = getRoadmapRiskRank(right.riskLevel) - getRoadmapRiskRank(left.riskLevel);
  if (riskDiff !== 0) {
    return riskDiff;
  }

  const daysLeftDiff = left.daysLeft - right.daysLeft;
  if (daysLeftDiff !== 0) {
    return daysLeftDiff;
  }

  const scheduleDebtDiff = right.scheduleDebtBlocks - left.scheduleDebtBlocks;
  if (scheduleDebtDiff !== 0) {
    return scheduleDebtDiff;
  }

  const scoreDiff = right.score - left.score;
  if (scoreDiff !== 0) {
    return scoreDiff;
  }

  return right.remainingMinutes - left.remainingMinutes;
}

function filterManualMovesWithinDeadline(
  manualTaskMoves: ManualTaskMove[],
  courses: Course[],
) {
  const courseMap = new Map(courses.map((course) => [course.id, course]));

  return manualTaskMoves.filter((taskMove) => {
    const course = courseMap.get(taskMove.courseId);
    if (!course) {
      return false;
    }

    return isCourseSchedulableOnDate(course, taskMove.targetDate);
  });
}

function buildDeadlineOverflowCourses(
  states: VirtualCourseState[],
  todayKey: string,
  settings: UserCapacitySettings,
  dayAdjustments: Record<string, number>,
): DeadlineOverflowCourse[] {
  return states
    .filter((state) => state.course.deadlineMode === "manual")
    .filter((state) => getCourseScheduleCadence(state.course) !== "weekly")
    .map((state) => {
      const remainingMinutes = sumLectureMinutes(state.remainingLectures);
      if (remainingMinutes <= 0) {
        return null;
      }

      const overdueDays = Math.max(0, differenceInCalendarDays(todayKey, state.course.deadline));
      const blockMinutes = getSlotMinutesForIntensity(
        todayKey,
        settings,
        dayAdjustments,
        getCourseIntensity(state.course),
      );

      return {
        courseId: state.course.id,
        courseName: state.course.name,
        color: state.course.color,
        sourceType: getCourseSourceType(state.course),
        learningItemType: getCourseLearningItemType(state.course),
        deadline: state.course.deadline,
        deadlineMode: state.course.deadlineMode,
        remainingUnits: state.remainingLectures.length,
        remainingMinutes,
        remainingStudyBlockCount: getStudyBlockCount(remainingMinutes, blockMinutes),
        isAlreadyOverdue: overdueDays > 0,
        overdueDays,
      } satisfies DeadlineOverflowCourse;
    })
    .filter((item): item is DeadlineOverflowCourse => Boolean(item))
    .sort((left, right) => left.deadline.localeCompare(right.deadline));
}

function getLectureLoggedMinutes(lecture: Lecture) {
  return getStudyUnitLoggedMinutes(lecture);
}

function getLectureRemainingMinutes(lecture: Lecture) {
  return getStudyUnitRemainingMinutes(lecture);
}

function isAwaitingManualCompletion(lecture: Lecture) {
  return isStudyUnitAwaitingCompletion(lecture);
}

function getLastStudiedDate(course: Course) {
  const dates = course.lectures.flatMap((lecture) => [
    ...(lecture.studySessions ?? []).map((session) => session.date),
    ...(lecture.completedAt ? [lecture.completedAt] : []),
  ]);

  return dates.sort((left, right) => right.localeCompare(left))[0] ?? null;
}

function getDaysSinceLastStudy(
  lastStudiedDate: string | null,
  fallbackDate: string,
  planningDate: string,
) {
  const baseDate = lastStudiedDate || fallbackDate;
  return Math.max(0, differenceInCalendarDays(planningDate, baseDate));
}

function sumLectureMinutes(lectures: PlannableLecture[]) {
  return lectures.reduce((total, lecture) => total + lecture.remainingMinutes, 0);
}

function getStudyBlockCount(totalMinutes: number, blockMinutes = STUDY_BLOCK_MINUTES) {
  if (totalMinutes <= 0) {
    return 0;
  }

  return Math.max(1, Math.ceil(totalMinutes / Math.max(1, blockMinutes)));
}

function getSlotFillMinutes(
  state: VirtualCourseState | undefined,
  maxBlockMinutes: number,
) {
  if (!state || maxBlockMinutes <= 0) {
    return 0;
  }

  if (state.remainingLectures[0]?.awaitingCompletion) {
    return Math.min(maxBlockMinutes, state.remainingLectures[0].remainingMinutes);
  }

  let plannedMinutes = 0;
  for (const lecture of state.remainingLectures) {
    if (plannedMinutes >= maxBlockMinutes) {
      break;
    }
    if (lecture.remainingMinutes <= 0) {
      continue;
    }

    plannedMinutes += Math.min(maxBlockMinutes - plannedMinutes, lecture.remainingMinutes);
    if (lecture.awaitingCompletion) {
      break;
    }
  }

  return plannedMinutes;
}

function getAssignableNextMinutes(
  state: VirtualCourseState | undefined,
  slotMinutes: number,
) {
  const nextLecture = state?.remainingLectures[0];
  if (!state || !nextLecture || nextLecture.remainingMinutes <= 0 || slotMinutes <= 0) {
    return 0;
  }

  if (getCourseScheduleCadence(state.course) === "weekly") {
    return nextLecture.remainingMinutes <= slotMinutes ? nextLecture.remainingMinutes : 0;
  }

  return getSlotFillMinutes(state, slotMinutes);
}

function computeRawMinutesUntilDeadline(
  planningDate: string,
  deadline: string,
  settings: UserCapacitySettings,
  intensity: CourseIntensity,
) {
  const daysLeft = differenceInCalendarDays(deadline, planningDate);
  if (daysLeft < 0) {
    return 0;
  }

  return Array.from({ length: daysLeft + 1 }, (_, index) =>
    getDateKey(addDays(planningDate, index)),
  ).reduce(
    (total, dateKey) =>
      total + getRawCapacityMinutesForIntensity(dateKey, settings, intensity),
    0,
  );
}

function getAdjustedCapacityMinutesForIntensity(
  dateKey: string,
  settings: UserCapacitySettings,
  dayAdjustments: Record<string, number>,
  intensity: CourseIntensity,
) {
  const rawCapacity = getRawCapacityMinutesForIntensity(dateKey, settings, intensity);
  const adjustmentLevel = getDayAdjustmentLevel(dateKey, dayAdjustments);
  const usableRatio = Math.min(1.2, Math.max(0.5, 1 + adjustmentLevel * 0.2));

  return {
    rawCapacity,
    usableCapacity: Math.round(rawCapacity * usableRatio),
    adjustmentLevel,
  };
}

function computeRescueWindowAdditionalBlocks(
  planningDate: string,
  deadline: string,
  settings: UserCapacitySettings,
  dayAdjustments: Record<string, number>,
  intensity: CourseIntensity,
) {
  const weekEndKey = getDateKey(addDays(getWeekStartDateKey(planningDate), 6));
  const rescueWindowEndKey = deadline < weekEndKey ? deadline : weekEndKey;

  if (rescueWindowEndKey < planningDate) {
    return 0;
  }

  return Array.from(
    { length: differenceInCalendarDays(rescueWindowEndKey, planningDate) + 1 },
    (_, index) => getDateKey(addDays(planningDate, index)),
  ).reduce((total, dateKey) => {
    const { usableCapacity } = getAdjustedCapacityMinutesForIntensity(
      dateKey,
      settings,
      dayAdjustments,
      intensity,
    );
    return total + (usableCapacity > 0 ? 1 : 0);
  }, 0);
}

function deriveRiskLevel(
  remainingUnits: number,
  daysLeft: number,
  requiredDailyPace: number,
  recentDailyPace: number,
  impossibleToFinish: boolean,
  deadlineMode: Course["deadlineMode"],
): RiskLevel {
  if (remainingUnits === 0) {
    return "completed";
  }
  if (deadlineMode === "auto") {
    return daysLeft < 0 ? "medium" : "low";
  }
  if (daysLeft < 0) {
    return "overdue";
  }
  if (impossibleToFinish) {
    return "high";
  }
  if (recentDailyPace >= requiredDailyPace) {
    return "low";
  }
  if (
    recentDailyPace >= requiredDailyPace * 0.75 ||
    requiredDailyPace - recentDailyPace <= 0.25
  ) {
    return "medium";
  }
  return "high";
}

function buildTaskReason(entry: PriorityScoreEntry) {
  if (entry.paceStatus === "holdback" && !entry.maintenanceDue) {
    return "This course is still far from its deadline, so the planner deliberately keeps it in the background for now.";
  }
  if (entry.impossibleToFinish || entry.paceStatus === "rescue") {
    return "This course is in rescue mode, so it needs to move ahead of safer long-term work.";
  }
  if (entry.scheduleDebtBlocks > 0) {
    return `This course is still ${entry.scheduleDebtBlocks} block${entry.scheduleDebtBlocks > 1 ? "s" : ""} behind this week's target.`;
  }
  if (entry.maintenanceDue && entry.isHoldback) {
    return "This far-deadline course has been untouched for too long, so the planner adds a maintenance block.";
  }
  if (entry.daysSinceLastStudy >= 3) {
    return "This course has been neglected for several days, so the planner raises it.";
  }
  return "Pushing this now helps keep the week balanced without finishing it too early.";
}

function getDailyBlockCap(_entry: PriorityScoreEntry, _usableCapacity: number) {
  return 1;
}

function getAssignedBlocksForCourse(
  taskMap: Map<string, CourseTaskSuggestion>,
  courseId: string,
) {
  const task = taskMap.get(courseId);
  return task ? getTaskSlotCount(task) : 0;
}

function getScheduledBlocksThisWeek(
  weeklyCoverageCounts: WeeklyCoverageCounts,
  weekKey: string,
  courseId: string,
) {
  return weeklyCoverageCounts.get(weekKey)?.get(courseId) ?? 0;
}

function getScheduledDatesThisWeek(
  weeklyScheduledDates: WeeklyScheduledDates,
  weekKey: string,
  courseId: string,
) {
  return [...(weeklyScheduledDates.get(weekKey)?.get(courseId) ?? new Set<string>())].sort();
}

function getManualMoveDatesThisWeek(
  manualMoveMap: ManualMoveMap,
  weekKey: string,
  courseId: string,
) {
  return Array.from({ length: 7 }, (_, index) => getDateKey(addDays(weekKey, index))).filter(
    (dateKey) => (manualMoveMap.get(dateKey) ?? []).some((move) => move.courseId === courseId),
  );
}

function getKnownWeeklyDatesThisWeek(
  weeklyScheduledDates: WeeklyScheduledDates,
  manualMoveMap: ManualMoveMap,
  weekKey: string,
  courseId: string,
) {
  return [
    ...new Set([
      ...getScheduledDatesThisWeek(weeklyScheduledDates, weekKey, courseId),
      ...getManualMoveDatesThisWeek(manualMoveMap, weekKey, courseId),
    ]),
  ].sort();
}

function hasWeeklySpacingConflict(
  dateKey: string,
  scheduledDates: Iterable<string>,
  spacingDays: number,
) {
  return [...scheduledDates].some(
    (scheduledDate) =>
      scheduledDate !== dateKey &&
      Math.abs(differenceInCalendarDays(dateKey, scheduledDate)) <= spacingDays,
  );
}

function hasWeeklyCapacityOnDate(
  course: Course,
  dateKey: string,
  settings: UserCapacitySettings,
  dayAdjustments: Record<string, number>,
) {
  const intensity = getCourseIntensity(course);
  if (getCoursesPerDayForIntensity(settings, intensity, dateKey) <= 0) {
    return false;
  }

  return (
    getAdjustedCapacityMinutesForIntensity(dateKey, settings, dayAdjustments, intensity)
      .usableCapacity > 0
  );
}

function countFutureWeeklySpacedSlots(
  course: Course,
  dateKey: string,
  settings: UserCapacitySettings,
  dayAdjustments: Record<string, number>,
  knownDates: string[],
  spacingDays: number,
) {
  const weekEndKey = getDateKey(addDays(getWeekStartDateKey(dateKey), 6));
  const simulatedDates = new Set(knownDates);
  let futureSlots = 0;

  for (
    let futureDateKey = getDateKey(addDays(dateKey, 1));
    futureDateKey <= weekEndKey;
    futureDateKey = getDateKey(addDays(futureDateKey, 1))
  ) {
    if (knownDates.includes(futureDateKey)) {
      futureSlots += 1;
      simulatedDates.add(futureDateKey);
      continue;
    }

    if (
      !isCourseSchedulableOnDate(course, futureDateKey) ||
      !hasWeeklyCapacityOnDate(course, futureDateKey, settings, dayAdjustments) ||
      hasWeeklySpacingConflict(futureDateKey, simulatedDates, spacingDays)
    ) {
      continue;
    }

    futureSlots += 1;
    simulatedDates.add(futureDateKey);
  }

  return futureSlots;
}

function canScheduleWeeklyCourseOnDate(
  course: Course,
  dateKey: string,
  entry: PriorityScoreEntry,
  settings: UserCapacitySettings,
  dayAdjustments: Record<string, number>,
  manualMoveMap: ManualMoveMap,
  weeklyScheduledDates: WeeklyScheduledDates,
) {
  if (getCourseScheduleCadence(course) !== "weekly") {
    return true;
  }

  const spacingDays = getCourseWeeklySpacingDays(course);
  if (spacingDays <= 0) {
    return true;
  }

  const currentWeekKey = getWeekStartDateKey(dateKey);
  const knownDates = getKnownWeeklyDatesThisWeek(
    weeklyScheduledDates,
    manualMoveMap,
    currentWeekKey,
    course.id,
  );

  if (!hasWeeklySpacingConflict(dateKey, knownDates, spacingDays)) {
    return true;
  }

  return (
    countFutureWeeklySpacedSlots(
      course,
      dateKey,
      settings,
      dayAdjustments,
      knownDates,
      spacingDays,
    ) < entry.scheduleDebtBlocks
  );
}

function recordPlannedDayCoverage(
  weeklyCoverageCounts: WeeklyCoverageCounts,
  weeklyScheduledDates: WeeklyScheduledDates,
  day: DayPlan,
) {
  const weekKey = getWeekStartDateKey(day.date);
  const currentCounts = new Map(weeklyCoverageCounts.get(weekKey) ?? []);
  const currentDates = new Map(weeklyScheduledDates.get(weekKey) ?? []);

  day.tasks
    .filter((task) => task.status !== "skipped")
    .forEach((task) => {
      currentCounts.set(
        task.courseId,
        (currentCounts.get(task.courseId) ?? 0) + getTaskSlotCount(task),
      );

      const courseDates = new Set(currentDates.get(task.courseId) ?? []);
      courseDates.add(day.date);
      currentDates.set(task.courseId, courseDates);
    });

  weeklyCoverageCounts.set(weekKey, currentCounts);
  weeklyScheduledDates.set(weekKey, currentDates);
}

export function getWeekStartDateKey(value: Date | string) {
  const date = typeof value === "string" ? parseDateKey(value) : new Date(value);
  const normalizedDate = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const day = normalizedDate.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  normalizedDate.setDate(normalizedDate.getDate() + diff);
  return getDateKey(normalizedDate);
}

function createVirtualStates(
  courses: Course[],
  referenceDate: Date,
  reservedMinutesByCourse: Map<string, number> = new Map(),
) {
  return courses.map<VirtualCourseState>((course) => {
    const metrics = calculateCourseMetrics(course, referenceDate);
    let reservedMinutes = reservedMinutesByCourse.get(course.id) ?? 0;
    const remainingLectures = course.lectures
      .filter((lecture) => !lecture.completed)
      .sort((left, right) => left.order - right.order)
      .map<PlannableLecture | null>((lecture) => {
        const progressMinutes = getLectureLoggedMinutes(lecture);
        const awaitingCompletion = isAwaitingManualCompletion(lecture);
        const reservableMinutes = getLectureRemainingMinutes(lecture);
        const reservedForLecture = awaitingCompletion
          ? 0
          : Math.min(reservableMinutes, reservedMinutes);
        reservedMinutes -= reservedForLecture;
        const cursorMinute = awaitingCompletion ? 0 : progressMinutes + reservedForLecture;
        const remainingMinutes = Math.max(reservableMinutes - reservedForLecture, 0);

        if (remainingMinutes <= 0) {
          return null;
        }

        return {
          lecture,
          remainingMinutes,
          cursorMinute,
          awaitingCompletion,
        };
      })
      .filter((lecture): lecture is PlannableLecture => Boolean(lecture));

    return {
      course,
      remainingLectures,
      recentDailyPace: metrics.recentDailyPace,
      lastStudiedDate: getLastStudiedDate(course),
    };
  });
}

function getDeadlineBufferDays(daysLeft: number) {
  if (daysLeft <= 21) {
    return 0;
  }
  if (daysLeft <= 45) {
    return 3;
  }
  if (daysLeft <= 90) {
    return 7;
  }
  return 14;
}

function getWeeksBetweenInclusive(startWeekKey: string, endWeekKey: string) {
  if (endWeekKey <= startWeekKey) {
    return 1;
  }

  return Math.floor(differenceInCalendarDays(endWeekKey, startWeekKey) / 7) + 1;
}

function shiftWeekStartKey(weekStartKey: string, weekOffset: number) {
  return getDateKey(addDays(weekStartKey, weekOffset * 7));
}

interface BuildCoursePacingStateInput {
  course: Course;
  planningDate: string;
  remainingUnits: number;
  remainingMinutes: number;
  blockMinutes: number;
  daysLeft: number;
  daysSinceLastStudy: number;
  riskLevel: RiskLevel;
  impossibleToFinish: boolean;
  scheduledBlocksThisWeek: number;
  rescueWindowAdditionalBlocks: number;
}

function getConfiguredWeeklyTargetBlocks(course: Course, remainingBlocks: number) {
  if (getCourseScheduleCadence(course) !== "weekly") {
    return 0;
  }

  const configuredTarget = Math.round(course.weeklyTargetBlocks ?? 0);
  if (configuredTarget <= 0 || remainingBlocks <= 0) {
    return 0;
  }

  return Math.min(remainingBlocks, Math.min(14, configuredTarget));
}

function buildCoursePacingState(
  input: BuildCoursePacingStateInput,
): CoursePacingState {
  const remainingBlocks = getStudyBlockCount(input.remainingMinutes, input.blockMinutes);
  const currentWeekStart = getWeekStartDateKey(input.planningDate);

  if (remainingBlocks <= 0 || input.remainingUnits <= 0) {
    return {
      paceStatus: "active",
      targetFinishDate: input.planningDate,
      latestSafeStartWeek: currentWeekStart,
      weeklyTargetBlocks: 0,
      weeklyMaxBlocks: 0,
      scheduledBlocksThisWeek: input.scheduledBlocksThisWeek,
      scheduleDebtBlocks: 0,
      isHoldback: false,
      maintenanceDue: false,
    };
  }

  const configuredWeeklyTargetBlocks = getConfiguredWeeklyTargetBlocks(
    input.course,
    remainingBlocks,
  );
  if (configuredWeeklyTargetBlocks > 0) {
    return {
      paceStatus: "active",
      targetFinishDate: input.course.deadline,
      latestSafeStartWeek: currentWeekStart,
      weeklyTargetBlocks: configuredWeeklyTargetBlocks,
      weeklyMaxBlocks: configuredWeeklyTargetBlocks,
      scheduledBlocksThisWeek: input.scheduledBlocksThisWeek,
      scheduleDebtBlocks: configuredWeeklyTargetBlocks - input.scheduledBlocksThisWeek,
      isHoldback: false,
      maintenanceDue: false,
    };
  }

  const bufferDays = getDeadlineBufferDays(input.daysLeft);
  const targetFinishCandidate = getDateKey(addDays(input.course.deadline, -bufferDays));
  const targetFinishDate =
    targetFinishCandidate < input.planningDate ? input.planningDate : targetFinishCandidate;
  const targetFinishWeekStart = getWeekStartDateKey(targetFinishDate);
  const weeksUntilTargetFinish = getWeeksBetweenInclusive(
    currentWeekStart,
    targetFinishWeekStart,
  );
  const requiredBlocksPerWeek = Math.max(1, Math.ceil(remainingBlocks / weeksUntilTargetFinish));
  const weeksNeededAtNormalPace = Math.max(
    1,
    Math.ceil(remainingBlocks / ACTIVE_WEEKLY_BLOCK_CAP),
  );
  const latestSafeStartWeek = shiftWeekStartKey(
    targetFinishWeekStart,
    -(weeksNeededAtNormalPace - 1),
  );
  const maintenanceDue = input.daysSinceLastStudy >= HOLDBACK_MAINTENANCE_INTERVAL_DAYS;
  const shouldRescue =
    input.riskLevel === "overdue" ||
    input.riskLevel === "high" ||
    input.impossibleToFinish ||
    requiredBlocksPerWeek > ACTIVE_WEEKLY_BLOCK_CAP;

    if (shouldRescue) {
    const weeklyTargetBlocks = Math.min(
      remainingBlocks,
      Math.max(remainingBlocks > 1 ? 2 : 1, requiredBlocksPerWeek),
    );
    const weeklyMaxBlocks = Math.min(
      input.scheduledBlocksThisWeek + remainingBlocks,
      input.scheduledBlocksThisWeek + Math.max(0, input.rescueWindowAdditionalBlocks),
    );

    return {
      paceStatus: "rescue",
      targetFinishDate,
      latestSafeStartWeek,
      weeklyTargetBlocks,
      weeklyMaxBlocks,
      scheduledBlocksThisWeek: input.scheduledBlocksThisWeek,
      scheduleDebtBlocks: weeklyTargetBlocks - input.scheduledBlocksThisWeek,
      isHoldback: false,
      maintenanceDue,
    };
  }

  if (currentWeekStart < latestSafeStartWeek) {
    const weeklyTargetBlocks = maintenanceDue ? 1 : 0;

    return {
      paceStatus: "holdback",
      targetFinishDate,
      latestSafeStartWeek,
      weeklyTargetBlocks,
      weeklyMaxBlocks: weeklyTargetBlocks,
      scheduledBlocksThisWeek: input.scheduledBlocksThisWeek,
      scheduleDebtBlocks: weeklyTargetBlocks - input.scheduledBlocksThisWeek,
      isHoldback: true,
      maintenanceDue,
    };
  }

  const weeklyTargetBlocks = Math.min(
    remainingBlocks,
    Math.max(1, Math.min(ACTIVE_WEEKLY_BLOCK_CAP, requiredBlocksPerWeek)),
  );

  return {
    paceStatus: "active",
    targetFinishDate,
    latestSafeStartWeek,
    weeklyTargetBlocks,
    weeklyMaxBlocks: weeklyTargetBlocks,
    scheduledBlocksThisWeek: input.scheduledBlocksThisWeek,
    scheduleDebtBlocks: weeklyTargetBlocks - input.scheduledBlocksThisWeek,
    isHoldback: false,
    maintenanceDue,
  };
}

function buildVirtualPriorityEntry(
  state: VirtualCourseState,
  planningDate: string,
  settings: UserCapacitySettings,
  dayAdjustments: Record<string, number>,
  scheduledStats: ScheduledCourseStats,
  weeklyTaskIds: Set<string>,
  todayTaskIds: Set<string>,
  completionMap: Map<string, boolean>,
): PriorityScoreEntry {
  const intensity = getCourseIntensity(state.course);
  const isWeeklyCadence = getCourseScheduleCadence(state.course) === "weekly";
  const remainingUnits = state.remainingLectures.length;
  const remainingMinutes = sumLectureMinutes(state.remainingLectures);
  const blockMinutes = getSlotMinutesForIntensity(
    planningDate,
    settings,
    dayAdjustments,
    intensity,
  );
  const daysLeft = isWeeklyCadence
    ? 365
    : differenceInCalendarDays(state.course.deadline, planningDate);
  const requiredDailyPace =
    remainingMinutes === 0
      ? 0
      : round(minutesToHours(remainingMinutes) / (daysLeft <= 0 ? 1 : daysLeft));
  const daysSinceLastStudy = getDaysSinceLastStudy(
    state.lastStudiedDate,
    state.course.createdAt.slice(0, 10),
    planningDate,
  );
  const rawMinutesUntilDeadline = isWeeklyCadence
    ? remainingMinutes
    : computeRawMinutesUntilDeadline(
        planningDate,
        state.course.deadline,
        settings,
        intensity,
      );
  const isManualDeadline = state.course.deadlineMode === "manual";
  const impossibleToFinish =
    !isWeeklyCadence &&
    isManualDeadline &&
    remainingUnits > 0 &&
    remainingMinutes > rawMinutesUntilDeadline;
  const riskLevel = deriveRiskLevel(
    remainingUnits,
    daysLeft,
    requiredDailyPace,
    state.recentDailyPace,
    impossibleToFinish,
    state.course.deadlineMode,
  );
  const rescueWindowAdditionalBlocks = isWeeklyCadence
    ? 0
    : computeRescueWindowAdditionalBlocks(
        planningDate,
        state.course.deadline,
        settings,
        dayAdjustments,
        intensity,
      );
  const pacingState = buildCoursePacingState({
    course: state.course,
    planningDate,
    remainingUnits,
    remainingMinutes,
    blockMinutes,
    daysLeft,
    daysSinceLastStudy,
    riskLevel,
    impossibleToFinish,
    scheduledBlocksThisWeek: scheduledStats.units,
    rescueWindowAdditionalBlocks,
  });

  const breakdown = buildPriorityBreakdown(
    {
      daysLeft,
      remainingUnits,
      totalUnits: state.course.totalUnits,
      remainingMinutes,
      recentDailyPace: state.recentDailyPace,
      requiredDailyPace,
      daysSinceLastStudy,
      difficulty: getCoursePriority(state.course),
      riskLevel,
      impossibleToFinish,
      rawMinutesUntilDeadline,
      paceStatus: pacingState.paceStatus,
      scheduleDebtBlocks: pacingState.scheduleDebtBlocks,
      isHoldback: pacingState.isHoldback,
    },
    settings,
  );

  return {
    courseId: state.course.id,
    courseName: state.course.name,
    provider: state.course.provider,
    color: state.course.color,
    intensity,
    sourceType: getCourseSourceType(state.course),
    learningItemType: getCourseLearningItemType(state.course),
    roadmapTrack: getCourseRoadmapTrack(state.course),
    roadmapPhase: getCourseRoadmapPhase(state.course),
    roadmapOrder: getCourseRoadmapOrder(state.course),
    roadmapRoute: getCourseRoadmapRoute(state.course),
    roadmapYear: getCourseRoadmapYear(state.course),
    roadmapStatus: getCourseRoadmapStatus(state.course),
    scheduleMode: getCourseScheduleMode(state.course),
    deadlineMode: state.course.deadlineMode,
    softDependencyCompletion: getSoftDependencyCompletion(state.course, completionMap),
    riskLevel,
    score: breakdown.total,
    rank: 0,
    daysLeft,
    remainingUnits,
    remainingMinutes,
    daysSinceLastStudy,
    requiredDailyPace,
    recentDailyPace: state.recentDailyPace,
    scheduledMinutesThisWeek: scheduledStats.minutes,
    scheduledUnitsThisWeek: scheduledStats.units,
    inTodayPlan: todayTaskIds.has(state.course.id),
    inWeeklyPlan: weeklyTaskIds.has(state.course.id),
    impossibleToFinish,
    paceStatus: pacingState.paceStatus,
    weeklyTargetBlocks: pacingState.weeklyTargetBlocks,
    weeklyMaxBlocks: pacingState.weeklyMaxBlocks,
    scheduleDebtBlocks: pacingState.scheduleDebtBlocks,
    isHoldback: pacingState.isHoldback,
    maintenanceDue: pacingState.maintenanceDue,
    breakdown,
  };
}

function rankPriorityEntries(entries: PriorityScoreEntry[]) {
  return [...entries]
    .sort((left, right) => {
      const manualDeadlineDiff = compareManualDeadlineEntries(left, right);
      if (manualDeadlineDiff !== 0) {
        return manualDeadlineDiff;
      }

      const scoreDiff = right.score - left.score;
      if (scoreDiff !== 0) {
        return scoreDiff;
      }

      const scheduleDebtDiff = right.scheduleDebtBlocks - left.scheduleDebtBlocks;
      if (scheduleDebtDiff !== 0) {
        return scheduleDebtDiff;
      }

      if (left.isHoldback !== right.isHoldback) {
        return Number(left.isHoldback) - Number(right.isHoldback);
      }

      const softDependencyDiff =
        right.softDependencyCompletion - left.softDependencyCompletion;
      if (softDependencyDiff !== 0) {
        return softDependencyDiff;
      }

      const phaseDiff = left.roadmapPhase - right.roadmapPhase;
      if (phaseDiff !== 0) {
        return phaseDiff;
      }

      const orderDiff = left.roadmapOrder - right.roadmapOrder;
      if (orderDiff !== 0) {
        return orderDiff;
      }

      const deadlineDiff = left.daysLeft - right.daysLeft;
      if (deadlineDiff !== 0) {
        return deadlineDiff;
      }

      return left.courseName.localeCompare(right.courseName);
    })
    .map((entry, index) => ({
      ...entry,
      rank: index + 1,
    }));
}

function getPaceStatusPriority(status: CoursePaceStatus) {
  switch (status) {
    case "rescue":
      return 0;
    case "active":
      return 1;
    default:
      return 2;
  }
}

function dedupeStrings(values: string[]) {
  return Array.from(new Set(values.filter(Boolean)));
}

function dedupeLectures(values: Lecture[]) {
  const lectureMap = new Map(values.map((lecture) => [lecture.id, lecture]));
  return [...lectureMap.values()].sort((left, right) => left.order - right.order);
}

function getTaskUnitCount(task: Pick<CourseTaskSuggestion, "unitIds" | "lectureIds" | "studyBlockCount">) {
  return Math.max(
    1,
    task.unitIds?.length || task.lectureIds?.length || task.studyBlockCount || 1,
  );
}

function getTaskSlotCount(task: Pick<CourseTaskSuggestion, "slotCount" | "studyBlockCount">) {
  return Math.max(1, Math.round(task.slotCount ?? 1));
}

function buildHistoryTask(
  course: Course,
  dateKey: string,
  sessions: Array<{ lecture: Lecture; minutes: number }>,
  usableCapacity: number,
  order: number,
  blockMinutes = STUDY_BLOCK_MINUTES,
): CourseTaskSuggestion {
  const lectureIds = dedupeStrings(sessions.map((session) => session.lecture.id));
  const lectureTitles = dedupeStrings(sessions.map((session) => session.lecture.title));
  const recommendedLectures = dedupeLectures(sessions.map((session) => session.lecture));
  const segments: StudyTaskSegment[] = sessions.map((session) => ({
    lectureId: session.lecture.id,
    lectureTitle: session.lecture.title,
    minutes: session.minutes,
  }));
  const estimatedMinutes = segments.reduce((total, segment) => total + segment.minutes, 0);
  const unitCount = Math.max(1, lectureIds.length);
  const slotCount = getStudyBlockCount(estimatedMinutes, blockMinutes);

  return {
    taskId: `task:${dateKey}:${course.id}`,
    courseId: course.id,
    itemId: course.id,
    courseName: course.name,
    itemTitle: course.name,
    provider: course.provider,
    color: course.color,
    intensity: getCourseIntensity(course),
    sourceType: getCourseSourceType(course),
    learningItemType: getCourseLearningItemType(course),
    actionType: getStudyActionType(course),
    actionLabel: getStudyActionLabel(getStudyActionType(course)),
    sourceLabel: getSourceLabel(course),
    roadmapTrack: getCourseRoadmapTrack(course),
    roadmapPhase: getCourseRoadmapPhase(course),
    roadmapOrder: getCourseRoadmapOrder(course),
    roadmapRoute: getCourseRoadmapRoute(course),
    roadmapYear: getCourseRoadmapYear(course),
    roadmapStatus: getCourseRoadmapStatus(course),
    scheduleMode: getCourseScheduleMode(course),
    date: dateKey,
    order,
    level: "completed",
    status: "completed",
    daysLeft: differenceInCalendarDays(course.deadline, dateKey),
    remainingUnits: 0,
    todayTargetUnits: unitCount,
    studyBlockCount: unitCount,
    slotCount,
    estimatedMinutes,
    capacityMinutes: usableCapacity,
    loadRatio: usableCapacity <= 0 ? 0 : round(estimatedMinutes / usableCapacity),
    skipPenalty: 0,
    requiredDailyPace: 0,
    recentDailyPace: 0,
    tomorrowRequiredDailyPace: 0,
    reason: "Completed record.",
    whyNow: "Completed record.",
    riskScore: 0,
    priorityRank: order,
    lectureIds,
    lectureTitles,
    unitIds: lectureIds,
    unitTitles: lectureTitles,
    referenceResources: [],
    segments,
    recommendedLectures,
    priorityBreakdown: EMPTY_BREAKDOWN,
  };
}

function groupStudySessionsByCourse(
  dateKey: string,
  courses: Course[],
) {
  const groupedSessions = new Map<string, Array<{ course: Course; lecture: Lecture; minutes: number }>>();

  courses.forEach((course) => {
    course.lectures.forEach((lecture) => {
      (lecture.studySessions ?? [])
        .filter((session) => session.date === dateKey)
        .forEach((session) => {
          const currentItems = groupedSessions.get(course.id) ?? [];
          currentItems.push({ course, lecture, minutes: session.minutes });
          groupedSessions.set(course.id, currentItems);
        });
    });
  });

  return groupedSessions;
}

function buildHistoryTasksForDate(
  dateKey: string,
  courses: Course[],
  intensityCapacities: Record<CourseIntensity, number>,
  blockMinutesByIntensity?: Record<CourseIntensity, number>,
) {
  const groupedSessions = groupStudySessionsByCourse(dateKey, courses);

  return [...groupedSessions.values()].map((items, index) =>
    buildHistoryTask(
      items[0].course,
      dateKey,
      items.map(({ lecture, minutes }) => ({ lecture, minutes })),
      intensityCapacities[getCourseIntensity(items[0].course)],
      index + 1,
      blockMinutesByIntensity?.[getCourseIntensity(items[0].course)],
    ),
  );
}

function buildPastDayPlan(
  dateKey: string,
  courses: Course[],
  settings: UserCapacitySettings,
  dayAdjustments: Record<string, number>,
): DayPlan {
  const { rawCapacity, usableCapacity, adjustmentLevel } = getAdjustedCapacityMinutes(
    dateKey,
    settings,
    dayAdjustments,
  );
  const heavyCapacity = getAdjustedCapacityMinutesForIntensity(
    dateKey,
    settings,
    dayAdjustments,
    "heavy",
  );
  const lightCapacity = getAdjustedCapacityMinutesForIntensity(
    dateKey,
    settings,
    dayAdjustments,
    "light",
  );
  const intensityCapacities = {
    heavy: heavyCapacity.usableCapacity,
    light: lightCapacity.usableCapacity,
  };

  const tasks = buildHistoryTasksForDate(dateKey, courses, intensityCapacities);
  const totalMinutes = tasks.reduce((total, task) => total + task.estimatedMinutes, 0);
  const intensityLoads = summarizeIntensityLoads(tasks, intensityCapacities);
  const loadLevel = getCombinedLoadLevel(totalMinutes, usableCapacity, intensityLoads);

  return {
    date: dateKey,
    label: formatDayLabel(dateKey),
    isToday: false,
    isPast: true,
    isWeekend: isWeekendDate(dateKey),
    adjustmentLevel,
    tasks,
    totalMinutes,
    totalUnits: tasks.reduce((total, task) => total + task.studyBlockCount, 0),
    capacityMinutes: usableCapacity,
    rawCapacityMinutes: rawCapacity,
    loadRatio: usableCapacity <= 0 ? 0 : round(totalMinutes / usableCapacity),
    loadLevel,
    intensityLoads,
    summary: tasks.length
      ? `这一天实际推进了 ${tasks.reduce((total, task) => total + task.studyBlockCount, 0)} 个学习块。`
      : "这一天没有记录到已完成内容。",
  };
}

function appendSegmentToTask(
  state: VirtualCourseState,
  lectureRef: PlannableLecture,
  segmentMinutes: number,
  dateKey: string,
  usableCapacity: number,
  taskMap: Map<string, CourseTaskSuggestion>,
  rankedEntries: PriorityScoreEntry[],
  decisionMap: DecisionMap,
  reasonOverride?: string,
  whyNowOverride?: string,
  startsNewSlot = false,
  advanceAwaitingCompletion = false,
) {
  const entry = rankedEntries.find((item) => item.courseId === state.course.id);
  const priorityRank = entry?.rank ?? rankedEntries.length + 1;
  const taskId = `task:${dateKey}:${state.course.id}`;
  const existingTask = taskMap.get(state.course.id);
  const nextDecision = decisionMap.get(taskId);
  const segment: StudyTaskSegment = {
    lectureId: lectureRef.lecture.id,
    lectureTitle: lectureRef.lecture.title,
    minutes: segmentMinutes,
    startMinute: lectureRef.cursorMinute,
    endMinute: lectureRef.cursorMinute + segmentMinutes,
  };

  if (advanceAwaitingCompletion || !lectureRef.awaitingCompletion) {
    lectureRef.cursorMinute += segmentMinutes;
    lectureRef.remainingMinutes = Math.max(0, lectureRef.remainingMinutes - segmentMinutes);
  }

  if (existingTask) {
    existingTask.estimatedMinutes += segmentMinutes;
    existingTask.lectureIds = dedupeStrings([...existingTask.lectureIds, lectureRef.lecture.id]);
    existingTask.lectureTitles = dedupeStrings([...existingTask.lectureTitles, lectureRef.lecture.title]);
    existingTask.unitIds = dedupeStrings([...existingTask.unitIds, lectureRef.lecture.id]);
    existingTask.unitTitles = dedupeStrings([...existingTask.unitTitles, lectureRef.lecture.title]);
    existingTask.studyBlockCount = getTaskUnitCount(existingTask);
    existingTask.todayTargetUnits = existingTask.studyBlockCount;
    existingTask.slotCount = getTaskSlotCount(existingTask) + (startsNewSlot ? 1 : 0);
    existingTask.segments.push(segment);
    existingTask.recommendedLectures = dedupeLectures([
      ...existingTask.recommendedLectures,
      lectureRef.lecture,
    ]);
    existingTask.loadRatio =
      usableCapacity <= 0 ? 0 : round(existingTask.estimatedMinutes / usableCapacity);
  } else {
    taskMap.set(state.course.id, {
      taskId,
      courseId: state.course.id,
      itemId: state.course.id,
      courseName: state.course.name,
      itemTitle: state.course.name,
      provider: state.course.provider,
      color: state.course.color,
      intensity: getCourseIntensity(state.course),
      sourceType: getCourseSourceType(state.course),
      learningItemType: getCourseLearningItemType(state.course),
      actionType: getStudyActionType(state.course),
      actionLabel: getStudyActionLabel(getStudyActionType(state.course)),
      sourceLabel: getSourceLabel(state.course),
      roadmapTrack: getCourseRoadmapTrack(state.course),
      roadmapPhase: getCourseRoadmapPhase(state.course),
      roadmapOrder: getCourseRoadmapOrder(state.course),
      roadmapRoute: getCourseRoadmapRoute(state.course),
      roadmapYear: getCourseRoadmapYear(state.course),
      roadmapStatus: getCourseRoadmapStatus(state.course),
      scheduleMode: getCourseScheduleMode(state.course),
      date: dateKey,
      order: taskMap.size + 1,
      level: entry?.riskLevel ?? "low",
      status: nextDecision?.status ?? "pending",
      daysLeft: entry?.daysLeft ?? differenceInCalendarDays(state.course.deadline, dateKey),
      remainingUnits: Math.max(0, state.remainingLectures.length),
      todayTargetUnits: 1,
      studyBlockCount: 1,
      slotCount: 1,
      estimatedMinutes: segmentMinutes,
      capacityMinutes: usableCapacity,
      loadRatio: usableCapacity <= 0 ? 0 : round(segmentMinutes / usableCapacity),
      skipPenalty: round(Math.max(0, (entry?.requiredDailyPace ?? 0) - (entry?.recentDailyPace ?? 0))),
      requiredDailyPace: entry?.requiredDailyPace ?? 0,
      recentDailyPace: entry?.recentDailyPace ?? 0,
      tomorrowRequiredDailyPace: round(
        Math.max(
          0,
          minutesToHours(entry?.remainingMinutes ?? 0) /
            (entry?.daysLeft != null && entry.daysLeft > 1 ? entry.daysLeft - 1 : 1),
        ),
      ),
      reason:
        reasonOverride ??
        (entry ? buildTaskReason(entry) : "Scheduled from the current planning result."),
      whyNow:
        whyNowOverride ??
        (entry?.breakdown.explanation ?? "This course is currently one of the higher-priority items."),
      riskScore: entry?.score ?? 0,
      priorityRank,
      lectureIds: [lectureRef.lecture.id],
      lectureTitles: [lectureRef.lecture.title],
      unitIds: [lectureRef.lecture.id],
      unitTitles: [lectureRef.lecture.title],
      referenceResources: [],
      segments: [segment],
      recommendedLectures: [lectureRef.lecture],
      priorityBreakdown: entry?.breakdown ?? EMPTY_BREAKDOWN,
    });
  }

  state.lastStudiedDate = dateKey;
  state.remainingLectures = state.remainingLectures.filter(
    (lecture) =>
      (!advanceAwaitingCompletion && lecture.awaitingCompletion) || lecture.remainingMinutes > 0,
  );
  return segmentMinutes;
}

function appendManualMoveTask(
  taskMove: ManualTaskMove,
  course: Course,
  dateKey: string,
  usableCapacity: number,
  taskMap: Map<string, CourseTaskSuggestion>,
  rankedEntries: PriorityScoreEntry[],
  decisionMap: DecisionMap,
) {
  const entry = rankedEntries.find((item) => item.courseId === course.id);
  const priorityRank = entry?.rank ?? rankedEntries.length + 1;
  const taskId = `task:${dateKey}:${course.id}`;
  const nextDecision = decisionMap.get(taskId);
  const recommendedLectures = dedupeLectures(
    course.lectures.filter((lecture) =>
      taskMove.segments.some((segment) => segment.lectureId === lecture.id),
    ),
  );
  const estimatedMinutes =
    taskMove.estimatedMinutes ||
    taskMove.segments.reduce((total, segment) => total + segment.minutes, 0);
  const lectureIds = dedupeStrings(
    taskMove.lectureIds ?? taskMove.segments.map((segment) => segment.lectureId),
  );
  const lectureTitles = dedupeStrings(
    taskMove.lectureTitles ?? taskMove.segments.map((segment) => segment.lectureTitle),
  );
  const unitIds = dedupeStrings(
    taskMove.unitIds ?? taskMove.lectureIds ?? taskMove.segments.map((segment) => segment.lectureId),
  );
  const unitTitles = dedupeStrings(
    taskMove.lectureTitles ?? taskMove.segments.map((segment) => segment.lectureTitle),
  );
  const studyBlockCount = Math.max(1, unitIds.length || lectureIds.length);
  const slotCount = Math.max(1, Math.round(taskMove.slotCount ?? 1));

  taskMap.set(course.id, {
    taskId,
    courseId: course.id,
    itemId: taskMove.itemId ?? course.id,
    courseName: course.name,
    itemTitle: course.name,
    provider: course.provider,
    color: course.color,
    intensity: getCourseIntensity(course),
    sourceType: getCourseSourceType(course),
    learningItemType: getCourseLearningItemType(course),
    actionType: taskMove.actionType ?? getStudyActionType(course),
    actionLabel: getStudyActionLabel(taskMove.actionType ?? getStudyActionType(course)),
    sourceLabel: getSourceLabel(course),
    roadmapTrack: getCourseRoadmapTrack(course),
    roadmapPhase: getCourseRoadmapPhase(course),
    roadmapOrder: getCourseRoadmapOrder(course),
    roadmapRoute: getCourseRoadmapRoute(course),
    roadmapYear: getCourseRoadmapYear(course),
    roadmapStatus: getCourseRoadmapStatus(course),
    scheduleMode: getCourseScheduleMode(course),
    date: dateKey,
    order: taskMap.size + 1,
    level: entry?.riskLevel ?? "low",
    status: nextDecision?.status ?? "pending",
    daysLeft: entry?.daysLeft ?? differenceInCalendarDays(course.deadline, dateKey),
    remainingUnits: Math.max(0, entry?.remainingUnits ?? 0),
    todayTargetUnits: studyBlockCount,
    studyBlockCount,
    slotCount,
    estimatedMinutes,
    capacityMinutes: usableCapacity,
    loadRatio: usableCapacity <= 0 ? 0 : round(estimatedMinutes / usableCapacity),
    skipPenalty: round(Math.max(0, (entry?.requiredDailyPace ?? 0) - (entry?.recentDailyPace ?? 0))),
    requiredDailyPace: entry?.requiredDailyPace ?? 0,
    recentDailyPace: entry?.recentDailyPace ?? 0,
    tomorrowRequiredDailyPace: round(
      Math.max(
        0,
        minutesToHours(entry?.remainingMinutes ?? 0) /
          (entry?.daysLeft != null && entry.daysLeft > 1 ? entry.daysLeft - 1 : 1),
      ),
    ),
    reason: "Pinned by your manual weekly adjustment.",
    whyNow: "You moved this task manually, so the planner is rebuilding the surrounding days around it.",
    riskScore: entry?.score ?? 0,
    priorityRank,
    lectureIds,
    lectureTitles,
    unitIds,
    unitTitles,
    referenceResources: [],
    segments: taskMove.segments,
    recommendedLectures,
    priorityBreakdown: entry?.breakdown ?? EMPTY_BREAKDOWN,
  });
}

function assignNextBlock(
  state: VirtualCourseState,
  dateKey: string,
  usableCapacity: number,
  slotMinutes: number,
  maxAllowedMinutes: number,
  taskMap: Map<string, CourseTaskSuggestion>,
  rankedEntries: PriorityScoreEntry[],
  decisionMap: DecisionMap,
  reasonOverride?: string,
  whyNowOverride?: string,
  advanceAwaitingCompletion = false,
) {
  const isWeeklyRoutine = getCourseScheduleCadence(state.course) === "weekly";

  if (isWeeklyRoutine) {
    const nextLecture = state.remainingLectures[0];
    const blockMinutes = nextLecture?.remainingMinutes ?? 0;
    if (
      !nextLecture ||
      blockMinutes <= 0 ||
      blockMinutes > slotMinutes ||
      maxAllowedMinutes < blockMinutes
    ) {
      return 0;
    }

    return appendSegmentToTask(
      state,
      nextLecture,
      blockMinutes,
      dateKey,
      usableCapacity,
      taskMap,
      rankedEntries,
      decisionMap,
      reasonOverride,
      whyNowOverride,
      true,
      advanceAwaitingCompletion,
    );
  }

  const targetMinutes = Math.min(slotMinutes, maxAllowedMinutes);
  let consumedMinutes = 0;
  let isFirstSegmentInSlot = true;

  while (consumedMinutes < targetMinutes) {
    const nextLecture = state.remainingLectures[0];
    if (!nextLecture || nextLecture.remainingMinutes <= 0) {
      break;
    }

    const segmentMinutes = nextLecture.awaitingCompletion && !advanceAwaitingCompletion
      ? targetMinutes - consumedMinutes
      : Math.min(targetMinutes - consumedMinutes, nextLecture.remainingMinutes);
    if (segmentMinutes <= 0) {
      break;
    }

    consumedMinutes += appendSegmentToTask(
      state,
      nextLecture,
      segmentMinutes,
      dateKey,
      usableCapacity,
      taskMap,
      rankedEntries,
      decisionMap,
      reasonOverride,
      whyNowOverride,
      isFirstSegmentInSlot,
      advanceAwaitingCompletion,
    );
    isFirstSegmentInSlot = false;

    if (nextLecture.awaitingCompletion && !advanceAwaitingCompletion) {
      break;
    }
  }

  return consumedMinutes;
}

interface RoadmapCandidateWithState {
  state: VirtualCourseState;
  candidate: RoadmapUnitCandidate;
  entry: PriorityScoreEntry;
  nextMinutes: number;
}

function buildRoadmapUnitCandidate(
  state: VirtualCourseState,
  slotMinutes: number,
): RoadmapUnitCandidate | null {
  const nextLecture = state.remainingLectures[0];
  if (!nextLecture) {
    return null;
  }

  return {
    itemId: state.course.id,
    itemTitle: state.course.name,
    unitId: nextLecture.lecture.id,
    unitTitle: nextLecture.lecture.title,
    sourceType: getCourseSourceType(state.course),
    learningItemType: getCourseLearningItemType(state.course),
    actionType: getStudyActionType(state.course),
    intensity: getCourseIntensity(state.course),
    roadmapTrack: getCourseRoadmapTrack(state.course),
    roadmapPhase: getCourseRoadmapPhase(state.course),
    roadmapOrder: getCourseRoadmapOrder(state.course),
    roadmapRoute: getCourseRoadmapRoute(state.course),
    roadmapYear: getCourseRoadmapYear(state.course),
    roadmapStatus: getCourseRoadmapStatus(state.course),
    estimatedMinutes: getAssignableNextMinutes(state, slotMinutes),
    progressMinutes: nextLecture.cursorMinute,
    remainingMinutes: nextLecture.remainingMinutes,
    dependencyIds: state.course.dependencyIds ?? [],
    softDependencyIds: state.course.softDependencyIds ?? [],
    scheduleMode: getCourseScheduleMode(state.course),
  };
}

function getRoadmapRiskRank(level: RiskLevel) {
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

function compareRoadmapCandidates(
  left: RoadmapCandidateWithState,
  right: RoadmapCandidateWithState,
) {
  const manualDeadlineDiff = compareManualDeadlineEntries(left.entry, right.entry);
  if (manualDeadlineDiff !== 0) {
    return manualDeadlineDiff;
  }

  const leftIsWeeklyRoutine = getCourseScheduleCadence(left.state.course) === "weekly";
  const rightIsWeeklyRoutine = getCourseScheduleCadence(right.state.course) === "weekly";
  if (leftIsWeeklyRoutine !== rightIsWeeklyRoutine) {
    return leftIsWeeklyRoutine ? -1 : 1;
  }

  const leftIsPhaseZeroLightStartup =
    left.candidate.intensity === "light" && left.candidate.roadmapPhase === 0;
  const rightIsPhaseZeroLightStartup =
    right.candidate.intensity === "light" && right.candidate.roadmapPhase === 0;
  if (leftIsPhaseZeroLightStartup !== rightIsPhaseZeroLightStartup) {
    return leftIsPhaseZeroLightStartup ? -1 : 1;
  }

  const pacePriorityDiff =
    getPaceStatusPriority(left.entry.paceStatus) - getPaceStatusPriority(right.entry.paceStatus);
  if (pacePriorityDiff !== 0) {
    return pacePriorityDiff;
  }

  const softDependencyDiff =
    right.entry.softDependencyCompletion - left.entry.softDependencyCompletion;
  if (softDependencyDiff !== 0) {
    return softDependencyDiff;
  }

  const phaseDiff = left.candidate.roadmapPhase - right.candidate.roadmapPhase;
  if (phaseDiff !== 0) {
    return phaseDiff;
  }

  const orderDiff = left.candidate.roadmapOrder - right.candidate.roadmapOrder;
  if (orderDiff !== 0) {
    return orderDiff;
  }

  const riskDiff =
    getRoadmapRiskRank(right.entry.riskLevel) - getRoadmapRiskRank(left.entry.riskLevel);
  if (riskDiff !== 0) {
    return riskDiff;
  }

  const scoreDiff = right.entry.score - left.entry.score;
  if (scoreDiff !== 0) {
    return scoreDiff;
  }

  const neglectDiff = right.entry.daysSinceLastStudy - left.entry.daysSinceLastStudy;
  if (neglectDiff !== 0) {
    return neglectDiff;
  }

  return left.candidate.itemTitle.localeCompare(right.candidate.itemTitle);
}

function compareSerialFocusStates(left: VirtualCourseState, right: VirtualCourseState) {
  const priorityDiff = getCoursePriority(right.course) - getCoursePriority(left.course);
  if (priorityDiff !== 0) {
    return priorityDiff;
  }

  const phaseDiff = getCourseRoadmapPhase(left.course) - getCourseRoadmapPhase(right.course);
  if (phaseDiff !== 0) {
    return phaseDiff;
  }

  const orderDiff = getCourseRoadmapOrder(left.course) - getCourseRoadmapOrder(right.course);
  if (orderDiff !== 0) {
    return orderDiff;
  }

  return left.course.name.localeCompare(right.course.name);
}

function compareManualDeadlineFocusStates(
  dateKey: string,
  left: VirtualCourseState,
  right: VirtualCourseState,
) {
  const leftDaysLeft = differenceInCalendarDays(left.course.deadline, dateKey);
  const rightDaysLeft = differenceInCalendarDays(right.course.deadline, dateKey);
  const daysLeftDiff = leftDaysLeft - rightDaysLeft;
  if (daysLeftDiff !== 0) {
    return daysLeftDiff;
  }

  const priorityDiff = getCoursePriority(right.course) - getCoursePriority(left.course);
  if (priorityDiff !== 0) {
    return priorityDiff;
  }

  const remainingMinutesDiff =
    sumLectureMinutes(right.remainingLectures) - sumLectureMinutes(left.remainingLectures);
  if (remainingMinutesDiff !== 0) {
    return remainingMinutesDiff;
  }

  return compareSerialFocusStates(left, right);
}

function getHeavySerialFocusCourseIds(
  states: VirtualCourseState[],
  dateKey: string,
  intensity: CourseIntensity,
  completionMap: Map<string, boolean>,
) {
  if (intensity !== "heavy") {
    return null;
  }

  const eligibleStates = states
    .filter((state) => getCourseIntensity(state.course) === "heavy")
    .filter((state) => getCourseScheduleCadence(state.course) !== "weekly")
    .filter((state) => getCourseScheduleMode(state.course) !== "reference")
    .filter((state) => areHardDependenciesSatisfied(state.course, completionMap))
    .filter((state) => state.remainingLectures.length > 0)
    .filter((state) => isCourseSchedulableOnDate(state.course, dateKey));
  const manualDeadlineFocusStates = eligibleStates
    .filter((state) => hasManualDeadlinePressure(state.course, dateKey))
    .sort((left, right) => compareManualDeadlineFocusStates(dateKey, left, right));
  if (manualDeadlineFocusStates.length > 0) {
    return new Set(manualDeadlineFocusStates.map((state) => state.course.id));
  }

  const laneFocusStates = new Map<HeavySerialLane, VirtualCourseState>();
  eligibleStates
    .sort(compareSerialFocusStates)
    .forEach((state) => {
      const lane = getHeavySerialLane(state.course);
      if (!laneFocusStates.has(lane)) {
        laneFocusStates.set(lane, state);
      }
    });

  return new Set([...laneFocusStates.values()].map((state) => state.course.id));
}

function buildRoadmapTaskWhyNow(entry: PriorityScoreEntry, candidate: RoadmapUnitCandidate) {
  const isWeeklyRoutine = candidate.roadmapTrack === "weekly-routine";
  const dependencyText =
    entry.softDependencyCompletion >= 1
      ? "软依赖已满足"
      : `软依赖完成 ${Math.round(entry.softDependencyCompletion * 100)}%`;
  const riskText =
    isWeeklyRoutine
      ? "每周固定训练目标"
      : entry.deadlineMode === "auto"
      ? "自动目标已纳入调度"
      : entry.riskLevel === "overdue"
      ? "已经逾期"
      : entry.riskLevel === "high"
        ? "deadline 压力较高"
        : entry.riskLevel === "medium"
          ? "有一定 deadline 压力"
          : "deadline 压力较低";
  const neglectText =
    entry.daysSinceLastStudy > 0
      ? `已经 ${entry.daysSinceLastStudy} 天没有推进`
      : "最近刚推进过";

  return `Phase ${candidate.roadmapPhase} / ${candidate.roadmapTrack} / ${dependencyText} / ${neglectText} / ${riskText}`;
}

function buildRoadmapPlannedDayForIntensity(
  dateKey: string,
  states: VirtualCourseState[],
  allCourses: Course[],
  settings: UserCapacitySettings,
  dayAdjustments: Record<string, number>,
  decisionMap: DecisionMap,
  todayKey: string,
  weeklyTaskIds: Set<string>,
  manualMoveMap: ManualMoveMap,
  weeklyCoverageCounts: WeeklyCoverageCounts,
  weeklyScheduledDates: WeeklyScheduledDates,
  completionMap: Map<string, boolean>,
  intensity: CourseIntensity,
) {
  const laneStates = states.filter((state) => getCourseIntensity(state.course) === intensity);
  const { rawCapacity, usableCapacity, adjustmentLevel } = getAdjustedCapacityMinutesForIntensity(
    dateKey,
    settings,
    dayAdjustments,
    intensity,
  );
  const slotMinutes = getSlotMinutesForIntensity(dateKey, settings, dayAdjustments, intensity);
  const targetTaskCount = getCoursesPerDayForIntensity(settings, intensity, dateKey);
  const taskMap = new Map<string, CourseTaskSuggestion>();
  const selectedItemIds = new Set<string>();
  const sameDayHistoryTasks =
    dateKey === todayKey
      ? buildHistoryTasksForDate(
          dateKey,
          laneStates.map((state) => state.course),
          { heavy: usableCapacity, light: usableCapacity },
          { heavy: slotMinutes, light: slotMinutes },
        )
      : [];
  const sameDayHistoryCourseIds = new Set(sameDayHistoryTasks.map((task) => task.courseId));
  const currentWeekKey = getWeekStartDateKey(dateKey);
  const isSchoolFillMode = settings.scheduleFillMode !== "deadline";
  const advanceAwaitingCompletion = dateKey > todayKey;
  const heavySerialFocusCourseIds = getHeavySerialFocusCourseIds(
    states,
    dateKey,
    intensity,
    completionMap,
  );
  let remainingCapacity = usableCapacity;

  sameDayHistoryTasks.forEach((task) => {
    taskMap.set(task.courseId, task);
    selectedItemIds.add(task.courseId);
    weeklyTaskIds.add(task.courseId);
    remainingCapacity = Math.max(0, remainingCapacity - task.estimatedMinutes);
  });

  const getStateByCourseId = (courseId: string) =>
    laneStates.find((item) => item.course.id === courseId);

  const getScheduledStatsForCourse = (courseId: string): ScheduledCourseStats => {
    const units =
      getScheduledBlocksThisWeek(weeklyCoverageCounts, currentWeekKey, courseId) +
      getAssignedBlocksForCourse(taskMap, courseId);

    return {
      units,
      minutes: units * slotMinutes,
    };
  };

  const getAssignedSlotCount = () =>
    [...taskMap.values()].reduce((total, task) => total + getTaskSlotCount(task), 0);

  const shouldIncludeEntry = (entry: PriorityScoreEntry) => {
    const state = getStateByCourseId(entry.courseId);
    if (state && getCourseScheduleCadence(state.course) === "weekly") {
      return entry.scheduleDebtBlocks > 0;
    }

    return (
      isSchoolFillMode ||
      !entry.isHoldback ||
      entry.maintenanceDue ||
      entry.scheduleDebtBlocks > 0
    );
  };

  const canAssignMoreToday = (entry: PriorityScoreEntry) =>
    getAssignedBlocksForCourse(taskMap, entry.courseId) < getDailyBlockCap(entry, usableCapacity);

  const isAllowedByHeavySerialLane = (state: VirtualCourseState) => {
    if (!heavySerialFocusCourseIds) {
      return true;
    }
    if (getCourseScheduleCadence(state.course) === "weekly") {
      return true;
    }

    return heavySerialFocusCourseIds.has(state.course.id);
  };

  const buildCandidateEntries = (includeSelectedItem = false) =>
    laneStates
      .filter((state) => !sameDayHistoryCourseIds.has(state.course.id))
      .filter((state) => includeSelectedItem || !selectedItemIds.has(state.course.id))
      .filter((state) => areHardDependenciesSatisfied(state.course, completionMap))
      .filter(isAllowedByHeavySerialLane)
      .filter((state) => isCourseSchedulableOnDate(state.course, dateKey))
      .map<RoadmapCandidateWithState | null>((state) => {
        const nextMinutes = getAssignableNextMinutes(state, slotMinutes);
        if (nextMinutes <= 0 || nextMinutes > remainingCapacity) {
          return null;
        }

        const candidate = buildRoadmapUnitCandidate(state, slotMinutes);
        if (!candidate || candidate.scheduleMode === "reference") {
          return null;
        }

        const entry = buildVirtualPriorityEntry(
          state,
          dateKey,
          settings,
          dayAdjustments,
          getScheduledStatsForCourse(state.course.id),
          weeklyTaskIds,
          new Set(taskMap.keys()),
          completionMap,
        );
        if (!shouldIncludeEntry(entry)) {
          return null;
        }
        if (!canAssignMoreToday(entry)) {
          return null;
        }
        if (
          !canScheduleWeeklyCourseOnDate(
            state.course,
            dateKey,
            entry,
            settings,
            dayAdjustments,
            manualMoveMap,
            weeklyScheduledDates,
          )
        ) {
          return null;
        }

        return {
          state,
          candidate,
          entry,
          nextMinutes,
        };
      })
      .filter((candidate): candidate is RoadmapCandidateWithState => Boolean(candidate))
      .sort(compareRoadmapCandidates);

  const manualMoves = (manualMoveMap.get(dateKey) ?? []).filter((taskMove) => {
    const state = getStateByCourseId(taskMove.courseId);
    return (
      Boolean(state) &&
      areHardDependenciesSatisfied(state!.course, completionMap) &&
      !sameDayHistoryCourseIds.has(taskMove.courseId) &&
      isCourseSchedulableOnDate(state!.course, dateKey)
    );
  });

  manualMoves.forEach((taskMove) => {
    const state = getStateByCourseId(taskMove.courseId);
    const course = state?.course;
    if (!course) {
      return;
    }

    const rankedEntries = rankPriorityEntries(
      buildCandidateEntries().map((candidate) => candidate.entry),
    );
    selectedItemIds.add(course.id);
    weeklyTaskIds.add(course.id);
    appendManualMoveTask(taskMove, course, dateKey, usableCapacity, taskMap, rankedEntries, decisionMap);
    remainingCapacity -= taskMove.estimatedMinutes;
    state.lastStudiedDate = dateKey;
  });

  while (
    selectedItemIds.size < targetTaskCount &&
    getAssignedSlotCount() < targetTaskCount &&
    remainingCapacity > 0
  ) {
    const candidatePool = buildCandidateEntries();
    const nextCandidate = candidatePool[0];
    if (!nextCandidate) {
      break;
    }

    const rankedEntries = rankPriorityEntries(
      candidatePool.map((candidate) => candidate.entry),
    );
    const whyNow = buildRoadmapTaskWhyNow(nextCandidate.entry, nextCandidate.candidate);
    const readableReason = `${getStudyActionLabel(nextCandidate.candidate.actionType)}: ${nextCandidate.candidate.unitTitle}`;
    const consumedMinutes = assignNextBlock(
      nextCandidate.state,
      dateKey,
      usableCapacity,
      slotMinutes,
      remainingCapacity,
      taskMap,
      rankedEntries,
      decisionMap,
      readableReason,
      whyNow,
      advanceAwaitingCompletion,
    );

    if (consumedMinutes <= 0) {
      break;
    }

    selectedItemIds.add(nextCandidate.state.course.id);
    weeklyTaskIds.add(nextCandidate.state.course.id);
    remainingCapacity -= consumedMinutes;
  }

  while (
    isSchoolFillMode &&
    getAssignedSlotCount() < targetTaskCount &&
    remainingCapacity > 0
  ) {
    const candidatePool = buildCandidateEntries(true);
    const nextCandidate = candidatePool[0];
    if (!nextCandidate) {
      break;
    }

    const rankedEntries = rankPriorityEntries(
      candidatePool.map((candidate) => candidate.entry),
    );
    const whyNow = `${buildRoadmapTaskWhyNow(
      nextCandidate.entry,
      nextCandidate.candidate,
    )} / 正常上课模式补满空槽`;
    const readableReason = `${getStudyActionLabel(nextCandidate.candidate.actionType)}: ${nextCandidate.candidate.unitTitle}`;
    const consumedMinutes = assignNextBlock(
      nextCandidate.state,
      dateKey,
      usableCapacity,
      slotMinutes,
      remainingCapacity,
      taskMap,
      rankedEntries,
      decisionMap,
      readableReason,
      whyNow,
      advanceAwaitingCompletion,
    );

    if (consumedMinutes <= 0) {
      break;
    }

    selectedItemIds.add(nextCandidate.state.course.id);
    weeklyTaskIds.add(nextCandidate.state.course.id);
    remainingCapacity -= consumedMinutes;
  }

  const courseMap = new Map(laneStates.map((state) => [state.course.id, state.course]));
  const tasks = [...taskMap.values()]
    .sort((left, right) => {
      if (left.roadmapPhase !== right.roadmapPhase) {
        return left.roadmapPhase - right.roadmapPhase;
      }
      if (left.priorityRank !== right.priorityRank) {
        return left.priorityRank - right.priorityRank;
      }
      return left.roadmapOrder - right.roadmapOrder;
    })
    .map((task, index) => {
      const course = courseMap.get(task.courseId);

      return {
        ...task,
        order: index + 1,
        capacityMinutes: usableCapacity,
        loadRatio: usableCapacity <= 0 ? 0 : round(task.estimatedMinutes / usableCapacity),
        referenceResources: course ? getReferenceResourcesForCourse(course, allCourses) : [],
      };
    });
  const totalMinutes = tasks.reduce((total, task) => total + task.estimatedMinutes, 0);
  const loadLevel = getLoadLevel(totalMinutes, usableCapacity);
  const intensityLoads = getEmptyIntensityLoads();
  intensityLoads[intensity] = summarizeIntensityLoad(tasks, usableCapacity);

  return {
    date: dateKey,
    label: formatDayLabel(dateKey),
    isToday: dateKey === todayKey,
    isPast: false,
    isWeekend: isWeekendDate(dateKey),
    adjustmentLevel,
    tasks,
    totalMinutes,
    totalUnits: tasks.length,
    capacityMinutes: usableCapacity,
    rawCapacityMinutes: rawCapacity,
    loadRatio: usableCapacity <= 0 ? 0 : round(totalMinutes / usableCapacity),
    loadLevel,
    intensityLoads,
    summary: buildDaySummary(loadLevel, tasks),
  } satisfies DayPlan;
}

function buildPlannedDay(
  dateKey: string,
  states: VirtualCourseState[],
  allCourses: Course[],
  settings: UserCapacitySettings,
  dayAdjustments: Record<string, number>,
  decisionMap: DecisionMap,
  todayKey: string,
  weeklyTaskIds: Set<string>,
  manualMoveMap: ManualMoveMap,
  weeklyCoverageCounts: WeeklyCoverageCounts,
  weeklyScheduledDates: WeeklyScheduledDates,
  completionMap: Map<string, boolean>,
) {
  const lanePlans = COURSE_INTENSITIES.map((intensity) =>
    buildRoadmapPlannedDayForIntensity(
      dateKey,
      states,
      allCourses,
      settings,
      dayAdjustments,
      decisionMap,
      todayKey,
      weeklyTaskIds,
      manualMoveMap,
      weeklyCoverageCounts,
      weeklyScheduledDates,
      completionMap,
      intensity,
    ),
  );
  const [heavyPlan, lightPlan] = lanePlans;
  const tasks = lanePlans
    .flatMap((plan) => plan.tasks)
    .map((task, index) => ({ ...task, order: index + 1 }));
  const totalMinutes = tasks.reduce((total, task) => total + task.estimatedMinutes, 0);
  const totalUnits = tasks.reduce((total, task) => total + task.studyBlockCount, 0);
  const capacityMinutes = lanePlans.reduce((total, plan) => total + plan.capacityMinutes, 0);
  const rawCapacityMinutes = lanePlans.reduce((total, plan) => total + plan.rawCapacityMinutes, 0);
  const intensityLoads = summarizeIntensityLoads(tasks, {
    heavy: heavyPlan.capacityMinutes,
    light: lightPlan.capacityMinutes,
  });
  const loadLevel = getCombinedLoadLevel(totalMinutes, capacityMinutes, intensityLoads);

  return {
    date: dateKey,
    label: formatDayLabel(dateKey),
    isToday: dateKey === todayKey,
    isPast: false,
    isWeekend: isWeekendDate(dateKey),
    adjustmentLevel: heavyPlan.adjustmentLevel,
    tasks,
    totalMinutes,
    totalUnits,
    capacityMinutes,
    rawCapacityMinutes,
    loadRatio: capacityMinutes <= 0 ? 0 : round(totalMinutes / capacityMinutes),
    loadLevel,
    intensityLoads,
    summary: buildDaySummary(loadLevel, tasks),
  } satisfies DayPlan;
}

function buildWeekFromRange(view: PlannerWeekMode, weekStartKey: string, allPlans: DayPlan[]) {
  const weekDates = Array.from({ length: 7 }, (_, index) => getDateKey(addDays(weekStartKey, index)));
  const days = weekDates
    .map((dateKey) => allPlans.find((plan) => plan.date === dateKey))
    .filter((plan): plan is DayPlan => Boolean(plan));

  return {
    weekKey: `${view}:${weekStartKey}`,
    startDate: weekStartKey,
    endDate: weekDates[6],
    view,
    days,
    totalMinutes: days.reduce((total, day) => total + day.totalMinutes, 0),
    totalUnits: days.reduce((total, day) => total + day.totalUnits, 0),
    overloadedDates: days.filter((day) => day.loadLevel === "overload").map((day) => day.date),
    underloadedDates: days.filter((day) => day.loadLevel === "light").map((day) => day.date),
    generatedAt: new Date().toISOString(),
  } satisfies WeeklyPlan;
}

function getLastActiveDeadline(courses: Course[]) {
  const activeDeadlines = courses
    .filter(isFiniteScheduledCourse)
    .filter((course) => course.lectures.some((lecture) => !lecture.completed))
    .map((course) => course.deadline)
    .filter(Boolean)
    .sort((left, right) => left.localeCompare(right));

  return activeDeadlines[activeDeadlines.length - 1] ?? null;
}

function getPlanningHorizonBounds(courses: Course[], currentWeekStartKey: string) {
  const minimumHorizonEndKey = getDateKey(
    addDays(currentWeekStartKey, MIN_PLANNING_HORIZON_DAYS),
  );

  return {
    minimumHorizonEndKey,
    maxHorizonEndKey: getDateKey(
      addDays(currentWeekStartKey, MAX_PLANNING_HORIZON_DAYS),
    ),
    lastDeadline: getLastActiveDeadline(courses),
  };
}

function hasRemainingFiniteScheduledWork(states: VirtualCourseState[]) {
  return states.some(
    (state) =>
      isFiniteScheduledCourse(state.course) && state.remainingLectures.length > 0,
  );
}

function buildMasterPlanWeek(
  weekStartKey: string,
  allPlans: DayPlan[],
  currentWeekStartKey: string,
  nextWeekStartKey: string,
) {
  const weekDates = Array.from({ length: 7 }, (_, index) => getDateKey(addDays(weekStartKey, index)));
  const days = weekDates
    .map((dateKey) => allPlans.find((plan) => plan.date === dateKey))
    .filter((plan): plan is DayPlan => Boolean(plan));

  return {
    weekKey: `master:${weekStartKey}`,
    startDate: weekStartKey,
    endDate: days[days.length - 1]?.date ?? weekDates[6],
    days,
    totalMinutes: days.reduce((total, day) => total + day.totalMinutes, 0),
    totalUnits: days.reduce((total, day) => total + day.totalUnits, 0),
    overloadedDates: days.filter((day) => day.loadLevel === "overload").map((day) => day.date),
    underloadedDates: days.filter((day) => day.loadLevel === "light").map((day) => day.date),
    generatedAt: new Date().toISOString(),
    isCurrentWeek: weekStartKey === currentWeekStartKey,
    isNextWeek: weekStartKey === nextWeekStartKey,
  } satisfies MasterPlanWeek;
}

function buildMasterPlanWeeks(
  allPlans: DayPlan[],
  currentWeekStartKey: string,
  nextWeekStartKey: string,
  planningHorizonEndKey: string,
) {
  const weeks: MasterPlanWeek[] = [];
  let cursorWeekStartKey = currentWeekStartKey;

  while (cursorWeekStartKey <= planningHorizonEndKey) {
    weeks.push(
      buildMasterPlanWeek(
        cursorWeekStartKey,
        allPlans,
        currentWeekStartKey,
        nextWeekStartKey,
      ),
    );
    cursorWeekStartKey = getDateKey(addDays(cursorWeekStartKey, 7));
  }

  return weeks;
}

function buildProjectedFinishSummary(
  initialStates: VirtualCourseState[],
  finalStates: VirtualCourseState[],
  allPlans: DayPlan[],
): ProjectedFinishSummary {
  const activeFiniteItemIds = new Set(
    initialStates
      .filter((state) => getCourseScheduleMode(state.course) === "scheduled")
      .filter((state) => getCourseScheduleCadence(state.course) !== "weekly")
      .filter((state) => state.remainingLectures.length > 0)
      .map((state) => state.course.id),
  );
  const remainingUnitsByItemId = new Map(
    finalStates.map((state) => [state.course.id, state.remainingLectures.length]),
  );
  const projectedFinishByItemId: Record<string, string> = {};

  allPlans.forEach((day) => {
    day.tasks.forEach((task) => {
      if (activeFiniteItemIds.has(task.courseId)) {
        projectedFinishByItemId[task.courseId] = day.date;
      }
    });
  });

  const unfinishedUnscheduledItemIds = [...activeFiniteItemIds].filter((itemId) => {
    const remainingUnits = remainingUnitsByItemId.get(itemId) ?? 0;
    return remainingUnits > 0 || !projectedFinishByItemId[itemId];
  });
  const unfinishedItemIdSet = new Set(unfinishedUnscheduledItemIds);
  const completedProjectedDates = Object.entries(projectedFinishByItemId)
    .filter(([itemId]) => !unfinishedItemIdSet.has(itemId))
    .map(([, date]) => date)
    .sort((left, right) => right.localeCompare(left));

  return {
    projectedFinishByItemId,
    roadmapProjectedFinishDate: completedProjectedDates[0] ?? null,
    unfinishedUnscheduledItemIds,
  };
}

function buildTodaySummary(todayPlan: DayPlan | undefined): TodayPlanSummary {
  if (!todayPlan) {
    return {
      tasks: [],
      baselineUnits: 0,
      baselineMinutes: 0,
      totalSkipPenalty: 0,
      highestRiskCourse: null,
      capacityMinutes: 0,
      withinCapacity: true,
      overloadMinutes: 0,
      scheduledCourses: 0,
      intensityLoads: getEmptyIntensityLoads(),
    };
  }

  const laneOverloadMinutes = COURSE_INTENSITIES.reduce(
    (total, intensity) =>
      total +
      Math.max(
        0,
        todayPlan.intensityLoads[intensity].minutes -
          todayPlan.intensityLoads[intensity].capacityMinutes,
      ),
    0,
  );

  return {
    tasks: todayPlan.tasks,
    baselineUnits: todayPlan.totalUnits,
    baselineMinutes: todayPlan.totalMinutes,
    totalSkipPenalty: round(todayPlan.tasks.reduce((total, task) => total + task.skipPenalty, 0)),
    highestRiskCourse: todayPlan.tasks[0] ?? null,
    capacityMinutes: todayPlan.capacityMinutes,
    withinCapacity: laneOverloadMinutes <= 0 && todayPlan.totalMinutes <= todayPlan.capacityMinutes,
    overloadMinutes: Math.max(
      laneOverloadMinutes,
      Math.max(0, todayPlan.totalMinutes - todayPlan.capacityMinutes),
    ),
    scheduledCourses: todayPlan.tasks.length,
    intensityLoads: todayPlan.intensityLoads,
  };
}

export function buildPlannerSnapshot(
  courses: Course[],
  settings: UserCapacitySettings,
  taskDecisions: StudyTaskDecision[],
  dayAdjustments: Record<string, number>,
  manualTaskMoves: ManualTaskMove[],
  referenceDate: Date = new Date(),
): PlannerSnapshot {
  const todayKey = getDateKey(referenceDate);
  const currentWeekStartKey = getWeekStartDateKey(referenceDate);
  const nextWeekStartKey = getDateKey(addDays(currentWeekStartKey, 7));
  const horizonStartKey = currentWeekStartKey;
  const { minimumHorizonEndKey, maxHorizonEndKey, lastDeadline } = getPlanningHorizonBounds(
    courses,
    currentWeekStartKey,
  );

  const decisionMap = buildDecisionMap(taskDecisions);
  const validManualTaskMoves = filterManualMovesWithinDeadline(manualTaskMoves, courses);
  const manualMoveMap = buildManualMoveMap(validManualTaskMoves);
  const reservedMinutesByCourse = buildReservedMinutesByCourse(validManualTaskMoves);
  const scheduledCourses = courses.filter(isCourseActiveScheduled);
  const planningStates = createVirtualStates(
    scheduledCourses,
    referenceDate,
    reservedMinutesByCourse,
  );
  const baseStates = createVirtualStates(scheduledCourses, referenceDate);
  const weeklyTaskIds = new Set<string>();

  const weeklyCoverageCounts: WeeklyCoverageCounts = new Map();
  const weeklyScheduledDates: WeeklyScheduledDates = new Map();
  const allPlans: DayPlan[] = [];
  let planningHorizonEndKey = minimumHorizonEndKey;

  for (
    let dateKey = horizonStartKey;
    dateKey <= maxHorizonEndKey;
    dateKey = getDateKey(addDays(dateKey, 1))
  ) {
    const completionMap = buildVirtualCompletionMap(planningStates);
    const dayPlan = differenceInCalendarDays(todayKey, dateKey) > 0
      ? buildPastDayPlan(dateKey, courses, settings, dayAdjustments)
        : buildPlannedDay(
          dateKey,
          planningStates,
          courses,
          settings,
          dayAdjustments,
          decisionMap,
          todayKey,
          weeklyTaskIds,
          manualMoveMap,
          weeklyCoverageCounts,
          weeklyScheduledDates,
          completionMap,
        );

    allPlans.push(dayPlan);
    recordPlannedDayCoverage(weeklyCoverageCounts, weeklyScheduledDates, dayPlan);
    planningHorizonEndKey = dateKey;

    if (
      dateKey >= minimumHorizonEndKey &&
      !hasRemainingFiniteScheduledWork(planningStates)
    ) {
      break;
    }
  }

  const todayPlan = buildTodaySummary(allPlans.find((plan) => plan.date === todayKey));
  const weeklyPlan = buildWeekFromRange("current", currentWeekStartKey, allPlans);
  const nextWeekPlan = buildWeekFromRange("next", nextWeekStartKey, allPlans);
  const masterPlan = buildMasterPlanWeeks(
    allPlans,
    currentWeekStartKey,
    nextWeekStartKey,
    planningHorizonEndKey,
  );
  const deadlineOverflowCourses = buildDeadlineOverflowCourses(
    planningStates,
    todayKey,
    settings,
    dayAdjustments,
  );

  const scheduledStatsMap = new Map<string, ScheduledCourseStats>();
  weeklyPlan.days.forEach((day) => {
    day.tasks.forEach((task) => {
      const currentStats = scheduledStatsMap.get(task.courseId) ?? { units: 0, minutes: 0 };
      currentStats.units += getTaskSlotCount(task);
      currentStats.minutes += task.estimatedMinutes;
      scheduledStatsMap.set(task.courseId, currentStats);
    });
  });

  const weeklyCourseIds = new Set(weeklyPlan.days.flatMap((day) => day.tasks.map((task) => task.courseId)));
  const todayCourseIds = new Set(todayPlan.tasks.map((task) => task.courseId));
  const currentCompletionMap = buildVirtualCompletionMap(baseStates);
  const priorityRanking = rankPriorityEntries(
    baseStates
      .filter((state) => areHardDependenciesSatisfied(state.course, currentCompletionMap))
      .map((state) =>
        buildVirtualPriorityEntry(
          state,
          todayKey,
          settings,
          dayAdjustments,
          scheduledStatsMap.get(state.course.id) ?? { units: 0, minutes: 0 },
          weeklyCourseIds,
          todayCourseIds,
          currentCompletionMap,
        ),
      ),
  );

  const capacitySummary = {
    todayMinutes: todayPlan.baselineMinutes,
    todayCapacity: todayPlan.capacityMinutes,
    todayLoadRatio:
      todayPlan.capacityMinutes <= 0 ? 0 : round(todayPlan.baselineMinutes / todayPlan.capacityMinutes),
    weeklyMinutes: weeklyPlan.totalMinutes,
    weeklyCapacity: weeklyPlan.days.reduce((total, day) => total + day.capacityMinutes, 0),
    todayHeavyMinutes: todayPlan.intensityLoads.heavy.minutes,
    todayHeavyCapacity: todayPlan.intensityLoads.heavy.capacityMinutes,
    todayLightMinutes: todayPlan.intensityLoads.light.minutes,
    todayLightCapacity: todayPlan.intensityLoads.light.capacityMinutes,
    weeklyHeavyMinutes: weeklyPlan.days.reduce(
      (total, day) => total + day.intensityLoads.heavy.minutes,
      0,
    ),
    weeklyHeavyCapacity: weeklyPlan.days.reduce(
      (total, day) => total + day.intensityLoads.heavy.capacityMinutes,
      0,
    ),
    weeklyLightMinutes: weeklyPlan.days.reduce(
      (total, day) => total + day.intensityLoads.light.minutes,
      0,
    ),
    weeklyLightCapacity: weeklyPlan.days.reduce(
      (total, day) => total + day.intensityLoads.light.capacityMinutes,
      0,
    ),
    overloadedDays: weeklyPlan.overloadedDates.length,
    underloadedDays: weeklyPlan.underloadedDates.length,
  };
  const projectedFinishSummary = buildProjectedFinishSummary(
    baseStates,
    planningStates,
    allPlans,
  );

  return {
    todayPlan,
    weeklyPlan,
    nextWeekPlan,
    masterPlan,
    planningHorizonEnd: planningHorizonEndKey,
    lastDeadline,
    projectedFinishByItemId: projectedFinishSummary.projectedFinishByItemId,
    roadmapProjectedFinishDate: projectedFinishSummary.roadmapProjectedFinishDate,
    unfinishedUnscheduledItemIds: projectedFinishSummary.unfinishedUnscheduledItemIds,
    deadlineOverflowCourses,
    horizonPlans: allPlans,
    priorityRanking,
    impossibleCourses: priorityRanking.filter((entry) => entry.impossibleToFinish),
    neglectedCourses: priorityRanking.filter(
      (entry) => entry.daysSinceLastStudy >= 3 && entry.remainingUnits > 0,
    ),
    capacitySummary,
  };
}

export function buildWeeklyLoadSeries(weeklyPlan: WeeklyPlan): CompletionSeriesItem[] {
  return weeklyPlan.days.map((day) => ({
    date: day.date,
    label: day.label,
    completed: day.totalMinutes,
  }));
}








