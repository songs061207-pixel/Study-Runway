import { DashboardSummary, PlannerSnapshot } from "../types";

export interface LifeOSToolSummary {
  tool_id: string;
  name: string;
  role: string;
  status: "ok" | "registered_only" | "missing_source" | "error";
  updated_at: string;
  summary: string;
  metrics: Record<string, string | number | boolean | null>;
  next_actions: string[];
  deep_link?: string | null;
  source_files: string[];
  extra?: Record<string, unknown>;
}

interface BuildStudyRunwaySummaryOptions {
  snapshot: PlannerSnapshot;
  dashboardSummary: DashboardSummary;
  lastReplanAt?: string;
  appOrigin?: string;
}

interface LifeOSIngestResponse {
  stored?: LifeOSToolSummary;
  stored_path?: string;
  payload?: unknown;
  error?: string;
}

export const DEFAULT_LIFEOS_INGEST_ENDPOINT =
  "http://127.0.0.1:8790/api/ingest-summary";

function resolveAppOrigin(appOrigin?: string) {
  if (appOrigin) {
    return appOrigin;
  }
  if (typeof window !== "undefined") {
    return window.location.origin;
  }
  return "http://127.0.0.1:5173";
}

function buildTaskLabel(
  task: PlannerSnapshot["todayPlan"]["tasks"][number],
  index: number,
) {
  return `${index + 1}. ${task.itemTitle} - ${task.actionLabel} (${task.estimatedMinutes} 分钟)`;
}

export function buildStudyRunwayLifeOSSummary({
  snapshot,
  dashboardSummary,
  lastReplanAt,
  appOrigin,
}: BuildStudyRunwaySummaryOptions): LifeOSToolSummary {
  const tasks = snapshot.todayPlan.tasks;
  const completedTasks = tasks.filter((task) => task.status === "completed").length;
  const pendingTasks = tasks.filter((task) => task.status === "pending").length;
  const skippedTasks = tasks.filter((task) => task.status === "skipped").length;
  const highRiskItems = snapshot.priorityRanking.filter(
    (entry) =>
      entry.remainingUnits > 0 &&
      (entry.riskLevel === "high" ||
        entry.riskLevel === "overdue" ||
        entry.impossibleToFinish),
  );
  const overdueItems = snapshot.priorityRanking.filter(
    (entry) => entry.remainingUnits > 0 && entry.riskLevel === "overdue",
  );
  const topActions = tasks.slice(0, 4).map(buildTaskLabel);
  const primaryTask = snapshot.todayPlan.highestRiskCourse ?? tasks[0] ?? null;
  const origin = resolveAppOrigin(appOrigin);

  const summary =
    tasks.length > 0
      ? `今日 ${tasks.length} 个学习动作，预计 ${snapshot.todayPlan.baselineMinutes} 分钟，${
          snapshot.todayPlan.withinCapacity
            ? "容量可控"
            : `超出容量 ${snapshot.todayPlan.overloadMinutes} 分钟`
        }；当前最该先做：${primaryTask?.itemTitle ?? primaryTask?.courseName ?? "未确定"}。`
      : "今日还没有排出学习动作，需要检查学习库、依赖关系或容量设置。";

  return {
    tool_id: "study-runway",
    name: "课程进度跟踪工具",
    role: "learning_execution",
    status: "ok",
    updated_at: new Date().toISOString(),
    summary,
    metrics: {
      today_tasks: tasks.length,
      today_completed_tasks: completedTasks,
      today_pending_tasks: pendingTasks,
      today_skipped_tasks: skippedTasks,
      today_minutes: snapshot.todayPlan.baselineMinutes,
      today_units: snapshot.todayPlan.baselineUnits,
      within_capacity: snapshot.todayPlan.withinCapacity,
      overload_minutes: snapshot.todayPlan.overloadMinutes,
      high_risk_items: highRiskItems.length,
      overdue_items: overdueItems.length,
      weekly_minutes: snapshot.weeklyPlan.totalMinutes,
      weekly_units: snapshot.weeklyPlan.totalUnits,
      active_items: dashboardSummary.activeCourses,
      remaining_units: dashboardSummary.unitsRemaining,
      unfinished_unscheduled_items: snapshot.unfinishedUnscheduledItemIds.length,
    },
    next_actions: topActions,
    deep_link: new URL("/today", origin).toString(),
    source_files: [
      "browser_localStorage:study-runway:*",
      "planner:todayPlan",
      "planner:priorityRanking",
    ],
    extra: {
      focus_task_ids: tasks.slice(0, 4).map((task) => task.taskId),
      primary_task: primaryTask
        ? {
            task_id: primaryTask.taskId,
            item_title: primaryTask.itemTitle,
            course_name: primaryTask.courseName,
            estimated_minutes: primaryTask.estimatedMinutes,
            priority_rank: primaryTask.priorityRank,
          }
        : null,
      roadmap_projected_finish_date: snapshot.roadmapProjectedFinishDate,
      last_replan_at: lastReplanAt ?? null,
    },
  };
}

export async function syncStudyRunwaySummary(
  summary: LifeOSToolSummary,
  endpoint = DEFAULT_LIFEOS_INGEST_ENDPOINT,
): Promise<LifeOSIngestResponse> {
  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      tool_id: "study-runway",
      summary,
    }),
  });

  const payload = (await response.json()) as LifeOSIngestResponse;
  if (!response.ok) {
    throw new Error(payload.error || `HTTP ${response.status}`);
  }

  return payload;
}
