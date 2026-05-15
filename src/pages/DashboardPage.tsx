import { useMemo } from "react";
import { Link } from "react-router-dom";
import { LifeOSSyncControls } from "../components/integrations/LifeOSSyncControls";
import { ExamFocusPanel } from "../components/dashboard/ExamFocusPanel";
import { OverviewStrip } from "../components/dashboard/OverviewStrip";
import { LongRangePlanBoard } from "../components/planner/LongRangePlanBoard";
import { EmptyState } from "../components/ui/EmptyState";
import { RiskBadge } from "../components/ui/RiskBadge";
import { useCourseContext } from "../context/CourseContext";
import { usePlannerSnapshot } from "../planner/usePlannerSnapshot";
import { calculateDashboardSummary, formatHoursPerDay } from "../utils/courseMetrics";
import { calculateGoalProgress, buildGoalItemMap } from "../utils/goalProgress";
import { learningItemToCourse } from "../utils/learningFactory";
import { isRoadmapActiveScheduled } from "../utils/roadmapMetadata";
import {
  buildUnifiedStudyItems,
  getUnifiedStudyItemPath,
  UnifiedStudyItem,
  unifiedIntensityLabels,
  unifiedTypeLabels,
} from "../utils/unifiedStudyItems";
import { goalLevelLabels, goalStatusLabels } from "../utils/goalFactory";

function getUnfinishedProjectionReason(item: UnifiedStudyItem) {
  if (item.deadlineMode === "manual") {
    return "仍受手动硬目标日限制";
  }
  if (item.dependencyIds.length > 0) {
    return "依赖链或当前候选窗口暂未解锁";
  }

  return "安全上限内暂未排完，通常需要检查容量、阶段顺序或排课候选";
}

export function DashboardPage() {
  const { courses, learningItems, goals, lastReplanAt } = useCourseContext();
  const { snapshot } = usePlannerSnapshot();
  const allStudyCourses = useMemo(
    () => [...courses, ...learningItems.map(learningItemToCourse)],
    [courses, learningItems],
  );
  const activeStudyCourses = useMemo(
    () => allStudyCourses.filter(isRoadmapActiveScheduled),
    [allStudyCourses],
  );
  const summary = useMemo(
    () => calculateDashboardSummary(activeStudyCourses),
    [activeStudyCourses],
  );
  const unifiedItems = useMemo(
    () => buildUnifiedStudyItems(courses, learningItems, snapshot.priorityRanking),
    [courses, learningItems, snapshot.priorityRanking],
  );
  const highlightItems = unifiedItems
    .filter(
      (item) =>
        item.remainingMinutes > 0 &&
        item.roadmapStatus === "active" &&
        item.scheduleMode === "scheduled",
    )
    .slice(0, 6);
  const unfinishedProjectionItems = useMemo(() => {
    const itemMap = new Map(unifiedItems.map((item) => [item.id, item]));

    return snapshot.unfinishedUnscheduledItemIds.map((itemId) => {
      const item = itemMap.get(itemId);
      return {
        id: itemId,
        title: item?.title ?? itemId,
        reason: item ? getUnfinishedProjectionReason(item) : "学习项已不在当前学习库中",
      };
    });
  }, [snapshot.unfinishedUnscheduledItemIds, unifiedItems]);
  const alertEntries = useMemo(
    () =>
      snapshot.priorityRanking
        .filter(
          (entry) =>
            entry.remainingUnits > 0 &&
            entry.roadmapStatus === "active" &&
            entry.scheduleMode === "scheduled" &&
            (entry.riskLevel === "high" ||
              entry.riskLevel === "overdue" ||
              entry.impossibleToFinish ||
              entry.daysSinceLastStudy >= 4),
        )
        .slice(0, 4),
    [snapshot.priorityRanking],
  );
  const goalItemMap = useMemo(
    () => buildGoalItemMap(courses, learningItems, snapshot.projectedFinishByItemId),
    [courses, learningItems, snapshot.projectedFinishByItemId],
  );
  const currentGoalSummaries = useMemo(
    () =>
      goals
        .filter((goal) => goal.status === "active" || goal.status === "planned")
        .slice(0, 3)
        .map((goal) => ({
          goal,
          progress: calculateGoalProgress(goal, goalItemMap),
        })),
    [goalItemMap, goals],
  );

  if (allStudyCourses.length === 0) {
    return (
      <EmptyState
        title="先加入第一个学习项"
        description="课程、书籍、资料都会进入同一套 Roadmap 调度。先去学习库添加内容，系统才能开始生成今日任务和 deadline。"
        actionLabel="去学习库"
        actionTo="/courses"
      />
    );
  }

  return (
    <div className="space-y-6">
      <section className="flex flex-col justify-between gap-5 lg:flex-row lg:items-end">
        <div>
          <p className="eyebrow">Dashboard</p>
          <h1 className="mt-2 text-4xl font-semibold tracking-tight text-slate-950">
            先看整体状态，再决定今天怎么推进
          </h1>
          <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-600">
            这里统一统计课程、书籍、资料、练习和项目。今日任务负责执行，学习库负责管理，Roadmap 负责看阶段关系。
          </p>
        </div>

        <div className="flex flex-wrap gap-3">
          <LifeOSSyncControls
            snapshot={snapshot}
            dashboardSummary={summary}
            lastReplanAt={lastReplanAt}
          />
          <Link
            to="/today"
            className="rounded-full bg-slate-950 px-5 py-3 text-sm font-medium text-white transition hover:bg-slate-800"
          >
            进入今日任务
          </Link>
          <Link
            to="/courses"
            className="rounded-full border border-slate-200 px-5 py-3 text-sm font-medium text-slate-700 transition hover:border-slate-300 hover:text-slate-950"
          >
            打开学习库
          </Link>
        </div>
      </section>

      <OverviewStrip summary={summary} snapshot={snapshot} />

      <ExamFocusPanel items={unifiedItems} snapshot={snapshot} />

      {currentGoalSummaries.length > 0 ? (
        <section className="panel p-6">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <p className="eyebrow">Project Goals</p>
              <h2 className="section-title mt-2">当前项目驱动目标</h2>
              <p className="mt-2 text-sm text-slate-600">
                目标负责把理论学习落成项目产出；每日任务仍由学习项自己的排课状态决定。
              </p>
            </div>
            <Link
              to="/goals"
              className="rounded-full border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 transition hover:text-slate-950"
            >
              打开目标页
            </Link>
          </div>
          <div className="mt-5 grid gap-4 lg:grid-cols-3">
            {currentGoalSummaries.map(({ goal, progress }) => (
              <Link
                key={goal.id}
                to="/goals"
                className="rounded-[24px] border border-slate-200 bg-slate-50/80 px-4 py-4 transition hover:border-slate-300 hover:bg-white"
              >
                <div className="flex flex-wrap items-center gap-2">
                  <span className="rounded-full bg-white px-3 py-1 text-xs font-medium text-slate-600 ring-1 ring-slate-200">
                    {goalLevelLabels[goal.level]}
                  </span>
                  <span className="rounded-full bg-white px-3 py-1 text-xs font-medium text-slate-600 ring-1 ring-slate-200">
                    {goalStatusLabels[goal.status]}
                  </span>
                </div>
                <h3 className="mt-3 font-semibold text-slate-950">{goal.title}</h3>
                <div className="mt-4 h-2 overflow-hidden rounded-full bg-white">
                  <div
                    className="h-full rounded-full bg-teal-500"
                    style={{ width: `${progress.overallProgressPct}%` }}
                  />
                </div>
                <p className="mt-2 text-sm text-slate-600">
                  {progress.overallProgressPct}% · 绑定 {progress.linkedItems.length} 项
                </p>
              </Link>
            ))}
          </div>
        </section>
      ) : null}

      <LongRangePlanBoard
        weeks={snapshot.masterPlan}
        planningHorizonEnd={snapshot.planningHorizonEnd}
        projectedFinishDate={snapshot.roadmapProjectedFinishDate}
        unfinishedUnscheduledCount={snapshot.unfinishedUnscheduledItemIds.length}
        unfinishedUnscheduledItems={unfinishedProjectionItems}
      />

      <section className="panel p-6">
        <div className="flex items-end justify-between gap-3">
          <div>
            <p className="eyebrow">Alerts</p>
            <h2 className="section-title mt-2">调度关注与重排提醒</h2>
          </div>
          <p className="text-sm text-slate-500">
            {lastReplanAt
              ? `最近重排：${new Intl.DateTimeFormat("zh-CN", {
                  month: "numeric",
                  day: "numeric",
                  hour: "2-digit",
                  minute: "2-digit",
                }).format(new Date(lastReplanAt))}`
              : "还没有重排记录"}
          </p>
        </div>

        <div className="mt-6 space-y-4">
          {alertEntries.length === 0 ? (
            <div className="rounded-[24px] border border-dashed border-slate-300 px-4 py-5 text-sm text-slate-500">
              当前没有特别激烈的调度提醒，系统判断整体仍在可控区间。
            </div>
          ) : (
            alertEntries.map((entry) => (
              <div
                key={entry.courseId}
                className="rounded-[24px] border border-slate-200 bg-slate-50/80 p-4"
              >
                <div className="flex items-center justify-between gap-3">
                  <p className="font-semibold text-slate-950">{entry.courseName}</p>
                  <span className="rounded-full bg-slate-950 px-3 py-1 text-xs font-semibold text-white">
                    Priority #{entry.rank}
                  </span>
                </div>
                <p className="mt-2 text-xs text-slate-500">
                  调度压力 {formatHoursPerDay(entry.requiredDailyPace)} · 最近{" "}
                  {formatHoursPerDay(entry.recentDailyPace)} · 已冷落{" "}
                  {entry.daysSinceLastStudy} 天
                </p>
              </div>
            ))
          )}
        </div>
      </section>

      <section className="panel overflow-hidden">
        <div className="flex flex-col gap-3 border-b border-slate-200/80 px-6 py-5 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="eyebrow">Study Priority</p>
            <h2 className="section-title mt-2">学习项优先级排位</h2>
          </div>
          <p className="text-sm text-slate-500">课程和资料统一进入同一个风险与进度视图。</p>
        </div>

        <div className="grid gap-4 px-6 py-6 lg:grid-cols-2">
          {highlightItems.map((item) => {
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
                      {entry ? <RiskBadge level={entry.riskLevel} /> : null}
                    </div>
                    <Link
                      to={getUnifiedStudyItemPath(item)}
                      className="mt-3 inline-block text-2xl font-semibold tracking-tight text-slate-950 transition hover:text-teal-700"
                    >
                      {item.title}
                    </Link>
                    <p className="mt-2 text-sm text-slate-600">
                      Phase {item.roadmapPhase} · {item.roadmapTrack} · 剩余{" "}
                      {Math.round(item.remainingMinutes)} 分钟
                    </p>
                  </div>

                  <div className="rounded-[24px] bg-slate-950 px-4 py-3 text-right text-white">
                    <p className="text-xs uppercase tracking-[0.18em] text-slate-400">
                      本周安排
                    </p>
                    <p className="mt-2 text-2xl font-semibold">
                      {entry?.scheduledUnitsThisWeek ?? 0}
                    </p>
                    <p className="mt-1 text-xs text-slate-300">个动作</p>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      </section>
    </div>
  );
}
