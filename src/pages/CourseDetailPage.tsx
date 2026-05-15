import { useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { CourseFormModal } from "../components/course/CourseFormModal";
import { CourseHeader } from "../components/course/CourseHeader";
import { LectureTable } from "../components/course/LectureTable";
import { WeeklyPlanBoard } from "../components/planner/WeeklyPlanBoard";
import { useCourseContext } from "../context/CourseContext";
import { usePlannerSnapshot } from "../planner/usePlannerSnapshot";
import { Lecture, LectureFilter, LectureSortKey, PlannerWeekMode } from "../types";
import { getCanonicalSyllabusPreview } from "../utils/courseFactory";
import { formatDateLong } from "../utils/date";
import { calculateCourseMetrics, formatHoursPerDay } from "../utils/courseMetrics";
import {
  buildCourseTimingCalibrationSummary,
  buildLectureTimingInsight,
  getLectureActualMinutes,
} from "../utils/lectureTiming";
import {
  formatProjectedFinishLabel,
  formatSystemTargetLabel,
} from "../utils/projectedFinish";
import { goalLevelLabels, goalStatusLabels } from "../utils/goalFactory";

const FILTER_OPTIONS: Array<{ value: LectureFilter; label: string }> = [
  { value: "all", label: "全部" },
  { value: "pending", label: "未完成" },
  { value: "completed", label: "已完成" },
  { value: "lowUnderstanding", label: "低理解" },
];

const SORT_OPTIONS: Array<{ value: LectureSortKey; label: string }> = [
  { value: "sequence", label: "按顺序" },
  { value: "status", label: "未完成优先" },
  { value: "understanding", label: "低理解优先" },
  { value: "duration", label: "时长优先" },
];

const timingDirectionLabels = {
  mostlyLonger: "整体偏长",
  mostlyShorter: "整体偏短",
  mostlyAccurate: "基本准确",
  insufficientData: "数据不足",
} as const;

function applyFilter(lectures: Lecture[], filter: LectureFilter) {
  switch (filter) {
    case "pending":
      return lectures.filter((lecture) => !lecture.completed);
    case "completed":
      return lectures.filter((lecture) => lecture.completed);
    case "lowUnderstanding":
      return lectures.filter(
        (lecture) => lecture.completed && (lecture.understanding ?? 5) <= 2,
      );
    default:
      return lectures;
  }
}

function applySort(lectures: Lecture[], sortKey: LectureSortKey) {
  return [...lectures].sort((left, right) => {
    switch (sortKey) {
      case "status":
        return Number(left.completed) - Number(right.completed) || left.order - right.order;
      case "understanding":
        return (
          (left.understanding ?? 99) - (right.understanding ?? 99) ||
          left.order - right.order
        );
      case "duration":
        return (
          (getLectureActualMinutes(right) ?? right.estimatedMinutes) -
            (getLectureActualMinutes(left) ?? left.estimatedMinutes) ||
          left.order - right.order
        );
      default:
        return left.order - right.order;
    }
  });
}

function formatSignedMinutes(minutes: number | null) {
  if (minutes === null) {
    return "--";
  }

  if (minutes === 0) {
    return "0 分钟";
  }

  return `${minutes > 0 ? "+" : ""}${minutes} 分钟`;
}

export function CourseDetailPage() {
  const { courseId } = useParams();
  const navigate = useNavigate();
  const {
    courses,
    goals,
    deleteCourse,
    setDayAdjustment,
    resetPlanAdjustments,
    syncCourseSyllabus,
    touchReplan,
  } = useCourseContext();
  const { snapshot, referenceKey } = usePlannerSnapshot();
  const [filter, setFilter] = useState<LectureFilter>("all");
  const [sortKey, setSortKey] = useState<LectureSortKey>("sequence");
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [weekView, setWeekView] = useState<PlannerWeekMode>("current");
  const [syncFeedback, setSyncFeedback] = useState<{
    tone: "success" | "info" | "error";
    message: string;
  } | null>(null);
  const course = courses.find((item) => item.id === courseId);

  if (!course) {
    return (
      <div className="panel p-8">
        <h1 className="text-2xl font-semibold text-slate-950">课程不存在</h1>
        <p className="mt-3 text-sm text-slate-600">
          这个课程可能已经被删除，或者当前链接不正确。
        </p>
        <Link
          to="/courses"
          className="mt-6 inline-flex rounded-full bg-slate-950 px-5 py-3 text-sm font-medium text-white"
        >
          返回学习库
        </Link>
      </div>
    );
  }

  const selectedCourse = course;
  const metrics = calculateCourseMetrics(selectedCourse);
  const projectedFinishInput = {
    scheduleMode: selectedCourse.scheduleMode ?? "scheduled",
    roadmapStatus: selectedCourse.roadmapStatus,
    scheduleCadence: selectedCourse.scheduleCadence ?? "roadmap",
    deadlineMode: selectedCourse.deadlineMode ?? "manual",
    deadline: selectedCourse.deadline,
    remainingMinutes: metrics.estimatedMinutesRemaining,
  } as const;
  const projectedFinishLabel = formatProjectedFinishLabel(
    projectedFinishInput,
    snapshot.projectedFinishByItemId[selectedCourse.id],
    snapshot.unfinishedUnscheduledItemIds.includes(selectedCourse.id),
  );
  const systemTargetLabel = formatSystemTargetLabel(projectedFinishInput);
  const syllabusPreview = useMemo(
    () => getCanonicalSyllabusPreview(selectedCourse),
    [selectedCourse],
  );
  const priorityEntry =
    snapshot.priorityRanking.find((entry) => entry.courseId === selectedCourse.id) ?? null;
  const lectureTimingInsights = useMemo(
    () => selectedCourse.lectures.map(buildLectureTimingInsight),
    [selectedCourse],
  );
  const lectureTimingMap = useMemo(
    () => new Map(lectureTimingInsights.map((insight) => [insight.lectureId, insight])),
    [lectureTimingInsights],
  );
  const calibrationSummary = useMemo(
    () => buildCourseTimingCalibrationSummary(selectedCourse),
    [selectedCourse],
  );
  const visibleLectures = applySort(applyFilter(selectedCourse.lectures, filter), sortKey);
  const completedHistory = [...selectedCourse.lectures]
    .filter((lecture) => lecture.completed && lecture.completedAt)
    .sort((left, right) => (right.completedAt ?? "").localeCompare(left.completedAt ?? ""));

  const futurePlanDays = useMemo(
    () =>
      snapshot.horizonPlans
        .filter(
          (day) =>
            day.date >= referenceKey &&
            day.tasks.some((task) => task.courseId === selectedCourse.id),
        )
        .slice(0, 7),
    [referenceKey, selectedCourse.id, snapshot.horizonPlans],
  );
  const associatedGoals = goals.filter((goal) =>
    goal.status !== "archived" && goal.linkedItemIds.includes(selectedCourse.id),
  );

  function handleDelete() {
    if (!window.confirm(`确定删除课程“${selectedCourse.name}”吗？`)) {
      return;
    }

    deleteCourse(selectedCourse.id);
    navigate("/courses");
  }

  function handleSyncSyllabus() {
    if (!syllabusPreview) {
      setSyncFeedback({
        tone: "error",
        message: "这门课程暂时没有可同步的官方目录。",
      });
      return;
    }

    const confirmMessage = syllabusPreview.hasChanges
      ? `将课程目录从 ${syllabusPreview.currentUnits} 节同步为 ${syllabusPreview.canonicalUnits} 节，并尽量保留 ${syllabusPreview.preservedCompletedUnits} 节已完成进度。确定继续吗？`
      : "这门课当前已经和官方校验目录一致，仍然要重新同步一次吗？";

    if (!window.confirm(confirmMessage)) {
      return;
    }

    const result = syncCourseSyllabus(selectedCourse.id);
    setSyncFeedback({
      tone:
        result.status === "synced"
          ? "success"
          : result.status === "unchanged"
            ? "info"
            : "error",
      message: result.message,
    });
  }

  return (
    <div className="space-y-6">
      <CourseHeader
        course={selectedCourse}
        metrics={metrics}
        priorityEntry={priorityEntry}
        syllabusPreview={syllabusPreview}
        projectedFinishLabel={projectedFinishLabel}
        systemTargetLabel={systemTargetLabel}
        onEdit={() => setIsModalOpen(true)}
        onDelete={handleDelete}
        onSyncSyllabus={handleSyncSyllabus}
      />

      {syncFeedback ? (
        <section
          className={`rounded-[28px] border px-5 py-4 text-sm ${
            syncFeedback.tone === "success"
              ? "border-emerald-200 bg-emerald-50 text-emerald-700"
              : syncFeedback.tone === "info"
                ? "border-slate-200 bg-slate-50 text-slate-700"
                : "border-rose-200 bg-rose-50 text-rose-700"
          }`}
        >
          {syncFeedback.message}
        </section>
      ) : null}

      {associatedGoals.length > 0 ? (
        <section className="panel p-5">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <p className="eyebrow">Goals</p>
              <h2 className="section-title mt-2">关联目标</h2>
              <p className="mt-2 text-sm text-slate-600">
                这些目标会读取本课程进度，但不会改变课程自己的排课状态。
              </p>
            </div>
            <Link
              to="/goals"
              className="rounded-full border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 transition hover:text-slate-950"
            >
              打开目标页
            </Link>
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            {associatedGoals.map((goal) => (
              <Link
                key={goal.id}
                to="/goals"
                className="rounded-full bg-teal-50 px-3 py-1 text-xs font-medium text-teal-700 ring-1 ring-teal-100"
              >
                {goalLevelLabels[goal.level]} · {goalStatusLabels[goal.status]} · {goal.title}
              </Link>
            ))}
          </div>
        </section>
      ) : null}

      <section className="grid gap-6 xl:grid-cols-[1.45fr_0.9fr]">
        <div className="space-y-6">
          <section id="lectures" className="panel p-6">
            <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
              <div>
                <p className="eyebrow">Lectures</p>
                <h2 className="section-title mt-2">Lecture 列表</h2>
                <p className="mt-2 text-sm text-slate-600">
                  在这里可以勾选完成状态、记录笔记、填写理解评分，也可以直接修改每个 lecture 自己的预计时长，同时查看这节课的预估和实际时长是否长期偏差。完成今日任务后如果你又继续学了某一节，也是在下面按 lecture 补记新增分钟。Roadmap 调度会按重学习槽和轻学习槽拆分进度。
                </p>
              </div>

              <div className="flex flex-wrap gap-3">
                <div className="flex flex-wrap rounded-full border border-slate-200 bg-white p-1">
                  {FILTER_OPTIONS.map((option) => (
                    <button
                      key={option.value}
                      type="button"
                      onClick={() => setFilter(option.value)}
                      className={`rounded-full px-4 py-2 text-sm transition ${
                        filter === option.value
                          ? "bg-slate-950 text-white"
                          : "text-slate-600 hover:text-slate-950"
                      }`}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>

                <select
                  value={sortKey}
                  onChange={(event) => setSortKey(event.target.value as LectureSortKey)}
                  className="rounded-full border border-slate-200 bg-white px-4 py-3 text-sm text-slate-700 outline-none transition focus:border-teal-500"
                >
                  {SORT_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="mt-6">
              <LectureTable
                courseId={selectedCourse.id}
                lectures={visibleLectures}
                timingInsights={lectureTimingMap}
              />
            </div>
          </section>
        </div>

        <aside className="space-y-6">
          <section className="panel p-6">
            <p className="eyebrow">Timing Calibration</p>
            <h2 className="section-title mt-2">时长校准</h2>
            {calibrationSummary.comparableLectureCount > 0 ? (
              <div className="mt-6 space-y-4">
                <div className="rounded-[24px] bg-slate-950 px-4 py-4 text-white">
                  <p className="text-xs uppercase tracking-[0.16em] text-slate-400">
                    Calibration Snapshot
                  </p>
                  <p className="mt-2 text-lg font-semibold">
                    已有对照 {calibrationSummary.comparableLectureCount} 节
                    {calibrationSummary.completedLectureCount > 0
                      ? ` · 其中已完成 ${calibrationSummary.completedLectureCount} 节`
                      : ""}
                  </p>
                  <p className="mt-2 text-sm text-slate-300">
                    总预估 {calibrationSummary.totalEstimatedMinutes} 分钟 / 总实际 {calibrationSummary.totalActualMinutes} 分钟
                  </p>
                  <p className="mt-2 text-sm text-slate-300">
                    当前判断：{timingDirectionLabels[calibrationSummary.dominantDirection]}
                  </p>
                </div>

                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="rounded-[24px] bg-slate-50 px-4 py-4">
                    <p className="text-xs text-slate-500">平均偏差</p>
                    <p className="mt-2 text-xl font-semibold text-slate-950">
                      {formatSignedMinutes(calibrationSummary.averageDeltaMinutes)}
                    </p>
                    <p className="mt-2 text-sm text-slate-600">
                      正数代表整体比预估更久，负数代表整体比预估更快。
                    </p>
                  </div>
                  <div className="rounded-[24px] bg-slate-50 px-4 py-4">
                    <p className="text-xs text-slate-500">后续建议</p>
                    <p className="mt-2 text-xl font-semibold text-slate-950">
                      {calibrationSummary.suggestedEstimateMinutes != null
                        ? `${calibrationSummary.suggestedEstimateMinutes} 分钟`
                        : "暂无建议"}
                    </p>
                    <p className="mt-2 text-sm text-slate-600">
                      后续 lecture 可优先参考这个时长，再按单节内容微调。
                    </p>
                  </div>
                </div>

                <div className="rounded-[24px] border border-slate-200 bg-slate-50/70 p-4">
                  <p className="text-xs uppercase tracking-[0.16em] text-slate-500">
                    最大偏差 Lecture
                  </p>
                  <div className="mt-4 space-y-3">
                    {calibrationSummary.largestVarianceLectures.map((insight) => (
                      <div
                        key={insight.lectureId}
                        className="rounded-[20px] border border-slate-200 bg-white px-3 py-3"
                      >
                        <p className="font-medium text-slate-950">
                          #{insight.order} {insight.title}
                        </p>
                        <p className="mt-2 text-sm text-slate-600">
                          预估 {insight.estimatedMinutes} 分钟 / 实际 {insight.actualMinutes ?? "--"} 分钟
                        </p>
                        <p className="mt-1 text-xs text-slate-500">
                          差值 {formatSignedMinutes(insight.deltaMinutes)}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            ) : (
              <div className="mt-6 rounded-[24px] border border-dashed border-slate-300 px-4 py-5 text-sm text-slate-500">
                这门课还没有足够的实际学习记录。完成一些 lecture 或记录学习时间后，这里会自动告诉你这门课整体偏长还是偏短。
              </div>
            )}
          </section>

          <section className="panel p-6">
            <p className="eyebrow">Pacing</p>
            <h2 className="section-title mt-2">Roadmap 槽位与 lecture 预计时长</h2>
            <p className="mt-3 text-sm leading-6 text-slate-600">
              系统排课时会按你的重学习槽和轻学习槽分配学习动作。左侧 lecture 列表里的“lecture 预计时长”只是帮助系统估算
              这节内容大概需要多久；如果一节太长，会被拆到多天，如果较短，系统会继续接同一学习项的后续内容。
            </p>
            <div className="mt-5 rounded-[24px] border border-dashed border-slate-300 bg-slate-50 px-4 py-4 text-sm leading-6 text-slate-600">
              如果某一节特别长或特别短，直接在左侧改这一节 lecture 的预计时长就可以了。
            </div>
          </section>

          <section className="panel p-6">
            <p className="eyebrow">Schedule</p>
            <h2 className="section-title mt-2">这门课当前的排课状态</h2>
            {priorityEntry ? (
              <div className="mt-6 space-y-4">
                <div className="rounded-[24px] bg-slate-950 px-4 py-4 text-white">
                  <p className="text-xs uppercase tracking-[0.16em] text-slate-400">
                    Priority #{priorityEntry.rank}
                  </p>
                  <p className="mt-2 text-lg font-semibold">
                    本周预计投入 {priorityEntry.scheduledUnitsThisWeek} 个学习动作 / {priorityEntry.scheduledMinutesThisWeek} 分钟
                  </p>
                  <p className="mt-2 text-sm text-slate-300">
                    预计上完 {projectedFinishLabel} · 系统目标 {systemTargetLabel} · 剩余 {priorityEntry.remainingUnits} 节 lecture
                  </p>
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="rounded-[24px] bg-slate-50 px-4 py-4">
                    <p className="text-xs text-slate-500">目标压力日均</p>
                    <p className="mt-2 text-xl font-semibold text-slate-950">
                      {formatHoursPerDay(priorityEntry.requiredDailyPace)}
                    </p>
                  </div>
                  <div className="rounded-[24px] bg-slate-50 px-4 py-4">
                    <p className="text-xs text-slate-500">近 7 天真实日均</p>
                    <p className="mt-2 text-xl font-semibold text-slate-950">
                      {formatHoursPerDay(priorityEntry.recentDailyPace)}
                    </p>
                  </div>
                </div>
              </div>
            ) : (
              <p className="mt-6 text-sm text-slate-600">这门课当前还没有被排进计划。</p>
            )}
          </section>

          <section className="panel p-6">
            <p className="eyebrow">Next 7 Days</p>
            <h2 className="section-title mt-2">未来 7 天安排</h2>
            <div className="mt-6 space-y-4">
              {futurePlanDays.length === 0 ? (
                <div className="rounded-[24px] border border-dashed border-slate-300 px-4 py-5 text-sm text-slate-500">
                  未来 7 天暂时还没有安排到这门课。
                </div>
              ) : (
                futurePlanDays.map((day) => {
                  const task = day.tasks.find((item) => item.courseId === selectedCourse.id);
                  if (!task) {
                    return null;
                  }

                  return (
                    <div key={day.date} className="rounded-[24px] bg-slate-50/80 p-4">
                      <div className="flex items-center justify-between gap-3">
                        <p className="font-semibold text-slate-950">{day.label}</p>
                        <span className="text-xs text-slate-500">{day.totalMinutes} 分钟</span>
                      </div>
                      <p className="mt-2 text-sm text-slate-600">
                        安排 {task.todayTargetUnits} 段内容，预计 {task.estimatedMinutes} 分钟
                      </p>
                    </div>
                  );
                })
              )}
            </div>
          </section>

          <section className="panel p-6">
            <p className="eyebrow">History</p>
            <h2 className="section-title mt-2">最近完成记录</h2>
            <div className="mt-6 space-y-4">
              {completedHistory.slice(0, 8).map((lecture) => {
                const timingInsight = lectureTimingMap.get(lecture.id);

                return (
                  <div
                    key={lecture.id}
                    className="rounded-[24px] border border-slate-200 bg-slate-50/70 p-4"
                  >
                    <p className="font-medium text-slate-950">
                      #{lecture.order} {lecture.title}
                    </p>
                    <p className="mt-2 text-sm text-slate-600">
                      完成于 {lecture.completedAt ? formatDateLong(lecture.completedAt) : "未记录"}
                    </p>
                    <p className="mt-2 text-xs text-slate-500">
                      理解评分 {lecture.understanding ?? "未填"} / 实际时长 {timingInsight?.actualMinutes ?? "未填"} 分钟
                    </p>
                  </div>
                );
              })}

              {completedHistory.length === 0 ? (
                <p className="rounded-[24px] border border-dashed border-slate-300 px-4 py-5 text-sm text-slate-500">
                  这门课还没有完成记录。
                </p>
              ) : null}
            </div>
          </section>
        </aside>
      </section>

      <WeeklyPlanBoard
        currentPlan={snapshot.weeklyPlan}
        nextPlan={snapshot.nextWeekPlan}
        view={weekView}
        onViewChange={setWeekView}
        onAdjustDay={setDayAdjustment}
        onResetAdjustments={resetPlanAdjustments}
        onRegenerate={touchReplan}
        filterCourseId={selectedCourse.id}
        title="这门课的未来排课"
        description="你可以直接查看这门课在本周和下周会被安排到哪些天，以及每天预计推进哪些学习动作。"
      />

      <CourseFormModal
        open={isModalOpen}
        initialCourse={selectedCourse}
        onClose={() => setIsModalOpen(false)}
      />
    </div>
  );
}

