import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useCourseContext } from "../../context/CourseContext";
import {
  Course,
  CourseIntensity,
  DailyStudyTask,
  DayPlan,
  LearningItem,
  PlannerWeekMode,
  UserCapacitySettings,
  WeeklyPlan,
} from "../../types";
import { buildGoalsByLinkedItem } from "../../utils/goalProgress";

interface WeeklyPlanBoardProps {
  currentPlan: WeeklyPlan;
  nextPlan: WeeklyPlan;
  view: PlannerWeekMode;
  onViewChange: (view: PlannerWeekMode) => void;
  onAdjustDay: (date: string, level: number) => void;
  onResetAdjustments?: () => void;
  onRegenerate?: () => void;
  filterCourseId?: string;
  title?: string;
  description?: string;
}

interface BoardNotice {
  tone: "neutral" | "success";
  text: string;
}

interface CompletedUnitDisplay {
  id: string;
  title: string;
  order: number;
}

const loadClasses = {
  light: "border-slate-200 bg-white/60 opacity-80",
  balanced: "border-slate-200 bg-white/90",
  heavy: "border-amber-200 bg-amber-50/80",
  overload: "border-rose-200 bg-rose-50/80",
} satisfies Record<DayPlan["loadLevel"], string>;

const loadLabels = {
  light: "偏轻",
  balanced: "平衡",
  heavy: "偏重",
  overload: "超载",
} satisfies Record<DayPlan["loadLevel"], string>;

const adjustmentLabels = {
  [-1]: "已减压",
  [0]: "标准容量",
  [1]: "已加压",
} as const;

const intensityLabels = {
  heavy: "重学习",
  light: "轻学习",
} as const;

function viewLabel(view: PlannerWeekMode) {
  return view === "current" ? "本周" : "下周";
}

function getSlotTarget(
  day: DayPlan,
  settings: UserCapacitySettings,
  intensity: CourseIntensity,
) {
  if (day.isWeekend) {
    return intensity === "heavy"
      ? settings.weekendHeavyCoursesPerDay
      : settings.weekendLightCoursesPerDay;
  }

  return intensity === "heavy" ? settings.heavyCoursesPerDay : settings.lightCoursesPerDay;
}

function getTaskPlannedTitles(task: DailyStudyTask) {
  return task.unitTitles?.length ? task.unitTitles : task.lectureTitles;
}

function findLatestCompletedUnitOnTaskDate(
  task: DailyStudyTask,
  courses: Course[],
  learningItems: LearningItem[],
): CompletedUnitDisplay | null {
  if (task.sourceType === "learningItem") {
    const item = learningItems.find((entry) => entry.id === task.courseId);
    const completedUnits = (item?.units ?? [])
      .filter((unit) => unit.completed && unit.completedAt === task.date)
      .map((unit) => ({ id: unit.id, title: unit.title, order: unit.order }));

    return completedUnits.sort((left, right) => right.order - left.order)[0] ?? null;
  }

  const course = courses.find((entry) => entry.id === task.courseId);
  const completedLectures = (course?.lectures ?? [])
    .filter((lecture) => lecture.completed && lecture.completedAt === task.date)
    .map((lecture) => ({ id: lecture.id, title: lecture.title, order: lecture.order }));

  return completedLectures.sort((left, right) => right.order - left.order)[0] ?? null;
}

export function WeeklyPlanBoard({
  currentPlan,
  nextPlan,
  view,
  onViewChange,
  onAdjustDay,
  onResetAdjustments,
  onRegenerate,
  filterCourseId,
  title = "周计划 / 正常上课模式",
  description = "系统会按 Roadmap 阶段、依赖、风险和重轻槽位自动安排课程、阅读、练习和项目；每天默认填满 2 个 120 分钟重学习块和 1 个 60 分钟轻学习块。",
}: WeeklyPlanBoardProps) {
  const {
    courses,
    learningItems,
    goals,
    manualTaskMoves,
    moveStudyTask,
    plannerSettings,
  } = useCourseContext();
  const [notice, setNotice] = useState<BoardNotice | null>(null);
  const activePlan = view === "current" ? currentPlan : nextPlan;
  const adjustedDays = activePlan.days.filter((day) => day.adjustmentLevel !== 0).length;
  const visibleDateKeys = new Set(activePlan.days.map((day) => day.date));
  const visibleManualMoveCount = manualTaskMoves.filter(
    (taskMove) =>
      visibleDateKeys.has(taskMove.targetDate) || visibleDateKeys.has(taskMove.sourceDate),
  ).length;
  const hasManualAdjustments = adjustedDays > 0 || visibleManualMoveCount > 0;
  const manuallyPinnedUnitIds = new Set(
    manualTaskMoves.flatMap((taskMove) => taskMove.unitIds ?? taskMove.lectureIds),
  );
  const goalsByItemId = useMemo(() => buildGoalsByLinkedItem(goals), [goals]);
  const completedUnitByTaskId = useMemo(() => {
    const completedUnits = new Map<string, CompletedUnitDisplay>();

    activePlan.days.forEach((day) => {
      if (!day.isToday) {
        return;
      }

      day.tasks.forEach((task) => {
        const completedUnit = findLatestCompletedUnitOnTaskDate(
          task,
          courses,
          learningItems,
        );
        if (completedUnit) {
          completedUnits.set(task.taskId, completedUnit);
        }
      });
    });

    return completedUnits;
  }, [activePlan.days, courses, learningItems]);

  function handleResetAdjustments() {
    if (!hasManualAdjustments) {
      setNotice({
        tone: "neutral",
        text: "当前这一周还没有手动调整，系统仍在按 Roadmap 规则自动排任务。",
      });
      return;
    }

    onResetAdjustments?.();
    setNotice({
      tone: "success",
      text: "已清除本周的手动调整，系统会恢复按当前 Roadmap 状态自动重排。",
    });
  }

  function handleRegenerate() {
    onRegenerate?.();
    setNotice({
      tone: "neutral",
      text: "已按当前容量、依赖和 Roadmap 进度重新生成周计划。",
    });
  }

  function handleMoveTask(task: DailyStudyTask, targetDate: string, targetLabel: string) {
    moveStudyTask(task, targetDate);
    setNotice({
      tone: "success",
      text: `已把 ${task.courseName} 挪到 ${targetLabel}，系统会围绕这个决定继续重排。`,
    });
  }

  return (
    <section className="panel overflow-hidden">
      <div className="flex flex-col gap-4 border-b border-slate-200/80 px-6 py-5 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="eyebrow">Weekly Planner</p>
          <h2 className="section-title mt-2">{title}</h2>
          <p className="mt-2 text-sm text-slate-600">{description}</p>
          <p className="mt-2 text-xs text-slate-500">
            {hasManualAdjustments
              ? `当前视图里已手动调整 ${adjustedDays} 天容量，并固定了 ${visibleManualMoveCount} 个学习动作移动。`
              : "当前仍按默认容量与 Roadmap 自动调度规则生成。"}
          </p>
        </div>

        <div className="flex flex-wrap gap-3">
          <div className="flex rounded-full border border-slate-200 bg-white p-1">
            {(["current", "next"] as PlannerWeekMode[]).map((mode) => (
              <button
                key={mode}
                type="button"
                onClick={() => onViewChange(mode)}
                className={`rounded-full px-4 py-2 text-sm transition ${
                  view === mode
                    ? "bg-slate-950 text-white"
                    : "text-slate-600 hover:text-slate-950"
                }`}
              >
                {viewLabel(mode)}
              </button>
            ))}
          </div>

          {onRegenerate ? (
            <button
              type="button"
              onClick={handleRegenerate}
              className="rounded-full border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 transition hover:border-slate-300 hover:text-slate-950"
            >
              一键重排
            </button>
          ) : null}

          {onResetAdjustments ? (
            <button
              type="button"
              onClick={handleResetAdjustments}
              className="rounded-full border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 transition hover:border-slate-300 hover:text-slate-950"
            >
              清除手动调整
            </button>
          ) : null}
        </div>
      </div>

      {notice ? (
        <div
          className={`mx-6 mt-5 rounded-[24px] border px-4 py-4 text-sm ${
            notice.tone === "success"
              ? "border-emerald-200 bg-emerald-50/80 text-emerald-800"
              : "border-slate-200 bg-slate-50 text-slate-700"
          }`}
        >
          {notice.text}
        </div>
      ) : null}

      <div className="grid gap-4 px-6 py-6 xl:grid-cols-7">
        {activePlan.days.map((day, dayIndex) => {
          const visibleTasks = filterCourseId
            ? day.tasks.filter((task) => task.courseId === filterCourseId)
            : day.tasks;
          const visibleMinutes = visibleTasks.reduce(
            (total, task) => total + task.estimatedMinutes,
            0,
          );
          const visibleHeavyCount = visibleTasks.filter((task) => task.intensity === "heavy").length;
          const visibleLightCount = visibleTasks.filter((task) => task.intensity === "light").length;
          const heavySlotTarget = getSlotTarget(day, plannerSettings, "heavy");
          const lightSlotTarget = getSlotTarget(day, plannerSettings, "light");
          const exceedsLaneTarget =
            !filterCourseId &&
            visibleTasks.length > 0 &&
            (visibleHeavyCount > heavySlotTarget || visibleLightCount > lightSlotTarget);
          const previousDay = activePlan.days[dayIndex - 1];
          const nextDay = activePlan.days[dayIndex + 1];

          return (
            <article
              key={day.date}
              className={`rounded-[28px] border p-4 ${loadClasses[day.loadLevel]}`}
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-slate-950">{day.label}</p>
                  <p className="mt-1 text-xs text-slate-500">
                    重 {day.intensityLoads.heavy.minutes}/{day.intensityLoads.heavy.capacityMinutes} 分钟 · 轻 {day.intensityLoads.light.minutes}/{day.intensityLoads.light.capacityMinutes} 分钟
                  </p>
                </div>
                <span className="rounded-full bg-slate-950 px-3 py-1 text-xs font-medium text-white">
                  {loadLabels[day.loadLevel]}
                </span>
              </div>

              <div className="mt-3 flex flex-wrap gap-2">
                <span className="rounded-full bg-white px-3 py-1 text-xs font-medium text-slate-600 ring-1 ring-slate-200">
                  {adjustmentLabels[day.adjustmentLevel as -1 | 0 | 1]}
                </span>
                {!filterCourseId ? (
                  <span className="rounded-full bg-white px-3 py-1 text-xs font-medium text-slate-600 ring-1 ring-slate-200">
                    重 {heavySlotTarget} 槽 · 轻 {lightSlotTarget} 槽
                  </span>
                ) : null}
                {day.isToday ? (
                  <span className="rounded-full bg-slate-950 px-3 py-1 text-xs font-medium text-white">
                    今天
                  </span>
                ) : null}
                {day.isPast ? (
                  <span className="rounded-full bg-white px-3 py-1 text-xs font-medium text-slate-600 ring-1 ring-slate-200">
                    历史实记
                  </span>
                ) : null}
                {exceedsLaneTarget ? (
                  <span className="rounded-full bg-amber-50 px-3 py-1 text-xs font-medium text-amber-700 ring-1 ring-amber-200">
                    重 {visibleHeavyCount} · 轻 {visibleLightCount}
                  </span>
                ) : null}
              </div>

              <div className="mt-4 rounded-2xl bg-white/70 px-3 py-3">
                <p className="text-xs font-medium uppercase tracking-[0.16em] text-slate-500">
                  {filterCourseId ? "筛选结果" : day.isPast ? "历史学习记录" : "当天学习动作"}
                </p>
                <p className="mt-2 text-xl font-semibold text-slate-950">
                  {visibleTasks.length} 个动作
                </p>
                <p className="mt-1 text-sm text-slate-600">
                  {visibleMinutes} 分钟 · {day.summary}
                </p>
              </div>

              <div className="mt-4 space-y-2">
                {visibleTasks.length === 0 ? (
                  <div className="rounded-2xl border border-dashed border-slate-300 px-3 py-4 text-sm text-slate-500">
                    {filterCourseId
                      ? "这一天没有安排到这个学习项。"
                      : "这一天没有可解锁的新学习动作，通常是候选不足、依赖锁住，或手动减压导致。"}
                  </div>
                ) : (
                  visibleTasks.map((task) => {
                    const completedUnit = completedUnitByTaskId.get(task.taskId);
                    const plannedTitles = getTaskPlannedTitles(task);
                    const displayTitles = completedUnit ? [completedUnit.title] : plannedTitles;
                    const nextPlannedTitles = completedUnit
                      ? plannedTitles.filter((title) => title !== completedUnit.title)
                      : [];
                    const linkedGoals = goalsByItemId.get(task.courseId) ?? [];

                    return (
                    <div key={task.taskId} className="rounded-2xl bg-white/70 px-3 py-3">
                      <div className="flex items-center justify-between gap-3">
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <p className="text-sm font-medium text-slate-950">{task.courseName}</p>
                            <span className="rounded-full bg-slate-950/5 px-2 py-1 text-[11px] font-medium text-slate-700 ring-1 ring-slate-200">
                              {intensityLabels[task.intensity]}
                            </span>
                            <span className="rounded-full bg-slate-950/5 px-2 py-1 text-[11px] font-medium text-slate-700 ring-1 ring-slate-200">
                              {task.actionLabel ?? "学习"}
                            </span>
                            {(task.unitIds ?? task.lectureIds).some((unitId) =>
                              manuallyPinnedUnitIds.has(unitId),
                            ) ? (
                              <span className="rounded-full bg-slate-950/5 px-2 py-1 text-[11px] font-medium text-slate-700 ring-1 ring-slate-200">
                                手动锁定
                              </span>
                            ) : null}
                            {completedUnit ? (
                              <span className="rounded-full bg-emerald-50 px-2 py-1 text-[11px] font-medium text-emerald-700 ring-1 ring-emerald-100">
                                今日已确认
                              </span>
                            ) : null}
                          </div>
                          <p className="mt-2 text-xs text-slate-500">
                            {task.sourceLabel ?? task.provider} · Phase {task.roadmapPhase} · {task.roadmapTrack}
                          </p>
                        </div>
                        <span className="text-xs text-slate-500">#{task.order}</span>
                      </div>
                      <p className="mt-2 text-sm text-slate-700">
                        {task.estimatedMinutes} 分钟 · {displayTitles.slice(0, 2).join(" / ")}
                      </p>
                      {linkedGoals.length > 0 ? (
                        <div className="mt-2 flex flex-wrap gap-2">
                          {linkedGoals.slice(0, 2).map((goal) => (
                            <Link
                              key={goal.id}
                              to="/goals"
                              className="rounded-full bg-teal-50 px-2.5 py-1 text-[11px] font-medium text-teal-700 ring-1 ring-teal-100"
                            >
                              目标：{goal.title}
                            </Link>
                          ))}
                        </div>
                      ) : null}
                      {completedUnit && nextPlannedTitles.length > 0 ? (
                        <p className="mt-2 text-xs leading-5 text-slate-500">
                          今日卡片保留已确认的 unit；下一步排课会从 {nextPlannedTitles.slice(0, 2).join(" / ")} 继续。
                        </p>
                      ) : null}
                      <p className="mt-2 text-xs leading-5 text-slate-500">{task.whyNow}</p>
                      {(task.referenceResources ?? []).length > 0 ? (
                        <div className="mt-3 flex flex-wrap gap-2">
                          {(task.referenceResources ?? []).map((resource) => (
                            <span
                              key={resource.id}
                              className="rounded-full bg-teal-50 px-2.5 py-1 text-[11px] font-medium text-teal-700 ring-1 ring-teal-100"
                            >
                              参考：{resource.title}
                            </span>
                          ))}
                        </div>
                      ) : null}

                      {!day.isPast ? (
                        <div className="mt-3 flex flex-wrap gap-2">
                          <Link
                            to={task.sourceType === "learningItem" ? `/learning-items/${task.courseId}` : `/courses/${task.courseId}#lectures`}
                            className="rounded-full bg-white px-3 py-2 text-xs font-medium text-slate-600 ring-1 ring-slate-200 transition hover:text-slate-950"
                          >
                            {task.sourceType === "learningItem" ? "学习项详情补记" : "课程详情补记"}
                          </Link>
                          {previousDay && !previousDay.isPast ? (
                            <button
                              type="button"
                              onClick={() => handleMoveTask(task, previousDay.date, previousDay.label)}
                              className="rounded-full bg-white px-3 py-2 text-xs font-medium text-slate-600 ring-1 ring-slate-200 transition hover:text-slate-950"
                            >
                              前移一天
                            </button>
                          ) : null}
                          {nextDay ? (
                            <button
                              type="button"
                              onClick={() => handleMoveTask(task, nextDay.date, nextDay.label)}
                              className="rounded-full bg-white px-3 py-2 text-xs font-medium text-slate-600 ring-1 ring-slate-200 transition hover:text-slate-950"
                            >
                              后移一天
                            </button>
                          ) : null}
                        </div>
                      ) : null}
                    </div>
                    );
                  })
                )}
              </div>

              {!day.isPast ? (
                <div className="mt-4 flex flex-wrap gap-2">
                  {[
                    { label: "减压", value: -1 },
                    { label: "标准", value: 0 },
                    { label: "加压", value: 1 },
                  ].map((option) => (
                    <button
                      key={option.label}
                      type="button"
                      onClick={() => onAdjustDay(day.date, option.value)}
                      className={`rounded-full px-3 py-2 text-xs font-medium transition ${
                        day.adjustmentLevel === option.value
                          ? "bg-slate-950 text-white"
                          : "bg-white text-slate-600 ring-1 ring-slate-200 hover:text-slate-950"
                      }`}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
              ) : null}
            </article>
          );
        })}
      </div>
    </section>
  );
}
