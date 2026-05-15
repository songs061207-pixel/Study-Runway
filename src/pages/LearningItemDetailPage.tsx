import { useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { LearningItemFormModal } from "../components/roadmap/LearningItemFormModal";
import { WeeklyPlanBoard } from "../components/planner/WeeklyPlanBoard";
import { useCourseContext } from "../context/CourseContext";
import { usePlannerSnapshot } from "../planner/usePlannerSnapshot";
import { LearningItem, PlannerWeekMode } from "../types";
import {
  learningItemToUnifiedStudyItem,
  unifiedDeadlineModeLabels,
  unifiedIntensityLabels,
  unifiedRoadmapStatusLabels,
  unifiedScheduleCadenceLabels,
  unifiedScheduleModeLabels,
  unifiedTypeLabels,
} from "../utils/unifiedStudyItems";
import {
  formatProjectedFinishLabel,
  formatSystemTargetLabel,
} from "../utils/projectedFinish";
import { goalLevelLabels, goalStatusLabels } from "../utils/goalFactory";

function formatMinutes(minutes: number) {
  if (minutes < 60) {
    return `${minutes} 分钟`;
  }

  return `${Math.round((minutes / 60) * 10) / 10} 小时`;
}

function getDraftKey(itemId: string, unitId: string) {
  return `${itemId}:${unitId}`;
}

export function LearningItemDetailPage() {
  const { itemId } = useParams();
  const navigate = useNavigate();
  const {
    courses,
    learningItems,
    goals,
    deleteLearningItem,
    toggleLearningUnitCompletion,
    logLearningUnitStudyTime,
    setDayAdjustment,
    resetPlanAdjustments,
    touchReplan,
  } = useCourseContext();
  const { snapshot, referenceKey } = usePlannerSnapshot();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [minuteDrafts, setMinuteDrafts] = useState<Record<string, string>>({});
  const [weekView, setWeekView] = useState<PlannerWeekMode>("current");
  const item = learningItems.find((entry) => entry.id === itemId);
  const dependencyTitles = useMemo(() => {
    const titles = new Map<string, string>();
    courses.forEach((course) => titles.set(course.id, course.name));
    learningItems.forEach((learningItem) => titles.set(learningItem.id, learningItem.title));
    return titles;
  }, [courses, learningItems]);

  if (!item) {
    return (
      <div className="panel p-8">
        <h1 className="text-2xl font-semibold text-slate-950">学习项不存在</h1>
        <p className="mt-3 text-sm text-slate-600">
          这个书籍/资料可能已经被删除，或者当前链接不正确。
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

  const selectedItem: LearningItem = item;
  const unifiedItem = learningItemToUnifiedStudyItem(
    selectedItem,
    snapshot.priorityRanking.find((entry) => entry.courseId === selectedItem.id),
  );
  const isWeeklyRoutine = unifiedItem.scheduleCadence === "weekly";
  const projectedFinishLabel = formatProjectedFinishLabel(
    unifiedItem,
    snapshot.projectedFinishByItemId[selectedItem.id],
    snapshot.unfinishedUnscheduledItemIds.includes(selectedItem.id),
  );
  const systemTargetLabel = formatSystemTargetLabel(unifiedItem);
  const futurePlanDays = snapshot.horizonPlans
    .filter(
      (day) =>
        day.date >= referenceKey &&
        day.tasks.some((task) => task.courseId === selectedItem.id),
    )
    .slice(0, 7);
  const associatedGoals = goals.filter((goal) =>
    goal.status !== "archived" && goal.linkedItemIds.includes(selectedItem.id),
  );

  function handleDelete() {
    if (!window.confirm(`确定删除学习项“${selectedItem.title}”吗？`)) {
      return;
    }

    deleteLearningItem(selectedItem.id);
    navigate("/courses");
  }

  function handleLogMinutes(unitId: string) {
    const key = getDraftKey(selectedItem.id, unitId);
    const minutes = Math.max(1, Math.round(Number(minuteDrafts[key]) || 0));
    if (minutes <= 0) {
      return;
    }

    logLearningUnitStudyTime(selectedItem.id, unitId, minutes);
    setMinuteDrafts((currentDrafts) => ({ ...currentDrafts, [key]: "" }));
  }

  return (
    <div className="space-y-6">
      <section className="panel overflow-hidden">
        <div className="border-b border-slate-200/80 px-6 py-6">
          <Link
            to="/courses"
            className="text-sm font-medium text-slate-500 transition hover:text-slate-900"
          >
            返回学习库
          </Link>
          <div className="mt-5 flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <span className="rounded-full bg-slate-950 px-3 py-1 text-xs font-semibold text-white">
                  {unifiedTypeLabels[unifiedItem.type]}
                </span>
                <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-700">
                  {unifiedIntensityLabels[unifiedItem.intensity]}
                </span>
                <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-700">
                  {unifiedRoadmapStatusLabels[unifiedItem.roadmapStatus]}
                </span>
                <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-700">
                  {unifiedScheduleModeLabels[unifiedItem.scheduleMode]}
                </span>
                <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-700">
                  {unifiedScheduleCadenceLabels[unifiedItem.scheduleCadence]}
                </span>
                <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-700">
                  {unifiedDeadlineModeLabels[unifiedItem.deadlineMode]}
                </span>
              </div>
              <h1 className="mt-4 text-4xl font-semibold tracking-tight text-slate-950">
                {selectedItem.title}
              </h1>
              <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-600">
                {isWeeklyRoutine
                  ? `每周固定 · ${selectedItem.weeklyTargetBlocks ?? 0} 块/周 · 间隔 ${selectedItem.weeklySpacingDays ?? 0} 天 · Priority ${selectedItem.priority}`
                  : `Phase ${selectedItem.roadmapPhase} · ${selectedItem.roadmapTrack} · Order ${selectedItem.roadmapOrder} · Priority ${selectedItem.priority}`}
              </p>
              <p className="mt-2 text-sm text-slate-500">
                {isWeeklyRoutine
                  ? "固定节奏：每周按目标自动补足训练块"
                  : `预计上完 ${projectedFinishLabel} · 系统目标 ${systemTargetLabel}`}
                {selectedItem.sourceUrl ? ` · 来源：${selectedItem.sourceUrl}` : ""}
              </p>
            </div>

            <div className="flex flex-wrap gap-3">
              <button
                type="button"
                onClick={() => setIsModalOpen(true)}
                className="rounded-full border border-slate-200 px-5 py-3 text-sm font-medium text-slate-700 transition hover:border-slate-300 hover:text-slate-950"
              >
                编辑学习项
              </button>
              <button
                type="button"
                onClick={handleDelete}
                className="rounded-full border border-rose-100 px-5 py-3 text-sm font-medium text-rose-600 transition hover:border-rose-200"
              >
                删除
              </button>
            </div>
          </div>
        </div>

        <div className="grid gap-4 px-6 py-6 md:grid-cols-4">
          <div className="rounded-[24px] bg-slate-50 px-4 py-4">
            <p className="text-xs text-slate-500">完成进度</p>
            <p className="mt-2 text-2xl font-semibold text-slate-950">
              {unifiedItem.progressPct}%
            </p>
            <p className="mt-1 text-sm text-slate-600">
              {unifiedItem.completedUnits}/{unifiedItem.totalUnits} units
            </p>
          </div>
          <div className="rounded-[24px] bg-slate-50 px-4 py-4">
            <p className="text-xs text-slate-500">已记录</p>
            <p className="mt-2 text-2xl font-semibold text-slate-950">
              {formatMinutes(unifiedItem.progressMinutes)}
            </p>
            <p className="mt-1 text-sm text-slate-600">
              总预计 {formatMinutes(unifiedItem.totalMinutes)}
            </p>
          </div>
          <div className="rounded-[24px] bg-slate-50 px-4 py-4">
            <p className="text-xs text-slate-500">剩余时长</p>
            <p className="mt-2 text-2xl font-semibold text-slate-950">
              {formatMinutes(unifiedItem.remainingMinutes)}
            </p>
            <p className="mt-1 text-sm text-slate-600">按剩余进度参与排课</p>
          </div>
          <div className="rounded-[24px] bg-slate-950 px-4 py-4 text-white">
            <p className="text-xs text-slate-400">本周排课</p>
            <p className="mt-2 text-2xl font-semibold">
              {unifiedItem.priorityEntry?.scheduledUnitsThisWeek ?? 0} 个动作
            </p>
            <p className="mt-1 text-sm text-slate-300">
              {unifiedItem.priorityEntry?.scheduledMinutesThisWeek ?? 0} 分钟
            </p>
          </div>
        </div>
      </section>

      {associatedGoals.length > 0 ? (
        <section className="panel p-5">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <p className="eyebrow">Goals</p>
              <h2 className="section-title mt-2">关联目标</h2>
              <p className="mt-2 text-sm text-slate-600">
                这些目标会读取本学习项进度，但不会改变它自己的排课状态。
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

      <section className="grid gap-6 xl:grid-cols-[1.35fr_0.8fr]">
        <div className="panel p-6">
          <div className="flex flex-col gap-2">
            <p className="eyebrow">Units</p>
            <h2 className="section-title">章节 / 页段 / 任务清单</h2>
            <p className="text-sm text-slate-600">
              记录时间只增加进度，不会自动勾完成；掌握或读完后你可以手动勾选对应 unit。
            </p>
          </div>

          <div className="mt-6 space-y-3">
            {selectedItem.units.map((unit) => {
              const draftKey = getDraftKey(selectedItem.id, unit.id);

              return (
                <div key={unit.id} className="rounded-[24px] border border-slate-200 bg-slate-50/70 p-4">
                  <label className="flex items-start gap-3">
                    <input
                      type="checkbox"
                      checked={unit.completed}
                      onChange={() => toggleLearningUnitCompletion(selectedItem.id, unit.id)}
                      className="mt-1 h-5 w-5 rounded border-slate-300 text-teal-600 focus:ring-teal-500"
                    />
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="rounded-full bg-white px-3 py-1 text-xs font-medium text-slate-600 ring-1 ring-slate-200">
                          #{unit.order}
                        </span>
                        <p className="font-medium text-slate-950">{unit.title}</p>
                        <span
                          className={`rounded-full px-3 py-1 text-xs font-semibold ${
                            unit.completed
                              ? "bg-emerald-50 text-emerald-700"
                              : "bg-slate-200 text-slate-700"
                          }`}
                        >
                          {unit.completed ? "已完成" : "未完成"}
                        </span>
                      </div>
                      <p className="mt-2 text-xs text-slate-500">
                        预计 {unit.estimatedMinutes} 分钟 · 已记录{" "}
                        {unit.actualMinutes ?? unit.progressMinutes} 分钟
                        {unit.completedAt ? ` · 完成于 ${unit.completedAt}` : ""}
                      </p>
                    </div>
                  </label>

                  <div className="mt-4 flex flex-wrap items-center gap-2">
                    <input
                      type="number"
                      min={1}
                      step={5}
                      value={minuteDrafts[draftKey] ?? ""}
                      onChange={(event) =>
                        setMinuteDrafts((currentDrafts) => ({
                          ...currentDrafts,
                          [draftKey]: event.target.value,
                        }))
                      }
                      className="w-28 rounded-full border border-slate-200 bg-white px-4 py-2 text-sm outline-none transition focus:border-teal-300"
                      placeholder="分钟"
                    />
                    <button
                      type="button"
                      onClick={() => handleLogMinutes(unit.id)}
                      className="rounded-full bg-slate-950 px-4 py-2 text-sm font-medium text-white transition hover:bg-slate-800"
                    >
                      补记时间
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <aside className="space-y-6">
          <section className="panel p-6">
            <p className="eyebrow">Dependencies</p>
            <h2 className="section-title mt-2">依赖关系</h2>
            <div className="mt-5 space-y-3 text-sm text-slate-600">
              <div className="rounded-[24px] bg-slate-50 px-4 py-4">
                <p className="text-xs font-medium uppercase tracking-[0.16em] text-slate-500">
                  硬依赖
                </p>
                <p className="mt-2">
                  {selectedItem.dependencyIds.length > 0
                    ? selectedItem.dependencyIds
                        .map((dependencyId) => dependencyTitles.get(dependencyId) ?? dependencyId)
                        .join(" / ")
                    : "无，当前可直接进入候选池。"}
                </p>
              </div>
              <div className="rounded-[24px] bg-slate-50 px-4 py-4">
                <p className="text-xs font-medium uppercase tracking-[0.16em] text-slate-500">
                  软依赖
                </p>
                <p className="mt-2">
                  {selectedItem.softDependencyIds.length > 0
                    ? selectedItem.softDependencyIds
                        .map((dependencyId) => dependencyTitles.get(dependencyId) ?? dependencyId)
                        .join(" / ")
                    : isWeeklyRoutine
                      ? "无，按每周固定训练目标参与调度。"
                      : "无，只按阶段、优先级和 deadline 排序。"}
                </p>
              </div>
            </div>
          </section>

          <section className="panel p-6">
            <p className="eyebrow">Next 7 Days</p>
            <h2 className="section-title mt-2">未来 7 天安排</h2>
            <div className="mt-6 space-y-4">
              {futurePlanDays.length === 0 ? (
                <div className="rounded-[24px] border border-dashed border-slate-300 px-4 py-5 text-sm text-slate-500">
                  未来 7 天暂时还没有安排到这个学习项。
                </div>
              ) : (
                futurePlanDays.map((day) => {
                  const task = day.tasks.find((entry) => entry.courseId === selectedItem.id);
                  if (!task) {
                    return null;
                  }

                  return (
                    <div key={day.date} className="rounded-[24px] bg-slate-50/80 p-4">
                      <div className="flex items-center justify-between gap-3">
                        <p className="font-semibold text-slate-950">{day.label}</p>
                        <span className="text-xs text-slate-500">{task.estimatedMinutes} 分钟</span>
                      </div>
                      <p className="mt-2 text-sm text-slate-600">
                        {(task.unitTitles?.length ? task.unitTitles : task.lectureTitles).slice(0, 2).join(" / ")}
                      </p>
                    </div>
                  );
                })
              )}
            </div>
          </section>

          {selectedItem.notes ? (
            <section className="panel p-6">
              <p className="eyebrow">Notes</p>
              <h2 className="section-title mt-2">备注</h2>
              <p className="mt-4 text-sm leading-6 text-slate-600">{selectedItem.notes}</p>
            </section>
          ) : null}
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
        filterCourseId={selectedItem.id}
        title="这个学习项的未来排课"
        description="这里展示该书籍/资料在本周和下周会被安排到哪些天。"
      />

      <LearningItemFormModal
        open={isModalOpen}
        initialItem={selectedItem}
        dependencyOptions={[
          ...courses.map((course) => ({
            id: course.id,
            title: `${course.name} (课程)`,
          })),
          ...learningItems
            .filter((learningItem) => learningItem.id !== selectedItem.id)
            .map((learningItem) => ({
              id: learningItem.id,
              title: `${learningItem.title} (${unifiedTypeLabels[learningItem.type]})`,
            })),
        ]}
        onClose={() => setIsModalOpen(false)}
      />
    </div>
  );
}
