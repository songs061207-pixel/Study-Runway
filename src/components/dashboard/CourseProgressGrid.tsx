import { Link } from "react-router-dom";
import { Course, PlannerSnapshot } from "../../types";
import { formatDaysLeft } from "../../utils/date";
import { calculateCourseMetrics, formatHoursPerDay } from "../../utils/courseMetrics";
import { EmptyState } from "../ui/EmptyState";
import { RiskBadge } from "../ui/RiskBadge";

interface CourseProgressGridProps {
  courses: Course[];
  snapshot: PlannerSnapshot;
  onEdit: (course: Course) => void;
  onDelete: (course: Course) => void;
  title?: string;
  description?: string;
  limit?: number;
}

export function CourseProgressGrid({
  courses,
  snapshot,
  onEdit,
  onDelete,
  title = "学习库",
  description = "学习项卡片会直接显示优先级、本周投入和执行状态。",
  limit,
}: CourseProgressGridProps) {
  const courseMap = new Map(courses.map((course) => [course.id, course]));
  const visibleEntries =
    typeof limit === "number"
      ? snapshot.priorityRanking.slice(0, limit)
      : snapshot.priorityRanking;

  return (
    <section className="panel overflow-hidden">
      <div className="flex flex-col gap-3 border-b border-slate-200/80 px-6 py-5 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="eyebrow">Library</p>
          <h2 className="section-title mt-2">{title}</h2>
        </div>
        <p className="text-sm text-slate-500">{description}</p>
      </div>

      {visibleEntries.length === 0 ? (
        <div className="px-6 py-6">
          <EmptyState
            title="还没有课程"
            description="先导入学习项，系统才能开始生成优先级和周计划。"
            actionLabel="去学习库导入"
            actionTo="/courses"
          />
        </div>
      ) : (
        <div className="grid gap-4 px-6 py-6 lg:grid-cols-2">
          {visibleEntries.map((entry) => {
            const course = courseMap.get(entry.courseId);
            if (!course) {
              return null;
            }

            const metrics = calculateCourseMetrics(course);

            return (
              <article
                key={course.id}
                className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm transition hover:border-slate-300 hover:shadow-soft"
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-3">
                      <span className="h-3 w-3 rounded-full" style={{ backgroundColor: course.color }} />
                      <p className="text-sm font-medium text-slate-500">{course.provider}</p>
                      <RiskBadge level={entry.riskLevel} />
                      <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700">
                        Priority #{entry.rank}
                      </span>
                    </div>
                    <Link
                      to={`/courses/${course.id}`}
                      className="mt-3 inline-block text-2xl font-semibold tracking-tight text-slate-950 transition hover:text-teal-700"
                    >
                      {course.name}
                    </Link>
                    <p className="mt-2 text-sm text-slate-600">
                      {metrics.remainingUnits} 节未完成，当前状态：{metrics.statusLabel}
                    </p>
                  </div>

                  <div className="rounded-[24px] bg-slate-950 px-4 py-3 text-right text-white">
                    <p className="text-xs uppercase tracking-[0.18em] text-slate-400">本周投入</p>
                    <p className="mt-2 text-2xl font-semibold">{entry.scheduledUnitsThisWeek} 个动作</p>
                    <p className="mt-1 text-xs text-slate-300">
                      {entry.scheduledMinutesThisWeek} 分钟
                    </p>
                  </div>
                </div>

                <div className="mt-4 h-2 rounded-full bg-slate-200">
                  <div
                    className="h-2 rounded-full"
                    style={{
                      width: `${metrics.progressPct}%`,
                      backgroundColor: course.color,
                    }}
                  />
                </div>

                <div className="mt-5 grid grid-cols-2 gap-3">
                  <div className="rounded-2xl bg-slate-50 px-4 py-3">
                    <p className="text-xs text-slate-500">剩余天数</p>
                    <p className="mt-2 text-lg font-semibold text-slate-950">
                      {formatDaysLeft(entry.daysLeft)}
                    </p>
                  </div>
                  <div className="rounded-2xl bg-slate-50 px-4 py-3">
                    <p className="text-xs text-slate-500">所需日均</p>
                    <p className="mt-2 text-lg font-semibold text-slate-950">
                      {formatHoursPerDay(entry.requiredDailyPace)}
                    </p>
                  </div>
                  <div className="rounded-2xl bg-slate-50 px-4 py-3">
                    <p className="text-xs text-slate-500">近 7 天真实日均</p>
                    <p className="mt-2 text-lg font-semibold text-slate-950">
                      {formatHoursPerDay(entry.recentDailyPace)}
                    </p>
                  </div>
                  <div className="rounded-2xl bg-slate-50 px-4 py-3">
                    <p className="text-xs text-slate-500">系统状态</p>
                    <p className="mt-2 text-lg font-semibold text-slate-950">
                      {entry.inTodayPlan ? "已进今日任务" : entry.inWeeklyPlan ? "已纳入本周" : "本周未排到"}
                    </p>
                  </div>
                </div>

                <div className="mt-5 flex flex-wrap gap-3">
                  <Link
                    to={`/courses/${course.id}`}
                    className="rounded-full bg-slate-950 px-4 py-2 text-sm font-medium text-white transition hover:bg-slate-800"
                  >
                    查看详情
                  </Link>
                  <button
                    type="button"
                    onClick={() => onEdit(course)}
                    className="rounded-full border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 transition hover:border-slate-300 hover:text-slate-950"
                  >
                    编辑
                  </button>
                  <button
                    type="button"
                    onClick={() => onDelete(course)}
                    className="rounded-full border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 transition hover:border-rose-200 hover:text-rose-700"
                  >
                    删除
                  </button>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}
