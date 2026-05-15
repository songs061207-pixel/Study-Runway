export type RiskLevel = "low" | "medium" | "high" | "overdue" | "completed";
export type LectureFilter = "all" | "pending" | "completed" | "lowUnderstanding";
export type LectureSortKey = "sequence" | "status" | "understanding" | "duration";
export type TopNavKey = "dashboard" | "today" | "goals" | "courses" | "insights" | "weekly";
export type StudyTaskStatus = "pending" | "completed" | "skipped";
export type LoadLevel = "light" | "balanced" | "heavy" | "overload";
export type PlannerWeekMode = "current" | "next";
export type LectureTimingStatus = "accurate" | "longer" | "shorter" | "inProgress" | "missing";
export type CourseTimingDirection = "mostlyLonger" | "mostlyShorter" | "mostlyAccurate" | "insufficientData";
export type CourseIntensity = "heavy" | "light";
export type LearningSourceType = "course" | "learningItem";
export type LearningItemType = "course" | "book" | "paper" | "roadmap" | "practice" | "project";
export type RoadmapScheduleMode = "scheduled" | "reference";
export type RoadmapRoute =
  | "foundation"
  | "ai-agent"
  | "spatial-interface"
  | "robotics"
  | "bci"
  | "career";
export type RoadmapYear = 1 | 2 | 3 | 4;
export type RoadmapStatus = "active" | "backlog" | "reference" | "archived";
export type DeadlineMode = "auto" | "manual";
export type ScheduleCadence = "roadmap" | "weekly";
export type StudyActionType = "watch" | "read" | "practice" | "build" | "reference";
export type ScheduleFillMode = "school" | "deadline";
export type GoalLevel = "quarter" | "month" | "week";
export type GoalStatus = "planned" | "active" | "completed" | "paused" | "archived";

export interface LectureStudySession {
  date: string;
  minutes: number;
}

export interface Lecture {
  id: string;
  order: number;
  title: string;
  completed: boolean;
  completedAt?: string;
  understanding?: number | null;
  estimatedMinutes: number;
  progressMinutes: number;
  studySessions: LectureStudySession[];
  actualMinutes?: number | null;
  notes: string;
}

export interface Course {
  id: string;
  canonicalId?: string;
  name: string;
  provider: string;
  totalUnits: number;
  lectureMinutes: number;
  deadline: string;
  color: string;
  notes: string;
  difficulty: number;
  intensity: CourseIntensity;
  priority: number;
  dependencyIds: string[];
  softDependencyIds: string[];
  roadmapId?: string;
  roadmapTrack: string;
  roadmapPhase: number;
  roadmapOrder: number;
  roadmapRoute: RoadmapRoute;
  roadmapYear: RoadmapYear;
  roadmapStatus: RoadmapStatus;
  scheduleMode: RoadmapScheduleMode;
  deadlineMode: DeadlineMode;
  scheduleCadence?: ScheduleCadence;
  weeklyTargetBlocks?: number;
  weeklySpacingDays?: number;
  sourceType?: LearningSourceType;
  learningItemType?: LearningItemType;
  sourceUrl?: string;
  createdAt: string;
  updatedAt: string;
  lectures: Lecture[];
}

export interface CourseInput {
  canonicalId?: string;
  name: string;
  provider: string;
  totalUnits: number;
  lectureMinutes: number;
  deadline: string;
  color: string;
  notes: string;
  difficulty: number;
  intensity: CourseIntensity;
  priority?: number;
  dependencyIds?: string[];
  softDependencyIds?: string[];
  roadmapId?: string;
  roadmapTrack?: string;
  roadmapPhase?: number;
  roadmapOrder?: number;
  roadmapRoute?: RoadmapRoute;
  roadmapYear?: RoadmapYear;
  roadmapStatus?: RoadmapStatus;
  scheduleMode?: RoadmapScheduleMode;
  deadlineMode?: DeadlineMode;
  scheduleCadence?: ScheduleCadence;
  weeklyTargetBlocks?: number;
  weeklySpacingDays?: number;
  sourceUrl?: string;
  lectureTitlesText: string;
}

export interface CourseMetrics {
  completedUnits: number;
  remainingUnits: number;
  progressPct: number;
  daysLeft: number;
  requiredDailyPace: number;
  recentDailyPace: number;
  recentCompletions: number;
  tomorrowRequiredDailyPace: number;
  skipPenalty: number;
  paceGap: number;
  riskLevel: RiskLevel;
  riskScore: number;
  statusLabel: string;
  estimatedMinutesRemaining: number;
  actualMinutesLogged: number;
  daysSinceLastStudy: number;
}
export interface LectureTimingInsight {
  lectureId: string;
  order: number;
  title: string;
  estimatedMinutes: number;
  actualMinutes: number | null;
  deltaMinutes: number | null;
  deltaRatio: number | null;
  timingStatus: LectureTimingStatus;
  suggestedEstimateMinutes: number | null;
  usedLegacyActualMinutes: boolean;
}

export interface CourseTimingCalibrationSummary {
  comparableLectureCount: number;
  completedLectureCount: number;
  totalEstimatedMinutes: number;
  totalActualMinutes: number;
  averageDeltaMinutes: number | null;
  dominantDirection: CourseTimingDirection;
  suggestedEstimateMinutes: number | null;
  largestVarianceLectures: LectureTimingInsight[];
}

export interface DashboardSummary {
  totalCourses: number;
  activeCourses: number;
  completedCourses: number;
  overdueCourses: number;
  dueSoonCourses: number;
  highRiskCourses: number;
  unitsCompleted: number;
  unitsRemaining: number;
  estimatedMinutesCompleted: number;
  estimatedMinutesRemaining: number;
  totalEstimatedMinutes: number;
  totalUnits: number;
  overallCompletionRate: number;
  recentDailyPace: number;
  requiredDailyPace: number;
}

export interface CompletionSeriesItem {
  date: string;
  label: string;
  completed: number;
}

export interface RiskSeriesItem {
  courseId: string;
  name: string;
  riskScore: number;
  level: RiskLevel;
  color: string;
  progressPct: number;
}

export type CoursePaceStatus = "rescue" | "active" | "holdback";

export interface PriorityBreakdownItem {
  key:
    | "deadlinePressure"
    | "backlogPressure"
    | "paceLagPressure"
    | "neglectPenalty"
    | "difficultyModifier"
    | "highRiskBoost"
    | "feasibilityPenalty"
    | "behindTargetBoost"
    | "aheadOfSchedulePenalty";
  label: string;
  value: number;
  detail: string;
}

export interface PriorityBreakdown {
  total: number;
  deadlinePressure: number;
  backlogPressure: number;
  paceLagPressure: number;
  neglectPenalty: number;
  difficultyModifier: number;
  highRiskBoost: number;
  feasibilityPenalty: number;
  behindTargetBoost: number;
  aheadOfSchedulePenalty: number;
  explanation: string;
  items: PriorityBreakdownItem[];
}

export interface PriorityScoreEntry {
  courseId: string;
  courseName: string;
  provider: string;
  color: string;
  intensity: CourseIntensity;
  sourceType: LearningSourceType;
  learningItemType: LearningItemType;
  roadmapTrack: string;
  roadmapPhase: number;
  roadmapOrder: number;
  roadmapRoute: RoadmapRoute;
  roadmapYear: RoadmapYear;
  roadmapStatus: RoadmapStatus;
  scheduleMode: RoadmapScheduleMode;
  deadlineMode: DeadlineMode;
  softDependencyCompletion: number;
  riskLevel: RiskLevel;
  score: number;
  rank: number;
  daysLeft: number;
  remainingUnits: number;
  remainingMinutes: number;
  daysSinceLastStudy: number;
  requiredDailyPace: number;
  recentDailyPace: number;
  scheduledMinutesThisWeek: number;
  scheduledUnitsThisWeek: number;
  inTodayPlan: boolean;
  inWeeklyPlan: boolean;
  impossibleToFinish: boolean;
  paceStatus: CoursePaceStatus;
  weeklyTargetBlocks: number;
  weeklyMaxBlocks: number;
  scheduleDebtBlocks: number;
  isHoldback: boolean;
  maintenanceDue: boolean;
  breakdown: PriorityBreakdown;
}

export interface StudyTaskSegment {
  lectureId: string;
  lectureTitle: string;
  minutes: number;
  startMinute?: number;
  endMinute?: number;
}

export interface RoadmapReferenceResource {
  id: string;
  title: string;
  type: LearningItemType;
  sourceUrl?: string;
  notes?: string;
}

export interface RoadmapUnitCandidate {
  itemId: string;
  itemTitle: string;
  unitId: string;
  unitTitle: string;
  sourceType: LearningSourceType;
  learningItemType: LearningItemType;
  actionType: StudyActionType;
  intensity: CourseIntensity;
  roadmapTrack: string;
  roadmapPhase: number;
  roadmapOrder: number;
  roadmapRoute: RoadmapRoute;
  roadmapYear: RoadmapYear;
  roadmapStatus: RoadmapStatus;
  estimatedMinutes: number;
  progressMinutes: number;
  remainingMinutes: number;
  dependencyIds: string[];
  softDependencyIds: string[];
  scheduleMode: RoadmapScheduleMode;
}

export interface RoadmapPriorityEntry extends PriorityScoreEntry {
  actionType: StudyActionType;
  sourceLabel: string;
  firstUnitTitle: string;
  referenceResources: RoadmapReferenceResource[];
}

export interface CourseTaskSuggestion {
  taskId: string;
  courseId: string;
  itemId: string;
  courseName: string;
  itemTitle: string;
  provider: string;
  color: string;
  intensity: CourseIntensity;
  sourceType: LearningSourceType;
  learningItemType: LearningItemType;
  actionType: StudyActionType;
  actionLabel: string;
  sourceLabel: string;
  roadmapTrack: string;
  roadmapPhase: number;
  roadmapOrder: number;
  roadmapRoute: RoadmapRoute;
  roadmapYear: RoadmapYear;
  roadmapStatus: RoadmapStatus;
  scheduleMode: RoadmapScheduleMode;
  date: string;
  order: number;
  level: RiskLevel;
  status: StudyTaskStatus;
  daysLeft: number;
  remainingUnits: number;
  todayTargetUnits: number;
  studyBlockCount: number;
  slotCount?: number;
  estimatedMinutes: number;
  capacityMinutes: number;
  loadRatio: number;
  skipPenalty: number;
  requiredDailyPace: number;
  recentDailyPace: number;
  tomorrowRequiredDailyPace: number;
  reason: string;
  whyNow: string;
  riskScore: number;
  priorityRank: number;
  lectureIds: string[];
  lectureTitles: string[];
  unitIds: string[];
  unitTitles: string[];
  referenceResources: RoadmapReferenceResource[];
  segments: StudyTaskSegment[];
  recommendedLectures: Lecture[];
  priorityBreakdown: PriorityBreakdown;
}

export type DailyStudyTask = CourseTaskSuggestion;

export interface IntensityLoadSummary {
  minutes: number;
  capacityMinutes: number;
  loadRatio: number;
  loadLevel: LoadLevel;
  scheduledCourses: number;
  totalUnits: number;
}

export interface TodayPlanSummary {
  tasks: CourseTaskSuggestion[];
  baselineUnits: number;
  baselineMinutes: number;
  totalSkipPenalty: number;
  highestRiskCourse: CourseTaskSuggestion | null;
  capacityMinutes: number;
  withinCapacity: boolean;
  overloadMinutes: number;
  scheduledCourses: number;
  intensityLoads: Record<CourseIntensity, IntensityLoadSummary>;
}

export interface UserCapacitySettings {
  weekdayMinutes: number;
  weekendMinutes: number;
  weekdayHeavyMinutes: number;
  weekdayLightMinutes: number;
  weekendHeavyMinutes: number;
  weekendLightMinutes: number;
  heavyCoursesPerDay: number;
  lightCoursesPerDay: number;
  weekendHeavyCoursesPerDay: number;
  weekendLightCoursesPerDay: number;
  maxCoursesPerDay: number;
  scheduleFillMode: ScheduleFillMode;
  bufferRatio: number;
  prioritizeHighRisk: boolean;
}

export interface LearningUnit {
  id: string;
  order: number;
  title: string;
  estimatedMinutes: number;
  progressMinutes: number;
  studySessions: LectureStudySession[];
  actualMinutes?: number | null;
  completed: boolean;
  completedAt?: string;
  notes: string;
}

export interface LearningItem {
  id: string;
  title: string;
  type: LearningItemType;
  intensity: CourseIntensity;
  deadline: string;
  priority: number;
  estimatedMinutes: number;
  progressMinutes: number;
  dependencyIds: string[];
  softDependencyIds: string[];
  roadmapId?: string;
  roadmapTrack: string;
  roadmapPhase: number;
  roadmapOrder: number;
  roadmapRoute: RoadmapRoute;
  roadmapYear: RoadmapYear;
  roadmapStatus: RoadmapStatus;
  scheduleMode: RoadmapScheduleMode;
  deadlineMode: DeadlineMode;
  scheduleCadence?: ScheduleCadence;
  weeklyTargetBlocks?: number;
  weeklySpacingDays?: number;
  notes: string;
  sourceUrl?: string;
  createdAt: string;
  updatedAt: string;
  units: LearningUnit[];
}

export interface LearningItemInput {
  title: string;
  type: LearningItemType;
  intensity: CourseIntensity;
  deadline: string;
  priority: number;
  estimatedMinutes: number;
  dependencyIds: string[];
  softDependencyIds?: string[];
  roadmapId?: string;
  roadmapTrack?: string;
  roadmapPhase?: number;
  roadmapOrder?: number;
  roadmapRoute?: RoadmapRoute;
  roadmapYear?: RoadmapYear;
  roadmapStatus?: RoadmapStatus;
  scheduleMode?: RoadmapScheduleMode;
  deadlineMode?: DeadlineMode;
  scheduleCadence?: ScheduleCadence;
  weeklyTargetBlocks?: number;
  weeklySpacingDays?: number;
  notes: string;
  sourceUrl?: string;
  unitTitlesText: string;
}

export interface GoalChecklistItem {
  id: string;
  title: string;
  completed: boolean;
  completedAt?: string;
}

export interface StudyGoal {
  id: string;
  title: string;
  level: GoalLevel;
  parentGoalId?: string;
  startDate: string;
  endDate: string;
  status: GoalStatus;
  roadmapRoute: RoadmapRoute;
  roadmapYear: RoadmapYear;
  roadmapPhase?: number;
  linkedItemIds: string[];
  checklist: GoalChecklistItem[];
  outcome: string;
  order: number;
  createdAt: string;
  updatedAt: string;
}

export interface StudyGoalInput {
  title: string;
  level: GoalLevel;
  parentGoalId?: string;
  startDate: string;
  endDate: string;
  status: GoalStatus;
  roadmapRoute: RoadmapRoute;
  roadmapYear: RoadmapYear;
  roadmapPhase?: number;
  linkedItemIds: string[];
  checklistText: string;
  outcome: string;
  order?: number;
}

export interface StudyTaskDecision {
  taskId: string;
  courseId: string;
  itemId?: string;
  sourceType?: LearningSourceType;
  unitIds?: string[];
  actionType?: StudyActionType;
  date: string;
  status: StudyTaskStatus;
  decidedAt: string;
  unitCount: number;
  estimatedMinutes: number;
  actualMinutes?: number;
}

export interface ManualTaskMove {
  id: string;
  courseId: string;
  itemId?: string;
  sourceType?: LearningSourceType;
  unitIds?: string[];
  actionType?: StudyActionType;
  sourceDate: string;
  targetDate: string;
  lectureIds: string[];
  lectureTitles: string[];
  studyBlockCount: number;
  slotCount?: number;
  estimatedMinutes: number;
  segments: StudyTaskSegment[];
  createdAt: string;
}

export interface CourseSyllabusSyncPreview {
  presetName: string;
  provider: string;
  currentUnits: number;
  canonicalUnits: number;
  currentCompletedUnits: number;
  preservedCompletedUnits: number;
  matchedByTitle: number;
  hasChanges: boolean;
}

export interface CourseSyllabusSyncResult {
  status: "unsupported" | "unchanged" | "synced";
  preview?: CourseSyllabusSyncPreview;
  message: string;
}

export interface DayPlan {
  date: string;
  label: string;
  isToday: boolean;
  isPast: boolean;
  isWeekend: boolean;
  adjustmentLevel: number;
  tasks: CourseTaskSuggestion[];
  totalMinutes: number;
  totalUnits: number;
  capacityMinutes: number;
  rawCapacityMinutes: number;
  loadRatio: number;
  loadLevel: LoadLevel;
  intensityLoads: Record<CourseIntensity, IntensityLoadSummary>;
  summary: string;
}

export interface WeeklyPlan {
  weekKey: string;
  startDate: string;
  endDate: string;
  view: PlannerWeekMode;
  days: DayPlan[];
  totalMinutes: number;
  totalUnits: number;
  overloadedDates: string[];
  underloadedDates: string[];
  generatedAt: string;
}

export interface MasterPlanWeek {
  weekKey: string;
  startDate: string;
  endDate: string;
  days: DayPlan[];
  totalMinutes: number;
  totalUnits: number;
  overloadedDates: string[];
  underloadedDates: string[];
  generatedAt: string;
  isCurrentWeek: boolean;
  isNextWeek: boolean;
}

export interface ReplanCourseChange {
  courseId: string;
  courseName: string;
  beforeScore: number;
  afterScore: number;
  delta: number;
  beforeLevel: RiskLevel;
  afterLevel: RiskLevel;
}

export interface ReplanDayChange {
  date: string;
  label: string;
  beforeMinutes: number;
  afterMinutes: number;
  deltaMinutes: number;
  beforeLoad: LoadLevel;
  afterLoad: LoadLevel;
}

export interface ReplanImpact {
  skippedTaskId: string;
  skippedCourseId: string;
  skippedCourseName: string;
  tomorrowRequiredDelta: number;
  riskChanges: ReplanCourseChange[];
  heavierDays: ReplanDayChange[];
  overloadedDaysAfter: string[];
  summary: string;
}

export interface PlannerCapacitySummary {
  todayMinutes: number;
  todayCapacity: number;
  todayLoadRatio: number;
  weeklyMinutes: number;
  weeklyCapacity: number;
  todayHeavyMinutes: number;
  todayHeavyCapacity: number;
  todayLightMinutes: number;
  todayLightCapacity: number;
  weeklyHeavyMinutes: number;
  weeklyHeavyCapacity: number;
  weeklyLightMinutes: number;
  weeklyLightCapacity: number;
  overloadedDays: number;
  underloadedDays: number;
}
export interface DeadlineOverflowCourse {
  courseId: string;
  courseName: string;
  color: string;
  sourceType: LearningSourceType;
  learningItemType: LearningItemType;
  deadline: string;
  deadlineMode: DeadlineMode;
  remainingUnits: number;
  remainingMinutes: number;
  remainingStudyBlockCount: number;
  isAlreadyOverdue: boolean;
  overdueDays: number;
}

export interface ProjectedFinishSummary {
  projectedFinishByItemId: Record<string, string>;
  roadmapProjectedFinishDate: string | null;
  unfinishedUnscheduledItemIds: string[];
}

export interface PlannerSnapshot {
  todayPlan: TodayPlanSummary;
  weeklyPlan: WeeklyPlan;
  nextWeekPlan: WeeklyPlan;
  masterPlan: MasterPlanWeek[];
  planningHorizonEnd: string;
  lastDeadline: string | null;
  projectedFinishByItemId: Record<string, string>;
  roadmapProjectedFinishDate: string | null;
  unfinishedUnscheduledItemIds: string[];
  deadlineOverflowCourses: DeadlineOverflowCourse[];
  horizonPlans: DayPlan[];
  priorityRanking: PriorityScoreEntry[];
  impossibleCourses: PriorityScoreEntry[];
  neglectedCourses: PriorityScoreEntry[];
  capacitySummary: PlannerCapacitySummary;
}

export interface PlannerStorageState {
  version: 1;
  updatedAt: string;
  settings: UserCapacitySettings;
  taskDecisions: StudyTaskDecision[];
  dayAdjustments: Record<string, number>;
  manualTaskMoves?: ManualTaskMove[];
  lastReplanAt?: string;
}

export interface CourseStorageState {
  version: 2;
  updatedAt: string;
  courseOrder: string[];
  coursesById: Record<string, Course>;
}

export type CourseImportSource = "direct" | "proxy" | "preset";

export interface CourseImportPreview {
  normalizedUrl: string;
  name: string;
  provider: string;
  totalUnits: number;
  lectureMinutes?: number;
  notes: string;
  lectureTitles: string[];
  color: string;
  difficulty?: number;
  intensity?: CourseIntensity;
  roadmapTrack?: string;
  roadmapPhase?: number;
  roadmapOrder?: number;
  roadmapRoute?: RoadmapRoute;
  roadmapYear?: RoadmapYear;
  roadmapStatus?: RoadmapStatus;
  scheduleMode?: RoadmapScheduleMode;
  source: CourseImportSource;
  warnings: string[];
}
