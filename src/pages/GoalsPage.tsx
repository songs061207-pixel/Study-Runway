import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { GoalFormModal } from "../components/goals/GoalFormModal";
import { EmptyState } from "../components/ui/EmptyState";
import { useCourseContext } from "../context/CourseContext";
import { usePlannerSnapshot } from "../planner/usePlannerSnapshot";
import { GoalLevel, GoalStatus, RoadmapRoute, StudyGoal, StudyGoalInput } from "../types";
import { formatDateLong, formatDateShort, getDateKey } from "../utils/date";
import {
  calculateGoalProgress,
  buildGoalItemMap,
  GoalProgressSummary,
} from "../utils/goalProgress";
import { goalLevelLabels, goalStatusLabels } from "../utils/goalFactory";
import { ROADMAP_ROUTES, roadmapRouteLabels } from "../utils/roadmapMetadata";
import {
  buildUnifiedStudyItems,
  getUnifiedStudyItemPath,
  unifiedRoadmapStatusLabels,
  unifiedTypeLabels,
} from "../utils/unifiedStudyItems";

type LevelFilter = "all" | GoalLevel;
type StatusFilter = "visible" | "all" | GoalStatus;
type RouteFilter = "all" | RoadmapRoute;

const statusClasses = {
  planned: "bg-slate-100 text-slate-700",
  active: "bg-emerald-50 text-emerald-700",
  completed: "bg-teal-50 text-teal-700",
  paused: "bg-amber-50 text-amber-700",
  archived: "bg-slate-200 text-slate-500",
} satisfies Record<GoalStatus, string>;

function formatProgressLabel(progress: GoalProgressSummary) {
  if (progress.linkedItems.length === 0 && progress.totalChecklistItems === 0) {
    return "等待拆解";
  }

  return `学习项 ${progress.linkedProgressPct}% · 清单 ${progress.checklistProgressPct}%`;
}

function applyFilters(
  goals: StudyGoal[],
  levelFilter: LevelFilter,
  statusFilter: StatusFilter,
  routeFilter: RouteFilter,
) {
  return goals.filter((goal) => {
    if (statusFilter === "visible" && goal.status === "archived") {
      return false;
    }
    if (statusFilter !== "visible" && statusFilter !== "all" && goal.status !== statusFilter) {
      return false;
    }
    if (levelFilter !== "all" && goal.level !== levelFilter) {
      return false;
    }
    if (routeFilter !== "all" && goal.roadmapRoute !== routeFilter) {
      return false;
    }

    return true;
  });
}

function isGoalCurrent(goal: StudyGoal, todayKey: string) {
  return goal.startDate <= todayKey && goal.endDate >= todayKey && goal.status !== "archived";
}

function pickCurrentGoal(goals: StudyGoal[], level: GoalLevel, todayKey: string) {
  return (
    goals
      .filter((goal) => goal.level === level && isGoalCurrent(goal, todayKey))
      .sort((left, right) => {
        if (left.status !== right.status) {
          return left.status === "active" ? -1 : right.status === "active" ? 1 : 0;
        }
        return left.order - right.order;
      })[0] ?? null
  );
}

function getParentLabel(goal: StudyGoal, goalTitleMap: Map<string, string>) {
  if (!goal.parentGoalId) {
    return null;
  }

  return goalTitleMap.get(goal.parentGoalId) ?? goal.parentGoalId;
}

interface GoalCardProps {
  goal: StudyGoal;
  progress: GoalProgressSummary;
  parentLabel: string | null;
  onEdit: (goal: StudyGoal) => void;
  onDelete: (goal: StudyGoal) => void;
  onSetStatus: (goalId: string, status: GoalStatus) => void;
  onToggleChecklist: (goalId: string, checklistItemId: string) => void;
}

function GoalCard({
  goal,
  progress,
  parentLabel,
  onEdit,
  onDelete,
  onSetStatus,
  onToggleChecklist,
}: GoalCardProps) {
  return (
    <article className="rounded-[28px] border border-slate-200 bg-white p-5">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-full bg-slate-950 px-3 py-1 text-xs font-semibold text-white">
              {goalLevelLabels[goal.level]}
            </span>
            <span className={`rounded-full px-3 py-1 text-xs font-medium ${statusClasses[goal.status]}`}>
              {goalStatusLabels[goal.status]}
            </span>
            <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-700">
              {roadmapRouteLabels[goal.roadmapRoute]}
            </span>
            <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-700">
              Year {goal.roadmapYear}
              {goal.roadmapPhase == null ? "" : ` · Phase ${goal.roadmapPhase}`}
            </span>
          </div>

          <h3 className="mt-4 text-xl font-semibold text-slate-950">{goal.title}</h3>
          <p className="mt-2 text-sm text-slate-500">
            {formatDateLong(goal.startDate)} - {formatDateLong(goal.endDate)}
            {parentLabel ? ` · 上级：${parentLabel}` : ""}
          </p>
          {goal.outcome ? (
            <p className="mt-3 text-sm leading-6 text-slate-600">{goal.outcome}</p>
          ) : null}

          <div className="mt-4">
            <div className="flex items-center justify-between gap-3 text-xs text-slate-500">
              <span>{formatProgressLabel(progress)}</span>
              <span className="font-medium text-slate-950">{progress.overallProgressPct}%</span>
            </div>
            <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-100">
              <div
                className="h-full rounded-full bg-teal-500"
                style={{ width: `${progress.overallProgressPct}%` }}
              />
            </div>
            {progress.projectedFinishDate ? (
              <p className="mt-2 text-xs text-slate-500">
                绑定学习项最晚预计完成：{formatDateLong(progress.projectedFinishDate)}
              </p>
            ) : null}
          </div>
        </div>

        <div className="flex flex-wrap gap-2 lg:justify-end">
          {goal.status !== "active" ? (
            <button
              type="button"
              onClick={() => onSetStatus(goal.id, "active")}
              className="rounded-full border border-slate-200 px-3 py-2 text-xs font-medium text-slate-700 transition hover:text-slate-950"
            >
              设为进行中
            </button>
          ) : null}
          {goal.status !== "completed" ? (
            <button
              type="button"
              onClick={() => onSetStatus(goal.id, "completed")}
              className="rounded-full border border-teal-100 px-3 py-2 text-xs font-medium text-teal-700 transition hover:border-teal-200"
            >
              标记完成
            </button>
          ) : null}
          <button
            type="button"
            onClick={() => onEdit(goal)}
            className="rounded-full border border-slate-200 px-3 py-2 text-xs font-medium text-slate-700 transition hover:text-slate-950"
          >
            编辑
          </button>
          <button
            type="button"
            onClick={() => onDelete(goal)}
            className="rounded-full border border-rose-100 px-3 py-2 text-xs font-medium text-rose-600 transition hover:border-rose-200"
          >
            删除
          </button>
        </div>
      </div>

      <div className="mt-5 grid gap-4 lg:grid-cols-2">
        <div className="rounded-2xl bg-slate-50 px-4 py-4">
          <p className="text-xs font-medium uppercase tracking-[0.16em] text-slate-500">
            绑定学习项
          </p>
          <div className="mt-3 space-y-2">
            {progress.linkedItems.length === 0 ? (
              <p className="text-sm text-slate-500">还没有绑定课程、资料或项目。</p>
            ) : (
              progress.linkedItems.map((item) => (
                <Link
                  key={item.id}
                  to={getUnifiedStudyItemPath(item)}
                  className="block rounded-2xl bg-white px-3 py-3 text-sm ring-1 ring-slate-200 transition hover:text-slate-950"
                >
                  <span className="font-medium text-slate-950">{item.title}</span>
                  <span className="mt-1 block text-xs text-slate-500">
                    {unifiedTypeLabels[item.type]} · {item.completedUnits}/{item.totalUnits} units · {item.progressPct}%
                  </span>
                </Link>
              ))
            )}
          </div>
        </div>

        <div className="rounded-2xl bg-slate-50 px-4 py-4">
          <p className="text-xs font-medium uppercase tracking-[0.16em] text-slate-500">
            验收清单
          </p>
          <div className="mt-3 space-y-2">
            {goal.checklist.length === 0 ? (
              <p className="text-sm text-slate-500">还没有拆出可验收动作。</p>
            ) : (
              goal.checklist.map((item) => (
                <label
                  key={item.id}
                  className="flex items-start gap-3 rounded-2xl bg-white px-3 py-3 text-sm"
                >
                  <input
                    type="checkbox"
                    checked={item.completed}
                    onChange={() => onToggleChecklist(goal.id, item.id)}
                    className="mt-1 h-4 w-4 rounded border-slate-300 text-teal-600 focus:ring-teal-500"
                  />
                  <span className={item.completed ? "text-slate-400 line-through" : "text-slate-700"}>
                    {item.title}
                  </span>
                </label>
              ))
            )}
          </div>
        </div>
      </div>
    </article>
  );
}

export function GoalsPage() {
  const {
    courses,
    learningItems,
    goals,
    addGoal,
    updateGoal,
    deleteGoal,
    setGoalStatus,
    toggleGoalChecklistItem,
  } = useCourseContext();
  const { snapshot } = usePlannerSnapshot();
  const [editingGoal, setEditingGoal] = useState<StudyGoal | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [levelFilter, setLevelFilter] = useState<LevelFilter>("all");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("visible");
  const [routeFilter, setRouteFilter] = useState<RouteFilter>("all");
  const todayKey = getDateKey(new Date());
  const itemMap = useMemo(
    () => buildGoalItemMap(courses, learningItems, snapshot.projectedFinishByItemId),
    [courses, learningItems, snapshot.projectedFinishByItemId],
  );
  const progressMap = useMemo(
    () =>
      new Map(goals.map((goal) => [goal.id, calculateGoalProgress(goal, itemMap)])),
    [goals, itemMap],
  );
  const goalTitleMap = useMemo(
    () => new Map(goals.map((goal) => [goal.id, goal.title])),
    [goals],
  );
  const filteredGoals = useMemo(
    () => applyFilters(goals, levelFilter, statusFilter, routeFilter),
    [goals, levelFilter, routeFilter, statusFilter],
  );
  const unifiedItems = useMemo(
    () => buildUnifiedStudyItems(courses, learningItems, snapshot.priorityRanking),
    [courses, learningItems, snapshot.priorityRanking],
  );
  const studyItemOptions = unifiedItems.map((item) => ({
    id: item.id,
    title: item.title,
    detail: `${unifiedTypeLabels[item.type]} · ${unifiedRoadmapStatusLabels[item.roadmapStatus]} · Phase ${item.roadmapPhase}`,
  }));
  const currentGoals = {
    quarter: pickCurrentGoal(goals, "quarter", todayKey),
    month: pickCurrentGoal(goals, "month", todayKey),
    week: pickCurrentGoal(goals, "week", todayKey),
  };
  const visibleGoals = goals.filter((goal) => goal.status !== "archived");
  const activeGoalCount = goals.filter((goal) => goal.status === "active").length;
  const completedGoalCount = goals.filter((goal) => goal.status === "completed").length;

  function closeModal() {
    setEditingGoal(null);
    setIsModalOpen(false);
  }

  function handleSubmit(input: StudyGoalInput) {
    if (editingGoal) {
      updateGoal(editingGoal.id, input);
    } else {
      addGoal(input);
    }
  }

  function handleDelete(goal: StudyGoal) {
    if (!window.confirm(`确定删除目标“${goal.title}”吗？`)) {
      return;
    }

    deleteGoal(goal.id);
  }

  if (courses.length === 0 && learningItems.length === 0 && goals.length === 0) {
    return (
      <EmptyState
        title="先建立学习库，再拆目标"
        description="目标会绑定课程、资料、练习和项目。先加入学习项后，系统可以把 Roadmap 拆成季度、月度和周目标。"
        actionLabel="去学习库"
        actionTo="/courses"
      />
    );
  }

  return (
    <div className="space-y-6">
      <section className="flex flex-col justify-between gap-5 lg:flex-row lg:items-end">
        <div>
          <p className="eyebrow">Goals</p>
          <h1 className="mt-2 text-4xl font-semibold tracking-tight text-slate-950">
            项目驱动目标
          </h1>
          <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-600">
            把四年 Roadmap 落成季度项目、月度 milestone 和周目标。目标只组织学习项和验收清单，不直接进入每日槽位。
          </p>
        </div>

        <button
          type="button"
          onClick={() => setIsModalOpen(true)}
          className="rounded-full bg-slate-950 px-5 py-3 text-sm font-medium text-white transition hover:bg-slate-800"
        >
          新增目标
        </button>
      </section>

      <section className="grid gap-4 md:grid-cols-4">
        <div className="panel p-5">
          <p className="text-sm text-slate-500">可见目标</p>
          <p className="mt-3 text-3xl font-semibold text-slate-950">{visibleGoals.length}</p>
          <p className="mt-2 text-sm text-slate-600">季度、月度、周目标统一管理。</p>
        </div>
        <div className="panel p-5">
          <p className="text-sm text-slate-500">进行中</p>
          <p className="mt-3 text-3xl font-semibold text-slate-950">{activeGoalCount}</p>
          <p className="mt-2 text-sm text-slate-600">只表示当前关注，不改变排课。</p>
        </div>
        <div className="panel p-5">
          <p className="text-sm text-slate-500">已完成</p>
          <p className="mt-3 text-3xl font-semibold text-slate-950">{completedGoalCount}</p>
          <p className="mt-2 text-sm text-slate-600">完成由你确认，不靠分钟自动判断。</p>
        </div>
        <div className="panel p-5">
          <p className="text-sm text-slate-500">当前日期</p>
          <p className="mt-3 text-2xl font-semibold text-slate-950">
            {formatDateShort(todayKey)}
          </p>
          <p className="mt-2 text-sm text-slate-600">用来判断当前季度/月/周目标。</p>
        </div>
      </section>

      <section className="grid gap-4 lg:grid-cols-3">
        {(["quarter", "month", "week"] as GoalLevel[]).map((level) => {
          const goal = currentGoals[level];
          const progress = goal ? progressMap.get(goal.id) : null;

          return (
            <div key={level} className="panel p-5">
              <p className="text-sm text-slate-500">{goalLevelLabels[level]}</p>
              {goal && progress ? (
                <>
                  <h2 className="mt-3 text-xl font-semibold text-slate-950">{goal.title}</h2>
                  <p className="mt-2 text-sm text-slate-600">
                    {formatDateShort(goal.startDate)} - {formatDateShort(goal.endDate)}
                  </p>
                  <div className="mt-4 h-2 overflow-hidden rounded-full bg-slate-100">
                    <div
                      className="h-full rounded-full bg-teal-500"
                      style={{ width: `${progress.overallProgressPct}%` }}
                    />
                  </div>
                  <p className="mt-2 text-sm text-slate-600">
                    {progress.overallProgressPct}% · {goalStatusLabels[goal.status]}
                  </p>
                </>
              ) : (
                <p className="mt-3 text-sm text-slate-500">当前周期还没有目标。</p>
              )}
            </div>
          );
        })}
      </section>

      <section className="panel p-5">
        <div className="grid gap-3 md:grid-cols-3">
          <label className="space-y-2">
            <span className="text-xs font-medium uppercase tracking-[0.16em] text-slate-500">
              层级
            </span>
            <select
              value={levelFilter}
              onChange={(event) => setLevelFilter(event.target.value as LevelFilter)}
              className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none transition focus:border-teal-500"
            >
              <option value="all">全部层级</option>
              {(["quarter", "month", "week"] as GoalLevel[]).map((level) => (
                <option key={level} value={level}>
                  {goalLevelLabels[level]}
                </option>
              ))}
            </select>
          </label>

          <label className="space-y-2">
            <span className="text-xs font-medium uppercase tracking-[0.16em] text-slate-500">
              状态
            </span>
            <select
              value={statusFilter}
              onChange={(event) => setStatusFilter(event.target.value as StatusFilter)}
              className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none transition focus:border-teal-500"
            >
              <option value="visible">隐藏归档</option>
              <option value="all">全部状态</option>
              {(["planned", "active", "completed", "paused", "archived"] as GoalStatus[]).map((status) => (
                <option key={status} value={status}>
                  {goalStatusLabels[status]}
                </option>
              ))}
            </select>
          </label>

          <label className="space-y-2">
            <span className="text-xs font-medium uppercase tracking-[0.16em] text-slate-500">
              Route
            </span>
            <select
              value={routeFilter}
              onChange={(event) => setRouteFilter(event.target.value as RouteFilter)}
              className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none transition focus:border-teal-500"
            >
              <option value="all">全部路线</option>
              {ROADMAP_ROUTES.map((route) => (
                <option key={route} value={route}>
                  {roadmapRouteLabels[route]}
                </option>
              ))}
            </select>
          </label>
        </div>
      </section>

      <section className="space-y-4">
        {filteredGoals.length === 0 ? (
          <div className="panel p-8 text-sm text-slate-500">
            当前筛选下没有目标。可以新建一个季度项目，或把筛选切回全部。
          </div>
        ) : (
          filteredGoals.map((goal) => (
            <GoalCard
              key={goal.id}
              goal={goal}
              progress={progressMap.get(goal.id) ?? calculateGoalProgress(goal, itemMap)}
              parentLabel={getParentLabel(goal, goalTitleMap)}
              onEdit={(nextGoal) => {
                setEditingGoal(nextGoal);
                setIsModalOpen(true);
              }}
              onDelete={handleDelete}
              onSetStatus={setGoalStatus}
              onToggleChecklist={toggleGoalChecklistItem}
            />
          ))
        )}
      </section>

      <GoalFormModal
        open={isModalOpen}
        goal={editingGoal}
        goals={goals}
        studyItems={studyItemOptions}
        onClose={closeModal}
        onSubmit={handleSubmit}
      />
    </div>
  );
}

