import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { CourseFormModal } from "../components/course/CourseFormModal";
import { LearningItemFormModal } from "../components/roadmap/LearningItemFormModal";
import { EmptyState } from "../components/ui/EmptyState";
import { RiskBadge } from "../components/ui/RiskBadge";
import { useCourseContext } from "../context/CourseContext";
import { usePlannerSnapshot } from "../planner/usePlannerSnapshot";
import { Course, LearningItem, LearningItemType, RoadmapStatus } from "../types";
import {
  formatProjectedFinishLabel,
  formatSystemTargetLabel,
} from "../utils/projectedFinish";
import {
  buildUnifiedStudyItems,
  getUnifiedStudyItemPath,
  UnifiedStudyItem,
  unifiedDeadlineModeLabels,
  unifiedIntensityLabels,
  unifiedScheduleCadenceLabels,
  unifiedRoadmapStatusLabels,
  unifiedScheduleModeLabels,
  unifiedTypeLabels,
} from "../utils/unifiedStudyItems";

type TypeFilter = "all" | LearningItemType;
type PhaseFilter = "all" | string;
type IntensityFilter = "all" | "heavy" | "light";
type ScheduleModeFilter = "all" | "scheduled" | "reference";
type RoadmapStatusFilter = "visible" | "all" | RoadmapStatus;

function formatMinutes(minutes: number) {
  if (minutes < 60) {
    return `${minutes} 分钟`;
  }

  return `${Math.round((minutes / 60) * 10) / 10} 小时`;
}

function applyFilters(
  items: UnifiedStudyItem[],
  typeFilter: TypeFilter,
  phaseFilter: PhaseFilter,
  intensityFilter: IntensityFilter,
  scheduleModeFilter: ScheduleModeFilter,
  roadmapStatusFilter: RoadmapStatusFilter,
) {
  return items.filter((item) => {
    if (roadmapStatusFilter === "visible" && item.roadmapStatus === "archived") {
      return false;
    }
    if (
      roadmapStatusFilter !== "visible" &&
      roadmapStatusFilter !== "all" &&
      item.roadmapStatus !== roadmapStatusFilter
    ) {
      return false;
    }
    if (typeFilter !== "all" && item.type !== typeFilter) {
      return false;
    }
    if (phaseFilter === "weekly" && item.scheduleCadence !== "weekly") {
      return false;
    }
    if (
      phaseFilter !== "all" &&
      phaseFilter !== "weekly" &&
      (item.scheduleCadence === "weekly" || String(item.roadmapPhase) !== phaseFilter)
    ) {
      return false;
    }
    if (intensityFilter !== "all" && item.intensity !== intensityFilter) {
      return false;
    }
    if (scheduleModeFilter !== "all" && item.scheduleMode !== scheduleModeFilter) {
      return false;
    }

    return true;
  });
}

function formatPlanLoad(item: UnifiedStudyItem) {
  if (item.roadmapStatus === "archived") {
    return "历史保留";
  }
  if (item.roadmapStatus === "backlog") {
    return "待激活";
  }
  if (item.scheduleMode === "reference" || item.roadmapStatus === "reference") {
    return "不占每日槽";
  }

  const minutes = item.priorityEntry?.scheduledMinutesThisWeek ?? 0;
  const units = item.priorityEntry?.scheduledUnitsThisWeek ?? 0;
  if (item.scheduleCadence === "weekly") {
    return `本周 ${units}/${item.weeklyTargetBlocks ?? 0} 块`;
  }

  if (minutes <= 0 || units <= 0) {
    return "等待调度";
  }

  return `${formatMinutes(minutes)} / ${units} 个动作`;
}

export function CoursesPage() {
  const { courses, learningItems, deleteCourse, deleteLearningItem } = useCourseContext();
  const { snapshot } = usePlannerSnapshot();
  const [editingCourse, setEditingCourse] = useState<Course | null>(null);
  const [editingItem, setEditingItem] = useState<LearningItem | null>(null);
  const [isCourseModalOpen, setIsCourseModalOpen] = useState(false);
  const [isLearningModalOpen, setIsLearningModalOpen] = useState(false);
  const [typeFilter, setTypeFilter] = useState<TypeFilter>("all");
  const [phaseFilter, setPhaseFilter] = useState<PhaseFilter>("all");
  const [intensityFilter, setIntensityFilter] = useState<IntensityFilter>("all");
  const [scheduleModeFilter, setScheduleModeFilter] = useState<ScheduleModeFilter>("all");
  const [roadmapStatusFilter, setRoadmapStatusFilter] = useState<RoadmapStatusFilter>("visible");

  const unifiedItems = useMemo(
    () => buildUnifiedStudyItems(courses, learningItems, snapshot.priorityRanking),
    [courses, learningItems, snapshot.priorityRanking],
  );
  const visibleItems = useMemo(
    () =>
      applyFilters(
        unifiedItems,
        typeFilter,
        phaseFilter,
        intensityFilter,
        scheduleModeFilter,
        roadmapStatusFilter,
      ),
    [intensityFilter, phaseFilter, roadmapStatusFilter, scheduleModeFilter, typeFilter, unifiedItems],
  );
  const phaseOptions = useMemo(
    () =>
      [
        ...new Set(
          unifiedItems
            .filter((item) => item.scheduleCadence !== "weekly")
            .map((item) => item.roadmapPhase),
        ),
      ]
        .sort((left, right) => left - right)
        .map(String),
    [unifiedItems],
  );
  const unfinishedProjectedIds = useMemo(
    () => new Set(snapshot.unfinishedUnscheduledItemIds),
    [snapshot.unfinishedUnscheduledItemIds],
  );
  const dependencyOptions = useMemo(
    () =>
      unifiedItems
        .filter((item) => item.id !== editingItem?.id)
        .map((item) => ({
          id: item.id,
          title: `${item.title} (${unifiedTypeLabels[item.type]})`,
        })),
    [editingItem?.id, unifiedItems],
  );
  const totalScheduled = unifiedItems.filter(
    (item) => item.roadmapStatus === "active" && item.scheduleMode === "scheduled",
  ).length;
  const totalReference = unifiedItems.filter((item) => item.roadmapStatus === "reference").length;
  const totalBacklog = unifiedItems.filter((item) => item.roadmapStatus === "backlog").length;

  function closeCourseModal() {
    setEditingCourse(null);
    setIsCourseModalOpen(false);
  }

  function closeLearningModal() {
    setEditingItem(null);
    setIsLearningModalOpen(false);
  }

  function handleDelete(item: UnifiedStudyItem) {
    if (!window.confirm(`确定删除“${item.title}”吗？`)) {
      return;
    }

    if (item.sourceType === "course") {
      deleteCourse(item.id);
    } else {
      deleteLearningItem(item.id);
    }
  }

  function handleEdit(item: UnifiedStudyItem) {
    if (item.sourceType === "course" && item.course) {
      setEditingCourse(item.course);
      setIsCourseModalOpen(true);
      return;
    }

    if (item.learningItem) {
      setEditingItem(item.learningItem);
      setIsLearningModalOpen(true);
    }
  }

  return (
    <div className="space-y-6">
      <section className="flex flex-col justify-between gap-5 lg:flex-row lg:items-end">
        <div>
          <p className="eyebrow">Study Library</p>
          <h1 className="mt-2 text-4xl font-semibold tracking-tight text-slate-950">
            学习库
          </h1>
          <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-600">
            课程、书籍、资料、练习和项目都在这里统一管理。Phase、deadline、依赖、重轻学习槽和补记进度会同步进入 Roadmap 调度。
          </p>
        </div>

        <div className="flex flex-wrap gap-3">
          <button
            type="button"
            onClick={() => setIsLearningModalOpen(true)}
            className="rounded-full border border-slate-200 px-5 py-3 text-sm font-medium text-slate-700 transition hover:border-slate-300 hover:text-slate-950"
          >
            新增书籍/资料
          </button>
          <button
            type="button"
            onClick={() => setIsCourseModalOpen(true)}
            className="rounded-full bg-slate-950 px-5 py-3 text-sm font-medium text-white transition hover:bg-slate-800"
          >
            新增课程
          </button>
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-4">
        <div className="panel p-5">
          <p className="text-sm text-slate-500">总学习项</p>
          <p className="mt-3 text-3xl font-semibold text-slate-950">{unifiedItems.length}</p>
          <p className="mt-2 text-sm text-slate-600">
            课程 {courses.length} 门 · 资料 {learningItems.length} 项
          </p>
        </div>
        <div className="panel p-5">
          <p className="text-sm text-slate-500">进入排课</p>
          <p className="mt-3 text-3xl font-semibold text-slate-950">{totalScheduled}</p>
          <p className="mt-2 text-sm text-slate-600">active 后会进入今日任务和周计划。</p>
        </div>
        <div className="panel p-5">
          <p className="text-sm text-slate-500">Backlog / Reference</p>
          <p className="mt-3 text-3xl font-semibold text-slate-950">{totalBacklog}/{totalReference}</p>
          <p className="mt-2 text-sm text-slate-600">待激活和参考资料都不抢每日槽位。</p>
        </div>
        <div className="panel p-5">
          <p className="text-sm text-slate-500">当前筛选</p>
          <p className="mt-3 text-3xl font-semibold text-slate-950">{visibleItems.length}</p>
          <p className="mt-2 text-sm text-slate-600">可以按 Phase、类型和跑道缩小范围。</p>
        </div>
      </section>

      <section className="panel p-5">
        <div className="grid gap-3 md:grid-cols-5">
          <label className="space-y-2">
            <span className="text-xs font-medium uppercase tracking-[0.16em] text-slate-500">
              类型
            </span>
            <select
              value={typeFilter}
              onChange={(event) => setTypeFilter(event.target.value as TypeFilter)}
              className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none transition focus:border-teal-500"
            >
              <option value="all">全部类型</option>
              {Object.entries(unifiedTypeLabels).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>

          <label className="space-y-2">
            <span className="text-xs font-medium uppercase tracking-[0.16em] text-slate-500">
              Phase
            </span>
            <select
              value={phaseFilter}
              onChange={(event) => setPhaseFilter(event.target.value)}
              className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none transition focus:border-teal-500"
            >
              <option value="all">全部 Phase</option>
              <option value="weekly">每周固定</option>
              {phaseOptions.map((phase) => (
                <option key={phase} value={phase}>
                  Phase {phase}
                </option>
              ))}
            </select>
          </label>

          <label className="space-y-2">
            <span className="text-xs font-medium uppercase tracking-[0.16em] text-slate-500">
              跑道
            </span>
            <select
              value={intensityFilter}
              onChange={(event) => setIntensityFilter(event.target.value as IntensityFilter)}
              className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none transition focus:border-teal-500"
            >
              <option value="all">重/轻全部</option>
              <option value="heavy">重学习</option>
              <option value="light">轻学习</option>
            </select>
          </label>

          <label className="space-y-2">
            <span className="text-xs font-medium uppercase tracking-[0.16em] text-slate-500">
              Roadmap 状态
            </span>
            <select
              value={roadmapStatusFilter}
              onChange={(event) => setRoadmapStatusFilter(event.target.value as RoadmapStatusFilter)}
              className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none transition focus:border-teal-500"
            >
              <option value="visible">默认显示</option>
              <option value="all">全部含归档</option>
              {Object.entries(unifiedRoadmapStatusLabels).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>

          <label className="space-y-2">
            <span className="text-xs font-medium uppercase tracking-[0.16em] text-slate-500">
              排课模式
            </span>
            <select
              value={scheduleModeFilter}
              onChange={(event) =>
                setScheduleModeFilter(event.target.value as ScheduleModeFilter)
              }
              className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none transition focus:border-teal-500"
            >
              <option value="all">全部</option>
              <option value="scheduled">进入排课</option>
              <option value="reference">Reference</option>
            </select>
          </label>
        </div>
      </section>

      {unifiedItems.length === 0 ? (
        <EmptyState
          title="还没有学习项"
          description="先添加课程、书籍或资料，系统才能生成 Roadmap、今日任务和容量倒推 deadline。"
          actionLabel="新增课程"
          onAction={() => setIsCourseModalOpen(true)}
        />
      ) : (
        <section className="panel overflow-hidden">
          <div className="flex flex-col gap-3 border-b border-slate-200/80 px-6 py-5 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <p className="eyebrow">Library Items</p>
              <h2 className="section-title mt-2">全部学习项</h2>
            </div>
            <p className="text-sm text-slate-500">
              当前显示 {visibleItems.length} / {unifiedItems.length} 项
            </p>
          </div>

          <div className="grid gap-4 px-6 py-6 lg:grid-cols-2">
            {visibleItems.map((item) => {
              const entry = item.priorityEntry;

              return (
                <article
                  key={`${item.sourceType}:${item.id}`}
                  className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm transition hover:border-slate-300 hover:shadow-soft"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span
                          className="h-3 w-3 rounded-full"
                          style={{ backgroundColor: item.color }}
                        />
                        <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700">
                          {unifiedTypeLabels[item.type]}
                        </span>
                        <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700">
                          {unifiedIntensityLabels[item.intensity]}
                        </span>
                        <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700">
                          {unifiedRoadmapStatusLabels[item.roadmapStatus]}
                        </span>
                        <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700">
                          {unifiedScheduleModeLabels[item.scheduleMode]}
                        </span>
                        <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700">
                          {unifiedScheduleCadenceLabels[item.scheduleCadence]}
                        </span>
                        <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700">
                          {unifiedDeadlineModeLabels[item.deadlineMode]}
                        </span>
                        {entry && item.scheduleCadence !== "weekly" ? (
                          <RiskBadge level={entry.riskLevel} />
                        ) : null}
                      </div>
                      <Link
                        to={getUnifiedStudyItemPath(item)}
                        className="mt-3 inline-block text-2xl font-semibold tracking-tight text-slate-950 transition hover:text-teal-700"
                      >
                        {item.title}
                      </Link>
                      <p className="mt-2 text-sm text-slate-600">
                        {item.scheduleCadence === "weekly"
                          ? `每周固定 · ${item.weeklyTargetBlocks ?? 0} 块/周 · 间隔 ${item.weeklySpacingDays ?? 0} 天`
                          : `Phase ${item.roadmapPhase} · ${item.roadmapTrack} · Order ${item.roadmapOrder}`}
                      </p>
                      <p className="mt-1 text-sm text-slate-500">
                        {item.completedUnits}/{item.totalUnits} units · 已记{" "}
                        {formatMinutes(item.progressMinutes)} · 剩余{" "}
                        {formatMinutes(item.remainingMinutes)}
                      </p>
                    </div>

                    <div className="rounded-[24px] bg-slate-950 px-4 py-3 text-right text-white">
                      <p className="text-xs uppercase tracking-[0.18em] text-slate-400">
                        进度
                      </p>
                      <p className="mt-2 text-2xl font-semibold">{item.progressPct}%</p>
                      <p className="mt-1 text-xs text-slate-300">
                        {unifiedRoadmapStatusLabels[item.roadmapStatus]}
                      </p>
                    </div>
                  </div>

                  <div className="mt-4 h-2 rounded-full bg-slate-200">
                    <div
                      className="h-2 rounded-full"
                      style={{
                        width: `${item.progressPct}%`,
                        backgroundColor: item.color,
                      }}
                    />
                  </div>

                  <div className="mt-5 grid grid-cols-2 gap-3">
                    <div className="rounded-2xl bg-slate-50 px-4 py-3">
                      <p className="text-xs text-slate-500">预计上完</p>
                      <p className="mt-2 text-lg font-semibold text-slate-950">
                        {formatProjectedFinishLabel(
                          item,
                          snapshot.projectedFinishByItemId[item.id],
                          unfinishedProjectedIds.has(item.id),
                        )}
                      </p>
                    </div>
                    <div className="rounded-2xl bg-slate-50 px-4 py-3">
                      <p className="text-xs text-slate-500">计划负载</p>
                      <p className="mt-2 text-lg font-semibold text-slate-950">
                        {formatPlanLoad(item)}
                      </p>
                    </div>
                    <div className="rounded-2xl bg-slate-50 px-4 py-3">
                      <p className="text-xs text-slate-500">本周安排</p>
                      <p className="mt-2 text-lg font-semibold text-slate-950">
                        {entry?.scheduledUnitsThisWeek ?? 0} 个动作
                      </p>
                    </div>
                    <div className="rounded-2xl bg-slate-50 px-4 py-3">
                      <p className="text-xs text-slate-500">系统目标</p>
                      <p className="mt-2 text-lg font-semibold text-slate-950">
                        {formatSystemTargetLabel(item)}
                      </p>
                    </div>
                  </div>

                  <div className="mt-5 flex flex-wrap gap-3">
                    <Link
                      to={getUnifiedStudyItemPath(item)}
                      className="rounded-full bg-slate-950 px-4 py-2 text-sm font-medium text-white transition hover:bg-slate-800"
                    >
                      查看详情
                    </Link>
                    <button
                      type="button"
                      onClick={() => handleEdit(item)}
                      className="rounded-full border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 transition hover:border-slate-300 hover:text-slate-950"
                    >
                      编辑
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDelete(item)}
                      className="rounded-full border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 transition hover:border-rose-200 hover:text-rose-700"
                    >
                      删除
                    </button>
                  </div>
                </article>
              );
            })}
          </div>
        </section>
      )}

      <CourseFormModal
        open={isCourseModalOpen}
        initialCourse={editingCourse}
        onClose={closeCourseModal}
      />
      <LearningItemFormModal
        open={isLearningModalOpen}
        initialItem={editingItem}
        dependencyOptions={dependencyOptions}
        onClose={closeLearningModal}
      />
    </div>
  );
}

