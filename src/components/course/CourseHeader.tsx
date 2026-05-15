import { Link } from "react-router-dom";
import {
  Course,
  CourseMetrics,
  CourseSyllabusSyncPreview,
  PriorityScoreEntry,
} from "../../types";
import { formatHoursPerDay } from "../../utils/courseMetrics";
import { roadmapStatusLabels } from "../../utils/roadmapMetadata";
import { RiskBadge } from "../ui/RiskBadge";

interface CourseHeaderProps {
  course: Course;
  metrics: CourseMetrics;
  priorityEntry: PriorityScoreEntry | null;
  syllabusPreview: CourseSyllabusSyncPreview | null;
  projectedFinishLabel: string;
  systemTargetLabel: string;
  onEdit: () => void;
  onDelete: () => void;
  onSyncSyllabus: () => void;
}

export function CourseHeader({
  course,
  metrics,
  priorityEntry,
  syllabusPreview,
  projectedFinishLabel,
  systemTargetLabel,
  onEdit,
  onDelete,
  onSyncSyllabus,
}: CourseHeaderProps) {
  const statItems = [
    {
      label: "总进度",
      value: `${metrics.progressPct}%`,
      detail: `${metrics.completedUnits}/${course.totalUnits} 节已完成`,
    },
    {
      label: "预计上完",
      value: projectedFinishLabel,
      detail: `系统目标 ${systemTargetLabel}`,
    },
    {
      label: "优先级排名",
      value: priorityEntry ? `#${priorityEntry.rank}` : "未排入",
      detail: priorityEntry
        ? `${priorityEntry.deadlineMode === "auto" ? "自动调度" : "手动目标"} · 目标压力 ${formatHoursPerDay(priorityEntry.requiredDailyPace)}`
        : "系统暂时还没把它放进当前调度窗口。",
    },
    {
      label: "本周计划",
      value: priorityEntry
        ? `${priorityEntry.scheduledUnitsThisWeek} 个学习块 / ${priorityEntry.scheduledMinutesThisWeek} 分钟`
        : "0",
      detail:
        priorityEntry && priorityEntry.inWeeklyPlan
          ? "这门课已经被纳入本周课程表。"
          : "当前这周计划里还没有给它排到任务。",
    },
  ];

  return (
    <section className="panel overflow-hidden">
      <div className="border-b border-slate-200/80 px-6 py-6">
        <Link
          to="/courses"
          className="text-sm font-medium text-slate-500 transition hover:text-slate-900"
        >
          返回学习库
        </Link>

        <div className="mt-4 flex flex-col gap-5 xl:flex-row xl:items-end xl:justify-between">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-3">
              <span className="h-3 w-3 rounded-full" style={{ backgroundColor: course.color }} />
              <p className="text-sm font-medium text-slate-500">{course.provider}</p>
              <RiskBadge level={priorityEntry?.riskLevel ?? metrics.riskLevel} />
              <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700">
                难度 {course.difficulty}/5
              </span>
              <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700">
                {roadmapStatusLabels[course.roadmapStatus]}
              </span>
              <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700">
                {course.scheduleMode === "reference" ? "Reference" : "允许排课"}
              </span>
            </div>
            <h1 className="mt-3 text-4xl font-semibold tracking-tight text-slate-950">
              {course.name}
            </h1>
            <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-600">
              {course.notes || "这门课还没有备注，可以写下重点章节或执行提醒。"}
            </p>
            <div className="mt-4 flex flex-wrap items-center gap-4 text-sm text-slate-500">
              <span>预计上完：{projectedFinishLabel}</span>
              <span>系统目标：{systemTargetLabel}</span>
              <span>目标压力日均：{formatHoursPerDay(metrics.requiredDailyPace)}</span>
              <span>近 7 天真实速度：{formatHoursPerDay(metrics.recentDailyPace)}</span>
              <span>排课槽：按重/轻学习容量拆分</span>
              <span>lecture 默认预计：{course.lectureMinutes} 分钟</span>
              {course.sourceUrl ? (
                <a
                  href={course.sourceUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="font-medium text-teal-700 transition hover:text-teal-800"
                >
                  打开课程链接
                </a>
              ) : null}
            </div>
            {syllabusPreview ? (
              <p className="mt-3 text-sm text-slate-500">
                官方校验目录 {syllabusPreview.canonicalUnits} 节
                {syllabusPreview.hasChanges
                  ? `，当前是 ${syllabusPreview.currentUnits} 节，可一键同步。`
                  : "，当前目录已对齐。"}
              </p>
            ) : null}
          </div>

          <div className="flex flex-wrap gap-3">
            {syllabusPreview ? (
              <button
                type="button"
                onClick={onSyncSyllabus}
                className="rounded-full border border-teal-200 px-5 py-3 text-sm font-medium text-teal-700 transition hover:border-teal-300 hover:text-teal-800"
              >
                同步官方目录
              </button>
            ) : null}
            <button
              type="button"
              onClick={onEdit}
              className="rounded-full border border-slate-200 px-5 py-3 text-sm font-medium text-slate-700 transition hover:border-slate-300 hover:text-slate-900"
            >
              编辑课程
            </button>
            <button
              type="button"
              onClick={onDelete}
              className="rounded-full border border-slate-200 px-5 py-3 text-sm font-medium text-slate-700 transition hover:border-rose-200 hover:text-rose-700"
            >
              删除课程
            </button>
          </div>
        </div>
      </div>

      <div className="grid gap-4 px-6 py-6 md:grid-cols-2 xl:grid-cols-4">
        {statItems.map((item) => (
          <div key={item.label} className="rounded-[24px] bg-slate-50 px-4 py-4">
            <p className="text-xs text-slate-500">{item.label}</p>
            <p className="mt-2 text-xl font-semibold text-slate-950">{item.value}</p>
            <p className="mt-2 text-sm text-slate-600">{item.detail}</p>
          </div>
        ))}
      </div>
    </section>
  );
}
