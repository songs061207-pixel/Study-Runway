import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useCourseContext } from "../../context/CourseContext";
import { buildReplanImpact } from "../../simulation/replanSimulation";
import {
  CourseTaskSuggestion,
  Lecture,
  LearningUnit,
  PlannerSnapshot,
  ReplanImpact,
  StudyTaskDecision,
} from "../../types";
import { formatDaysLeft } from "../../utils/date";
import { formatHoursPerDay } from "../../utils/courseMetrics";
import { buildGoalsByLinkedItem } from "../../utils/goalProgress";
import { learningItemToCourse } from "../../utils/learningFactory";
import { isRoadmapActiveScheduled } from "../../utils/roadmapMetadata";
import { isStudyUnitAwaitingCompletion } from "../../utils/studyProgress";
import { MAX_STUDY_LOG_MINUTES, clampStudyMinutes } from "../../utils/studyLimits";
import { ReplanImpactPanel } from "../planner/ReplanImpactPanel";
import { RiskBadge } from "../ui/RiskBadge";

interface TodayPlanPanelProps {
  snapshot: PlannerSnapshot;
  title?: string;
  description?: string;
  limit?: number;
}

interface ActionNotice {
  tone: "success" | "warning";
  title: string;
  detail: string;
}

interface StableTaskPlan {
  primaryLectureId: string | null;
  lectureIds: string[];
  lectureTitles: string[];
  recommendedLectures: Lecture[];
  segments: CourseTaskSuggestion["segments"];
}

interface StoredTaskLecturePin {
  taskId: string;
  date: string;
  primaryLectureId: string;
  lectureIds: string[];
  lectureTitles: string[];
  segments: CourseTaskSuggestion["segments"];
  pinnedAt: string;
}

const TASK_LECTURE_PINS_STORAGE_KEY = "study-runway:task-lecture-pins:v2";

function loadStoredTaskLecturePins(): Record<string, StoredTaskLecturePin> {
  if (typeof window === "undefined") {
    return {};
  }

  try {
    const rawValue = window.localStorage.getItem(TASK_LECTURE_PINS_STORAGE_KEY);
    if (!rawValue) {
      return {};
    }

    const parsedValue = JSON.parse(rawValue) as Record<string, StoredTaskLecturePin>;
    return Object.fromEntries(
      Object.entries(parsedValue).filter(
        ([taskId, pin]) =>
          Boolean(taskId) &&
          typeof pin?.primaryLectureId === "string" &&
          Array.isArray(pin.lectureIds) &&
          Array.isArray(pin.lectureTitles) &&
          Array.isArray(pin.segments),
      ),
    );
  } catch {
    return {};
  }
}

function saveStoredTaskLecturePins(pins: Record<string, StoredTaskLecturePin>) {
  if (typeof window === "undefined") {
    return;
  }

  try {
    window.localStorage.setItem(TASK_LECTURE_PINS_STORAGE_KEY, JSON.stringify(pins));
  } catch (error) {
    console.warn("Unable to persist task lecture pins.", error);
  }
}

function getLatestCompletedLectureOnTaskDate(
  task: CourseTaskSuggestion,
  lectures: Map<string, Lecture>,
) {
  return [...lectures.values()]
    .filter((lecture) => lecture.completed && lecture.completedAt === task.date)
    .sort((left, right) => right.order - left.order)[0] ?? null;
}

const statusLabels = {
  pending: "待执行",
  completed: "已记录时长",
  skipped: "已跳过",
} as const;

const intensityLabels = {
  heavy: "重学习",
  light: "轻学习",
} as const;

const intensitySections = [
  {
    intensity: "heavy" as const,
    title: "重学习槽：高精力时段优先完成",
    detail: "课程、算法章节、系统书籍和项目练习会在这条跑道里统一竞争。",
  },
  {
    intensity: "light" as const,
    title: "轻学习槽：状态一般时推进",
    detail: "轻课程、阅读、复盘和低负担资料会在这条跑道里自动混排。",
  },
] as const;

const noticeClasses = {
  success: "border-emerald-200 bg-emerald-50/80 text-emerald-800",
  warning: "border-amber-200 bg-amber-50/80 text-amber-800",
} as const;

function getPrimaryLectureId(task: CourseTaskSuggestion) {
  return task.lectureIds[0] ?? task.recommendedLectures[0]?.id ?? null;
}

function buildSegmentKey(segment: CourseTaskSuggestion["segments"][number]) {
  return `${segment.lectureId}:${segment.startMinute ?? 0}:${segment.endMinute ?? segment.minutes}:${segment.minutes}`;
}

function isStoredTaskPinValid(
  task: CourseTaskSuggestion,
  pin?: StoredTaskLecturePin,
) {
  if (!pin || pin.taskId !== task.taskId || pin.date !== task.date) {
    return false;
  }

  const currentLectureIds = new Set(task.lectureIds);
  if (!currentLectureIds.has(pin.primaryLectureId)) {
    return false;
  }

  const currentSegmentKeys = new Set(task.segments.map(buildSegmentKey));
  return pin.segments.every((segment) => currentSegmentKeys.has(buildSegmentKey(segment)));
}

function buildStableTaskPlan(
  task: CourseTaskSuggestion,
  pin?: StoredTaskLecturePin,
): StableTaskPlan {
  const validPin = isStoredTaskPinValid(task, pin) ? pin : undefined;
  const pinnedLectureIds = validPin?.lectureIds?.length ? validPin.lectureIds : task.lectureIds;
  const pinnedLectureTitles = validPin?.lectureTitles?.length ? validPin.lectureTitles : task.lectureTitles;

  return {
    primaryLectureId: validPin?.primaryLectureId ?? pinnedLectureIds[0] ?? getPrimaryLectureId(task),
    lectureIds: [...pinnedLectureIds],
    lectureTitles: [...pinnedLectureTitles],
    recommendedLectures: task.recommendedLectures.map((lecture) => ({
      ...lecture,
      studySessions: lecture.studySessions ? [...lecture.studySessions] : [],
    })),
    segments: (validPin?.segments?.length ? validPin.segments : task.segments).map((segment) => ({ ...segment })),
  };
}

function learningUnitToLecture(unit: LearningUnit): Lecture {
  return {
    ...unit,
    understanding: null,
  };
}

function parseRecordedMinutesDraft(rawValue: string | undefined) {
  const parsedValue = Number(rawValue);
  if (!Number.isFinite(parsedValue) || parsedValue <= 0) {
    return null;
  }

  return clampStudyMinutes(parsedValue, 1, MAX_STUDY_LOG_MINUTES);
}

export function TodayPlanPanel({
  snapshot,
  title = "今日学习动作",
  description = "这里不是提醒，而是 Roadmap 按进度、依赖、难度和容量自动排好的学习动作。",
  limit,
}: TodayPlanPanelProps) {
  const {
    courses,
    learningItems,
    goals,
    plannerSettings,
    taskDecisions,
    dayAdjustments,
    manualTaskMoves,
    recordStudyTaskTime,
    skipStudyTask,
    updateLecture,
    toggleLearningUnitCompletion,
  } = useCourseContext();
  const [impact, setImpact] = useState<ReplanImpact | null>(null);
  const [notice, setNotice] = useState<ActionNotice | null>(null);
  const [taskLecturePins, setTaskLecturePins] = useState<Record<string, StoredTaskLecturePin>>(
    () => loadStoredTaskLecturePins(),
  );
  const [stableTaskPlans, setStableTaskPlans] = useState<Record<string, StableTaskPlan>>({});
  const [recordedMinutesDrafts, setRecordedMinutesDrafts] = useState<Record<string, string>>({});
  const schedulableCourses = useMemo(
    () => [...courses, ...learningItems.map(learningItemToCourse)].filter(isRoadmapActiveScheduled),
    [courses, learningItems],
  );
  const goalsByItemId = useMemo(() => buildGoalsByLinkedItem(goals), [goals]);

  const visibleTasks = useMemo(
    () =>
      typeof limit === "number"
        ? snapshot.todayPlan.tasks.slice(0, limit)
        : snapshot.todayPlan.tasks,
    [limit, snapshot.todayPlan.tasks],
  );
  const todayDayPlan = useMemo(
    () => snapshot.weeklyPlan.days.find((day) => day.isToday),
    [snapshot.weeklyPlan.days],
  );
  const isTodayWeekend = todayDayPlan?.isWeekend ?? false;
  const taskGroups = useMemo(
    () =>
      intensitySections
        .map((section) => {
          const slotCount =
            section.intensity === "heavy"
              ? isTodayWeekend
                ? plannerSettings.weekendHeavyCoursesPerDay
                : plannerSettings.heavyCoursesPerDay
              : isTodayWeekend
                ? plannerSettings.weekendLightCoursesPerDay
                : plannerSettings.lightCoursesPerDay;

          return {
            ...section,
            slotCount,
            tasks: visibleTasks.filter((task) => task.intensity === section.intensity),
            load: snapshot.todayPlan.intensityLoads[section.intensity],
          };
        })
        .filter((section) => section.tasks.length > 0),
    [isTodayWeekend, plannerSettings, snapshot.todayPlan.intensityLoads, visibleTasks],
  );

  const stableTaskDateKey = visibleTasks[0]?.date ?? "no-date";
  const stableTaskPlanKey = useMemo(
    () =>
      `${stableTaskDateKey}:${visibleTasks
        .map(
          (task) =>
            `${task.taskId}:${task.estimatedMinutes}:${task.lectureIds.join(",")}:${task.segments
              .map(buildSegmentKey)
              .join(",")}`,
        )
        .join("|")}`,
    [stableTaskDateKey, visibleTasks],
  );

  const decisionMap = useMemo(
    () => new Map(taskDecisions.map((decision) => [decision.taskId, decision])),
    [taskDecisions],
  );

  useEffect(() => {
    setStableTaskPlans(
      Object.fromEntries(
        visibleTasks.map((task) => [task.taskId, buildStableTaskPlan(task, taskLecturePins[task.taskId])]),
      ),
    );
    setRecordedMinutesDrafts(
      Object.fromEntries(
        visibleTasks.map((task) => {
          const decision = decisionMap.get(task.taskId);
          const initialMinutes =
            decision?.status === "completed"
              ? ""
              : String(decision?.actualMinutes ?? decision?.estimatedMinutes ?? task.estimatedMinutes);

          return [task.taskId, initialMinutes];
        }),
      ),
    );
  }, [stableTaskPlanKey]);

  const courseLectureMaps = useMemo(() => {
    const maps = new Map<string, Map<string, Lecture>>();

    courses.forEach((course) => {
      maps.set(
        course.id,
        new Map(course.lectures.map((lecture) => [lecture.id, lecture])),
      );
    });

    return maps;
  }, [courses]);

  const learningItemUnitMaps = useMemo(() => {
    const maps = new Map<string, Map<string, Lecture>>();

    learningItems.forEach((item) => {
      maps.set(
        item.id,
        new Map(item.units.map((unit) => [unit.id, learningUnitToLecture(unit)])),
      );
    });

    return maps;
  }, [learningItems]);

  const primaryTaskLectures = useMemo(() => {
    const lecturesByTask = new Map<string, Lecture | null>();

    visibleTasks.forEach((task) => {
      const stablePlan = stableTaskPlans[task.taskId];
      const liveLectures =
        task.sourceType === "learningItem"
          ? learningItemUnitMaps.get(task.courseId)
          : courseLectureMaps.get(task.courseId);
      const fallbackLectureId = getPrimaryLectureId(task);
      const stableLectureId = stablePlan?.primaryLectureId ?? null;
      const completedTodayLecture = liveLectures
        ? getLatestCompletedLectureOnTaskDate(task, liveLectures)
        : null;
      const shouldPreferCompletedToday =
        completedTodayLecture && (!stableLectureId || stableLectureId === fallbackLectureId);
      const lectureId = shouldPreferCompletedToday
        ? completedTodayLecture.id
        : stableLectureId ?? fallbackLectureId;
      const resolvedLecture =
        (lectureId ? liveLectures?.get(lectureId) : null) ??
        (fallbackLectureId ? liveLectures?.get(fallbackLectureId) : null) ??
        null;

      lecturesByTask.set(task.taskId, resolvedLecture);
    });

    return lecturesByTask;
  }, [courseLectureMaps, learningItemUnitMaps, stableTaskPlans, visibleTasks]);

  if (snapshot.todayPlan.tasks.length === 0) {
    return (
      <section className="panel p-6">
        <p className="eyebrow">Today</p>
        <h2 className="section-title mt-2">{title}</h2>
        <p className="mt-3 text-sm text-slate-600">{description}</p>
        <div className="mt-6 rounded-[24px] border border-dashed border-slate-300 px-4 py-6 text-sm text-slate-500">
          今天没有必须执行的新学习动作。系统给你留出了缓冲，可以复盘、补记资料进度，或者去学习库与 Roadmap 里手动推进内容。        </div>
      </section>
    );
  }

  function buildSkippedDecision(
    taskId: string,
    courseId: string,
    date: string,
    units: number,
    minutes: number,
  ): StudyTaskDecision {
    return {
      taskId,
      courseId,
      date,
      status: "skipped",
      decidedAt: new Date().toISOString(),
      unitCount: units,
      estimatedMinutes: minutes,
    };
  }

  function handleRecordedMinutesChange(taskId: string, value: string) {
    setRecordedMinutesDrafts((currentDrafts) => ({
      ...currentDrafts,
      [taskId]: value,
    }));
  }

  function pinStableTaskPlan(
    task: CourseTaskSuggestion,
    plan: StableTaskPlan,
    primaryLecture?: Lecture,
  ) {
    const primaryLectureId = primaryLecture?.id ?? plan.primaryLectureId;
    if (!primaryLectureId) {
      return plan;
    }

    const lectureIds = primaryLecture
      ? [primaryLecture.id, ...plan.lectureIds.filter((lectureId) => lectureId !== primaryLecture.id)]
      : plan.lectureIds;
    const lectureTitles = primaryLecture
      ? [primaryLecture.title, ...plan.lectureTitles.filter((title) => title !== primaryLecture.title)]
      : plan.lectureTitles;
    const recommendedLectures = primaryLecture
      ? [primaryLecture, ...plan.recommendedLectures.filter((lecture) => lecture.id !== primaryLecture.id)]
      : plan.recommendedLectures;
    const pinnedPlan: StableTaskPlan = {
      ...plan,
      primaryLectureId,
      lectureIds,
      lectureTitles,
      recommendedLectures,
    };
    const pin: StoredTaskLecturePin = {
      taskId: task.taskId,
      date: task.date,
      primaryLectureId,
      lectureIds,
      lectureTitles,
      segments: pinnedPlan.segments,
      pinnedAt: new Date().toISOString(),
    };

    setStableTaskPlans((currentPlans) => ({
      ...currentPlans,
      [task.taskId]: pinnedPlan,
    }));
    setTaskLecturePins((currentPins) => {
      const nextPins = {
        ...currentPins,
        [task.taskId]: pin,
      };
      saveStoredTaskLecturePins(nextPins);
      return nextPins;
    });

    return pinnedPlan;
  }

  function handleRecordStudyTime(taskId: string) {
    const task = snapshot.todayPlan.tasks.find((item) => item.taskId === taskId);
    if (!task) {
      return;
    }

    const stablePlan = stableTaskPlans[taskId] ?? buildStableTaskPlan(task, taskLecturePins[task.taskId]);
    const pinnedPlan = pinStableTaskPlan(task, stablePlan);
    const stableTask = {
      ...task,
      lectureIds: pinnedPlan.lectureIds,
      lectureTitles: pinnedPlan.lectureTitles,
      recommendedLectures: pinnedPlan.recommendedLectures,
      segments: pinnedPlan.segments,
    };
    const recordedMinutes = parseRecordedMinutesDraft(recordedMinutesDrafts[taskId]);
    if (recordedMinutes == null) {
      setNotice({
        tone: "warning",
        title: "请输入本次新增学习时间",
        detail: `本次记录需要是 1-${MAX_STUDY_LOG_MINUTES} 分钟之间的数字。`,
      });
      return;
    }

    setImpact(null);
    setNotice({
      tone: "success",
      title: `已记录 ${task.courseName} 的学习时间`,
      detail: `已追加 ${recordedMinutes} 分钟。记录时间只推进进度，unit 是否完成仍由你手动确认。`,
    });
    recordStudyTaskTime(stableTask, recordedMinutes);
    setRecordedMinutesDrafts((currentDrafts) => ({
      ...currentDrafts,
      [taskId]: "",
    }));
  }

  function handleSkip(taskId: string) {
    const task = snapshot.todayPlan.tasks.find((item) => item.taskId === taskId);
    if (!task || task.status !== "pending") {
      return;
    }

    const nextDecisions = [
      ...taskDecisions.filter((decision) => decision.taskId !== task.taskId),
      buildSkippedDecision(
        task.taskId,
        task.courseId,
        task.date,
        task.todayTargetUnits,
        task.estimatedMinutes,
      ),
    ];

    const nextImpact = buildReplanImpact(
      schedulableCourses,
      plannerSettings,
      nextDecisions,
      dayAdjustments,
      manualTaskMoves,
      snapshot,
      task.taskId,
    );

    setImpact(nextImpact);
    setNotice({
      tone: "warning",
      title: `已跳过 ${task.courseName}`,
      detail:
        nextImpact?.summary ??
        "系统已经把这项任务顺延，明天和本周后半段的压力会随之提高。",
    });
    skipStudyTask(task);
  }

  function handleLectureCompletion(
    task: CourseTaskSuggestion,
    lecture: Lecture,
    completed: boolean,
  ) {
    const stablePlan = stableTaskPlans[task.taskId] ?? buildStableTaskPlan(task, taskLecturePins[task.taskId]);
    pinStableTaskPlan(task, stablePlan, lecture);
    if (task.sourceType === "learningItem") {
      toggleLearningUnitCompletion(task.courseId, lecture.id);
    } else {
      updateLecture(task.courseId, lecture.id, { completed });
    }
    setNotice({
      tone: "success",
      title: completed ? `已标记完成：${lecture.title}` : `已取消完成：${lecture.title}`,
      detail: completed
        ? `${task.courseName} 的这个 unit 已被你手动设为完成。`
        : `${task.courseName} 的这个 unit 已恢复为未完成，已记录的学习时间会保留。`,
    });
  }

  return (
    <section className="panel p-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="eyebrow">Today</p>
          <h2 className="section-title mt-2">{title}</h2>
          <p className="mt-3 text-sm text-slate-600">{description}</p>
        </div>

        <div className="grid gap-3 sm:grid-cols-4">
          <div className="rounded-2xl bg-slate-950 px-4 py-3 text-white">
            <p className="text-xs text-slate-400">学习动作</p>
            <p className="mt-2 text-xl font-semibold">{snapshot.todayPlan.scheduledCourses} 项</p>
          </div>
          <div className="rounded-2xl bg-slate-50 px-4 py-3">
            <p className="text-xs text-slate-500">总任务数</p>
            <p className="mt-2 text-xl font-semibold text-slate-950">
              {snapshot.todayPlan.tasks.length} 项</p>
          </div>
          <div className="rounded-2xl bg-slate-50 px-4 py-3">
            <p className="text-xs text-slate-500">重学习负载</p>
            <p className="mt-2 text-xl font-semibold text-slate-950">
              {snapshot.todayPlan.intensityLoads.heavy.minutes}/{snapshot.todayPlan.intensityLoads.heavy.capacityMinutes} 分钟
            </p>
            <p className="mt-1 text-xs text-slate-500">高精力池独立计算</p>
          </div>
          <div className="rounded-2xl bg-slate-50 px-4 py-3">
            <p className="text-xs text-slate-500">轻学习负载</p>
            <p className="mt-2 text-xl font-semibold text-slate-950">
              {snapshot.todayPlan.intensityLoads.light.minutes}/{snapshot.todayPlan.intensityLoads.light.capacityMinutes} 分钟
            </p>
            <p className="mt-1 text-xs text-slate-500">
              {snapshot.todayPlan.withinCapacity
                ? "低精力池仍在容量内"
                : `超载 ${snapshot.todayPlan.overloadMinutes} 分钟`}
            </p>
          </div>
        </div>
      </div>

      {notice ? (
        <div className={`mt-6 rounded-[24px] border px-4 py-4 ${noticeClasses[notice.tone]}`}>
          <p className="text-sm font-semibold">{notice.title}</p>
          <p className="mt-1 text-sm">{notice.detail}</p>
        </div>
      ) : null}

      <div className="mt-6 space-y-6">
        {taskGroups.map((group) => (
          <div key={group.intensity} className="space-y-4">
            <div className="rounded-[24px] border border-slate-200 bg-white px-4 py-4">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <h3 className="text-base font-semibold text-slate-950">{group.title}</h3>
                  <p className="mt-1 text-sm text-slate-600">{group.detail}</p>
                </div>
                <span className="rounded-full bg-slate-50 px-3 py-1 text-xs font-medium text-slate-600 ring-1 ring-slate-200">
                  {group.slotCount} 个槽 · 约 {Math.floor(group.load.capacityMinutes / Math.max(1, group.slotCount))} 分钟/槽 · {group.load.minutes}/{group.load.capacityMinutes} 分钟
                </span>
              </div>
            </div>

            {group.tasks.map((task, index) => {
          const stablePlan = stableTaskPlans[task.taskId];
          const isWeeklyRoutine = task.roadmapTrack === "weekly-routine";
          const primaryLecture = primaryTaskLectures.get(task.taskId) ?? null;
          const awaitingManualCompletion = primaryLecture
            ? isStudyUnitAwaitingCompletion(primaryLecture)
            : false;
          const lectureTitles = stablePlan?.lectureTitles.length
            ? stablePlan.lectureTitles
            : task.lectureTitles;
          const taskDecision = decisionMap.get(task.taskId);
          const plannedMinutes = taskDecision?.estimatedMinutes ?? task.estimatedMinutes;
          const actualMinutes = taskDecision?.actualMinutes;
          const draftMinutes = recordedMinutesDrafts[task.taskId] ?? String(plannedMinutes);
          const parsedDraftMinutes = parseRecordedMinutesDraft(draftMinutes);
          const canRecordMinutes = parsedDraftMinutes != null;
          const linkedGoals = goalsByItemId.get(task.courseId) ?? [];

          return (
            <article
              key={task.taskId}
              className="rounded-[28px] border border-slate-200 bg-slate-50/80 p-5"
            >
              <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-3">
                    <span className="rounded-full bg-slate-950 px-3 py-1 text-xs font-semibold text-white">
                      {task.order || index + 1}
                    </span>
                    <span className="h-3 w-3 rounded-full" style={{ backgroundColor: task.color }} />
                    <p className="text-lg font-semibold text-slate-950">{task.courseName}</p>
                    <span className="rounded-full bg-white px-3 py-1 text-xs font-medium text-slate-600 ring-1 ring-slate-200">
                      {intensityLabels[task.intensity]}
                    </span>
                    {isWeeklyRoutine ? null : <RiskBadge level={task.level} />}
                    <span className="rounded-full bg-white px-3 py-1 text-xs font-medium text-slate-600 ring-1 ring-slate-200">
                      Priority #{task.priorityRank}
                    </span>
                    <span className="rounded-full bg-white px-3 py-1 text-xs font-medium text-slate-600 ring-1 ring-slate-200">
                      {statusLabels[task.status]}
                    </span>
                  </div>

                  <p className="mt-3 text-sm text-slate-500">
                    {isWeeklyRoutine ? "每周固定" : formatDaysLeft(task.daysLeft)} · {task.actionLabel ?? "学习"} · 计划 {plannedMinutes} 分钟
                    {actualMinutes != null ? ` · 实记 ${actualMinutes} 分钟` : ""}
                  </p>
                  <p className="mt-2 text-sm text-slate-500">
                    来源：{task.sourceLabel ?? task.provider} ·{" "}
                    {isWeeklyRoutine ? "每周固定训练" : `Phase ${task.roadmapPhase}`} · {task.roadmapTrack}
                  </p>
                  {linkedGoals.length > 0 ? (
                    <div className="mt-3 flex flex-wrap gap-2">
                      {linkedGoals.slice(0, 3).map((goal) => (
                        <Link
                          key={goal.id}
                          to="/goals"
                          className="rounded-full bg-teal-50 px-3 py-1 text-xs font-medium text-teal-700 ring-1 ring-teal-100 transition hover:text-teal-900"
                        >
                          目标：{goal.title}
                        </Link>
                      ))}
                    </div>
                  ) : null}
                  <p className="mt-2 text-sm text-slate-500">
                    {isWeeklyRoutine
                      ? "如果今天跳过，本周后面会继续补足这个固定训练块。"
                      : `如果今天跳过，明天会变成 ${formatHoursPerDay(task.tomorrowRequiredDailyPace)}，压力增加 ${formatHoursPerDay(task.skipPenalty)}。`}
                  </p>
                  <p className="mt-3 text-sm text-slate-600">{task.whyNow}</p>
                  {lectureTitles.length > 0 ? (
                    <p className="mt-2 text-xs text-slate-500">
                      今日目标：{(task.unitTitles?.length ? task.unitTitles : lectureTitles).slice(0, 4).join(" / ")}
                    </p>
                  ) : null}
                  {(task.referenceResources ?? []).length > 0 ? (
                    <div className="mt-3 rounded-2xl border border-teal-100 bg-teal-50/70 px-4 py-3 text-sm text-teal-800">
                      <p className="font-medium">可参考资料</p>
                      <div className="mt-2 flex flex-wrap gap-2">
                        {(task.referenceResources ?? []).map((resource) => (
                          resource.sourceUrl?.startsWith("http") ? (
                            <a
                              key={resource.id}
                              href={resource.sourceUrl}
                              target="_blank"
                              rel="noreferrer"
                              className="rounded-full bg-white px-3 py-1 text-xs font-medium text-teal-700 ring-1 ring-teal-100 transition hover:text-teal-900"
                            >
                              {resource.title}
                            </a>
                          ) : (
                            <span
                              key={resource.id}
                              className="rounded-full bg-white px-3 py-1 text-xs font-medium text-teal-700 ring-1 ring-teal-100"
                            >
                              {resource.title}
                            </span>
                          )
                        ))}
                      </div>
                    </div>
                  ) : null}
                </div>

                <div className="grid gap-2 text-sm text-slate-600 lg:min-w-[220px]">
                  <div className="rounded-2xl bg-white px-4 py-3">
                    <p className="text-xs text-slate-500">真实速度 / 所需速度</p>
                    <p className="mt-2 font-semibold text-slate-950">
                      {formatHoursPerDay(task.recentDailyPace)} / {formatHoursPerDay(task.requiredDailyPace)}
                    </p>
                  </div>
                  <div className="rounded-2xl bg-white px-4 py-3">
                    <p className="text-xs text-slate-500">容量占用</p>
                    <p className="mt-2 font-semibold text-slate-950">
                      {Math.round(task.loadRatio * 100)}%
                    </p>
                  </div>
                </div>
              </div>

              <div className="mt-5 rounded-[24px] border border-slate-200 bg-white p-4">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
                  <div>
                    <p className="text-xs font-medium uppercase tracking-[0.16em] text-slate-500">
                      Unit Completion
                    </p>
                    <p className="mt-2 text-sm text-slate-600">
                      这里只有手动确认才会勾完成。记录今日学习时间不会自动把 unit 标成完成。
                    </p>
                    {awaitingManualCompletion ? (
                      <p className="mt-2 text-xs font-medium text-amber-700">
                        这项已经达到预计时长。你可以确认完成，也可以继续追加学习时间。
                      </p>
                    ) : null}
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {primaryLecture && !primaryLecture.completed ? (
                      <button
                        type="button"
                        onClick={() => handleLectureCompletion(task, primaryLecture, true)}
                        className="rounded-full bg-slate-950 px-3 py-1 text-xs font-medium text-white transition hover:bg-slate-800"
                      >
                        确认本 unit 完成
                      </button>
                    ) : null}
                    <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-600">
                      {primaryLecture ? "今日确认 1 个 unit" : "暂无可勾选 unit"}
                    </span>
                  </div>
                </div>

                <div className="mt-4 space-y-3">
                  {primaryLecture ? (
                    <label className="flex items-start gap-3 rounded-[20px] border border-slate-200 bg-slate-50/70 px-4 py-3">
                      <input
                        type="checkbox"
                        checked={primaryLecture.completed}
                        onChange={(event) =>
                          handleLectureCompletion(
                            task,
                            primaryLecture,
                            event.target.checked,
                          )
                        }
                        className="mt-1 h-5 w-5 rounded border-slate-300 text-teal-600 focus:ring-teal-500"
                      />
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="rounded-full bg-white px-3 py-1 text-xs font-medium text-slate-600 ring-1 ring-slate-200">
                            #{primaryLecture.order}
                          </span>
                          <p className="font-medium text-slate-950">{primaryLecture.title}</p>
                          <span
                            className={`rounded-full px-3 py-1 text-xs font-semibold ${
                              primaryLecture.completed
                                ? "bg-emerald-50 text-emerald-700"
                                : "bg-slate-200 text-slate-700"
                            }`}
                          >
                            {primaryLecture.completed ? "已完成" : "未完成"}
                          </span>
                        </div>
                        <p className="mt-2 text-xs text-slate-500">
                          预计 {primaryLecture.estimatedMinutes} 分钟
                          {primaryLecture.actualMinutes != null
                            ? ` · 已记录 ${primaryLecture.actualMinutes} 分钟`
                            : ""}
                          {primaryLecture.completedAt ? ` · 完成于 ${primaryLecture.completedAt}` : ""}
                        </p>
                      </div>
                    </label>
                  ) : lectureTitles.length > 0 ? (
                    <div className="rounded-[20px] border border-dashed border-slate-300 px-4 py-4 text-sm text-slate-500">
                      今天默认只追踪第一个目标：{lectureTitles[0]}。当前没有可直接勾选的 unit 数据，请在详情页里核对。
                    </div>
                  ) : (
                    <div className="rounded-[20px] border border-dashed border-slate-300 px-4 py-4 text-sm text-slate-500">
                      这项任务暂时没有可直接勾选的 unit。
                    </div>
                  )}
                </div>
              </div>

              <div className="mt-5 rounded-[24px] border border-slate-200 bg-white p-4">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
                  <div>
                    <p className="text-xs font-medium uppercase tracking-[0.16em] text-slate-500">
                      Time Logging
                    </p>
                    <p className="mt-2 text-sm text-slate-600">
                      这里填的是本次新增学习时间。记录后只增加进度，不会自动勾完成。
                    </p>
                    {task.status === "completed" ? (
                      <p className="mt-2 text-xs text-slate-500">
                        这条今日学习动作已记录 {actualMinutes ?? plannedMinutes} 分钟；如果继续学习，可以在这里直接追加。
                      </p>
                    ) : null}
                  </div>
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      min={1}
                      max={MAX_STUDY_LOG_MINUTES}
                      step={5}
                      value={draftMinutes}
                      onChange={(event) => handleRecordedMinutesChange(task.taskId, event.target.value)}
                      className="w-24 rounded-full border border-slate-200 bg-slate-50 px-4 py-2 text-sm font-medium text-slate-950 outline-none transition focus:border-teal-300 focus:bg-white"
                      placeholder="分钟"
                    />
                    <span className="text-sm text-slate-500">分钟</span>
                  </div>
                </div>
              </div>

              <div className="mt-5 flex flex-wrap gap-3">
                <button
                  type="button"
                  onClick={() => handleRecordStudyTime(task.taskId)}
                  disabled={!canRecordMinutes}
                  className="rounded-full bg-slate-950 px-4 py-2 text-sm font-medium text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-300"
                >
                  {task.status === "completed"
                    ? "追加学习时间"
                    : awaitingManualCompletion
                      ? "继续追加时间"
                      : task.status === "skipped"
                        ? "改为记录时长"
                        : "记录学习时间"}
                </button>
                <button
                  type="button"
                  onClick={() => handleSkip(task.taskId)}
                  disabled={task.status !== "pending"}
                  className="rounded-full border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 transition hover:border-rose-200 hover:text-rose-700 disabled:cursor-not-allowed disabled:text-slate-400"
                >
                  {task.status === "skipped" ? "已跳过" : "跳过并重排"}
                </button>
                <Link
                  to={task.sourceType === "learningItem" ? `/learning-items/${task.courseId}` : `/courses/${task.courseId}`}
                  className="rounded-full border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 transition hover:border-slate-300 hover:text-slate-950"
                >
                  {task.sourceType === "learningItem"
                    ? "去学习项详情补记"
                    : task.status === "completed"
                      ? "去课程详情补记"
                      : "进入课程详情"}
                </Link>
              </div>
            </article>
          );
            })}
          </div>
        ))}
      </div>

      <div className="mt-6 rounded-2xl border border-dashed border-slate-300 px-4 py-3 text-sm text-slate-600">
        如果今天整份计划都没做，明天的总日均需求至少会增加 <span className="font-semibold text-slate-950"> {formatHoursPerDay(snapshot.todayPlan.totalSkipPenalty)}</span>
        。
      </div>

      <div className="mt-6">
        <ReplanImpactPanel impact={impact} />
      </div>
    </section>
  );
}






