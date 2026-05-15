import { useState } from "react";
import { Link } from "react-router-dom";
import { MasterPlanWeek } from "../../types";
import { formatDateLong, parseDateKey } from "../../utils/date";

interface LongRangePlanBoardProps {
  weeks: MasterPlanWeek[];
  planningHorizonEnd: string;
  projectedFinishDate: string | null;
  unfinishedUnscheduledCount: number;
  unfinishedUnscheduledItems?: { id: string; title: string; reason: string }[];
}

const INITIAL_VISIBLE_WEEKS = 8;

const loadClasses = {
  light: "border-slate-200 bg-white/60 opacity-80",
  balanced: "border-slate-200 bg-white/90",
  heavy: "border-amber-200 bg-amber-50/80",
  overload: "border-rose-200 bg-rose-50/80",
} satisfies Record<MasterPlanWeek["days"][number]["loadLevel"], string>;

const loadLabels = {
  light: "偏轻",
  balanced: "平衡",
  heavy: "偏重",
  overload: "超载",
} satisfies Record<MasterPlanWeek["days"][number]["loadLevel"], string>;

const intensityLabels = {
  heavy: "重",
  light: "轻",
} as const;

function formatDateLabel(dateKey: string) {
  return new Intl.DateTimeFormat("zh-CN", {
    month: "numeric",
    day: "numeric",
  }).format(parseDateKey(dateKey));
}

function formatWeekLabel(startDate: string, endDate: string) {
  return `${formatDateLabel(startDate)} - ${formatDateLabel(endDate)}`;
}

function getWeekCourseCount(week: MasterPlanWeek) {
  return new Set(week.days.flatMap((day) => day.tasks.map((task) => task.courseId))).size;
}

type LongRangeTask = MasterPlanWeek["days"][number]["tasks"][number];

function getTaskUnitLabel(task: LongRangeTask) {
  const unitTitles = task.unitTitles.length > 0 ? task.unitTitles : task.lectureTitles;
  if (unitTitles.length === 0) {
    return null;
  }

  if (unitTitles.length === 1) {
    return unitTitles[0];
  }

  return `${unitTitles[0]} 等 ${unitTitles.length} 个 unit`;
}

export function LongRangePlanBoard({
  weeks,
  planningHorizonEnd,
  projectedFinishDate,
  unfinishedUnscheduledCount,
  unfinishedUnscheduledItems = [],
}: LongRangePlanBoardProps) {
  const [showAllWeeks, setShowAllWeeks] = useState(false);
  const visibleWeeks = showAllWeeks ? weeks : weeks.slice(0, INITIAL_VISIBLE_WEEKS);
  const hiddenWeekCount = Math.max(0, weeks.length - visibleWeeks.length);

  if (weeks.length === 0) {
    return null;
  }

  return (
    <section className="panel overflow-hidden">
      <div className="border-b border-slate-200/80 px-6 py-5">
        <p className="eyebrow">Master Plan</p>
        <h2 className="section-title mt-2">长线 Roadmap 上课节奏</h2>
        <p className="mt-2 max-w-3xl text-sm text-slate-600">
          这张总 Roadmap 会按“正常上课模式”预览当前排课结果：每天默认 2 个 120 分钟重学习块和 1 个 60 分钟轻学习块。今日执行请回到今日学习动作页，最近两周的细调请去周计划页；这里更适合看整体节奏有没有偏科、依赖锁住或候选不足。
        </p>
        <div className="mt-4 flex flex-wrap gap-2 text-xs text-slate-500">
          <span className="rounded-full bg-slate-50 px-3 py-1 ring-1 ring-slate-200">
            共 {weeks.length} 周
          </span>
          <span className="rounded-full bg-slate-50 px-3 py-1 ring-1 ring-slate-200">
            规划到 {formatDateLong(planningHorizonEnd)}
          </span>
          {projectedFinishDate ? (
            <span className="rounded-full bg-slate-50 px-3 py-1 ring-1 ring-slate-200">
              预计全部上完 {formatDateLong(projectedFinishDate)}
            </span>
          ) : null}
          {unfinishedUnscheduledCount > 0 ? (
            <span className="rounded-full bg-amber-50 px-3 py-1 text-amber-700 ring-1 ring-amber-200">
              {unfinishedUnscheduledCount} 项暂未完成推算
            </span>
          ) : null}
        </div>
        {unfinishedUnscheduledItems.length > 0 ? (
          <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
            <p className="font-medium">暂未完成推算的学习项</p>
            <ul className="mt-2 space-y-1">
              {unfinishedUnscheduledItems.map((item) => (
                <li key={item.id}>
                  {item.title}：{item.reason}
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </div>

      <div className="space-y-4 px-6 py-6">
        {visibleWeeks.map((week) => {
          const weekCourseCount = getWeekCourseCount(week);

          return (
            <article
              key={week.weekKey}
              className="rounded-[28px] border border-slate-200 bg-white/80 p-4"
            >
              <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    {week.isCurrentWeek ? (
                      <span className="rounded-full bg-slate-950 px-3 py-1 text-xs font-medium text-white">
                        当前周
                      </span>
                    ) : null}
                    {week.isNextWeek ? (
                      <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-700 ring-1 ring-slate-200">
                        下周
                      </span>
                    ) : null}
                  </div>
                  <h3 className="mt-3 text-xl font-semibold text-slate-950">
                    {formatWeekLabel(week.startDate, week.endDate)}
                  </h3>
                  <p className="mt-2 text-sm text-slate-600">
                    这一周安排了 {weekCourseCount} 个学习项，共 {week.totalUnits} 个学习动作 / {week.totalMinutes} 分钟。
                  </p>
                </div>

                <div className="flex flex-wrap gap-2 text-xs text-slate-500">
                  <span className="rounded-full bg-slate-50 px-3 py-1 ring-1 ring-slate-200">
                    超载 {week.overloadedDates.length} 天
                  </span>
                  <span className="rounded-full bg-slate-50 px-3 py-1 ring-1 ring-slate-200">
                    偏轻 {week.underloadedDates.length} 天
                  </span>
                </div>
              </div>

              <div className="mt-4 grid gap-3 xl:grid-cols-7">
                {week.days.map((day) => {
                  return (
                    <div
                      key={day.date}
                      className={`rounded-2xl border p-3 ${loadClasses[day.loadLevel]}`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="text-sm font-semibold text-slate-950">{day.label}</p>
                          <p className="mt-1 text-xs text-slate-500">
                            重 {day.intensityLoads.heavy.minutes}/{day.intensityLoads.heavy.capacityMinutes} · 轻 {day.intensityLoads.light.minutes}/{day.intensityLoads.light.capacityMinutes}
                          </p>
                        </div>
                        <span className="rounded-full bg-white px-3 py-1 text-[11px] font-medium text-slate-600 ring-1 ring-slate-200">
                          {loadLabels[day.loadLevel]}
                        </span>
                      </div>

                      <div className="mt-3 flex flex-wrap gap-2 text-[11px] text-slate-500">
                        <span className="rounded-full bg-white px-2.5 py-1 ring-1 ring-slate-200">
                          {day.totalUnits} 个动作
                        </span>
                        <span className="rounded-full bg-white px-2.5 py-1 ring-1 ring-slate-200">
                          {day.tasks.length} 个学习项
                        </span>
                        {day.isToday ? (
                          <span className="rounded-full bg-slate-950 px-2.5 py-1 text-white">
                            今天
                          </span>
                        ) : null}
                      </div>

                      <div className="mt-3 space-y-2">
                        {day.tasks.length === 0 ? (
                          <div className="rounded-2xl border border-dashed border-slate-300 px-3 py-4 text-xs text-slate-500">
                            这一天没有可解锁的新学习动作，通常是候选不足、依赖锁住，或手动减压导致。
                          </div>
                        ) : (
                          day.tasks.map((task) => {
                            const unitLabel = getTaskUnitLabel(task);

                            return (
                            <Link
                              key={task.taskId}
                              to={task.sourceType === "learningItem" ? `/learning-items/${task.courseId}` : `/courses/${task.courseId}#lectures`}
                              className="block rounded-2xl bg-white/80 px-3 py-3 text-sm ring-1 ring-slate-200 transition hover:text-slate-950"
                            >
                              <div className="flex items-center justify-between gap-3">
                                <p className="truncate font-medium text-slate-950">
                                  {task.courseName}
                                </p>
                                <span className="text-xs text-slate-500">
                                  {Math.max(1, Math.round(task.slotCount ?? 1))} 块
                                </span>
                              </div>
                              {unitLabel ? (
                                <p className="mt-1 line-clamp-2 text-xs leading-5 text-slate-600">
                                  {unitLabel}
                                </p>
                              ) : null}
                              <p className="mt-1 text-xs text-slate-500">
                                {intensityLabels[task.intensity]}学习 · {task.estimatedMinutes} 分钟
                              </p>
                            </Link>
                            );
                          })
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </article>
          );
        })}
        {hiddenWeekCount > 0 || showAllWeeks ? (
          <div className="flex justify-center pt-2">
            <button
              type="button"
              onClick={() => setShowAllWeeks((currentValue) => !currentValue)}
              className="rounded-full border border-slate-200 bg-white px-5 py-3 text-sm font-medium text-slate-700 transition hover:border-slate-300 hover:text-slate-950"
            >
              {showAllWeeks ? "收起长期计划" : `展开后续 ${hiddenWeekCount} 周`}
            </button>
          </div>
        ) : null}
      </div>
    </section>
  );
}
