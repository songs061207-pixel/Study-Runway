import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useCourseContext } from "../../context/CourseContext";
import { PlannerSnapshot } from "../../types";
import { makeCourseInputFromCourse } from "../../utils/courseFactory";
import {
  differenceInCalendarDays,
  formatDateLong,
  formatDateShort,
  getDateKey,
} from "../../utils/date";
import {
  getUnifiedStudyItemPath,
  UnifiedStudyItem,
} from "../../utils/unifiedStudyItems";

const EXAM_TARGET_DATE = "2026-06-15";
const EXAM_WINDOW_START = "2026-06-22";
const EXAM_WINDOW_END = "2026-07-05";
const EXAM_PRIORITY = 5;

interface ExamFocusSubjectConfig {
  id: string;
  label: string;
  aliases: string;
  titleKeywords: string[];
  fallbackKeywords: string[];
}

interface ExamFocusPanelProps {
  items: UnifiedStudyItem[];
  snapshot: PlannerSnapshot;
}

interface WeeklyFocusTask {
  taskId: string;
  date: string;
  label: string;
  title: string;
  minutes: number;
}

interface ExamFocusAdjustment {
  id: string;
  title: string;
  fromDeadline: string;
  toDeadline: string;
  fromPriority: number;
  toPriority: number;
  willActivate: boolean;
  item: UnifiedStudyItem;
}

const examSubjects: ExamFocusSubjectConfig[] = [
  {
    id: "calculus",
    label: "高数下",
    aliases: "Calculus / MIT 18.01-18.02",
    titleKeywords: ["高数", "微积分", "calculus", "multivariable"],
    fallbackKeywords: [
      "高数",
      "微积分",
      "calculus",
      "multivariable",
      "18.01",
      "18-01",
      "18.02",
      "18-02",
      "mitx+18.01",
      "mitxt+18.02",
    ],
  },
  {
    id: "linear-algebra",
    label: "线性代数",
    aliases: "Linear Algebra / MIT 18.06",
    titleKeywords: ["线性代数", "linear algebra"],
    fallbackKeywords: ["线性代数", "linear algebra", "18.06", "18-06", "ocw+18.06"],
  },
  {
    id: "physics",
    label: "大学物理",
    aliases: "Mechanics / E&M / MIT 8.01-8.02",
    titleKeywords: [
      "大学物理",
      "physics",
      "mechanics",
      "electricity",
      "magnetism",
      "electrostatics",
    ],
    fallbackKeywords: [
      "大学物理",
      "physics",
      "mechanics",
      "electricity",
      "magnetism",
      "electrostatics",
      "8.01",
      "8-01",
      "8.02",
      "8-02",
      "mitx+8.01",
      "mitx+8.02",
    ],
  },
];

function normalizeSearchText(value?: string) {
  return value?.toLowerCase().trim() ?? "";
}

function buildItemSearchText(item: UnifiedStudyItem) {
  return normalizeSearchText(
    [
      item.title,
      item.provider,
      item.sourceUrl,
      item.roadmapTrack,
      item.course?.canonicalId,
    ]
      .filter(Boolean)
      .join(" "),
  );
}

function getExamSubjectId(item: UnifiedStudyItem) {
  if (
    item.type !== "course" ||
    item.roadmapStatus === "archived" ||
    item.scheduleMode !== "scheduled"
  ) {
    return null;
  }

  const titleText = normalizeSearchText(item.title);
  const titleMatch = examSubjects.find((subject) =>
    subject.titleKeywords.some((keyword) => titleText.includes(keyword)),
  );
  if (titleMatch) {
    return titleMatch.id;
  }

  const searchText = buildItemSearchText(item);
  const fallbackMatch = examSubjects.find((subject) =>
    subject.fallbackKeywords.some((keyword) => searchText.includes(keyword)),
  );

  return fallbackMatch?.id ?? null;
}

function isExamCourse(item: UnifiedStudyItem, subject: ExamFocusSubjectConfig) {
  return getExamSubjectId(item) === subject.id;
}

function getLatestDate(dates: string[]) {
  const sortedDates = [...dates].sort((left, right) => left.localeCompare(right));
  return sortedDates[sortedDates.length - 1] ?? null;
}

function getProjectedFinishLabel(items: UnifiedStudyItem[], snapshot: PlannerSnapshot) {
  if (items.length === 0) {
    return null;
  }

  const remainingItems = items.filter((item) => item.remainingMinutes > 0);
  if (remainingItems.length === 0) {
    return "已完成";
  }

  const projectedDates = remainingItems
    .map((item) => snapshot.projectedFinishByItemId[item.id])
    .filter((value): value is string => Boolean(value));
  if (projectedDates.length < remainingItems.length) {
    return "暂未推算";
  }

  const latestDate = getLatestDate(projectedDates);

  return latestDate ? formatDateLong(latestDate) : "暂未推算";
}

function getLatestProjectedFinish(items: UnifiedStudyItem[], snapshot: PlannerSnapshot) {
  const remainingItems = items.filter((item) => item.remainingMinutes > 0);
  const projectedDates = remainingItems
    .map((item) => snapshot.projectedFinishByItemId[item.id])
    .filter((value): value is string => Boolean(value));
  if (projectedDates.length < remainingItems.length) {
    return null;
  }

  return getLatestDate(projectedDates);
}

function getStatusTone(items: UnifiedStudyItem[], projectedFinishDate: string | null) {
  if (items.length === 0) {
    return {
      label: "未匹配",
      className: "border-slate-200 bg-slate-50 text-slate-600",
      detail: "还没有找到对应的 Roadmap 课程。",
    };
  }

  const remainingMinutes = items.reduce((total, item) => total + item.remainingMinutes, 0);
  if (remainingMinutes <= 0) {
    return {
      label: "已覆盖",
      className: "border-emerald-200 bg-emerald-50 text-emerald-700",
      detail: "当前匹配课程已经全部完成。",
    };
  }

  if (!projectedFinishDate) {
    return {
      label: "需检查",
      className: "border-amber-200 bg-amber-50 text-amber-700",
      detail: "当前还有内容未完成，但长期计划暂时没有推算出完成日。",
    };
  }

  const deltaDays = differenceInCalendarDays(projectedFinishDate, EXAM_TARGET_DATE);
  if (deltaDays <= 0) {
    return {
      label: "可控",
      className: "border-emerald-200 bg-emerald-50 text-emerald-700",
      detail:
        deltaDays === 0
          ? "预计正好在第一轮目标日完成。"
          : `预计比第一轮目标早 ${Math.abs(deltaDays)} 天完成。`,
    };
  }

  return {
    label: deltaDays > 7 ? "需调目标" : "压线",
    className:
      deltaDays > 7
        ? "border-rose-200 bg-rose-50 text-rose-700"
        : "border-amber-200 bg-amber-50 text-amber-700",
    detail: `预计比第一轮目标晚 ${deltaDays} 天完成。建议用现有课程编辑把相关课程目标日调到 ${formatDateShort(EXAM_TARGET_DATE)}，并提高 priority。`,
  };
}

function getSubjectProgress(items: UnifiedStudyItem[]) {
  const totalUnits = items.reduce((total, item) => total + item.totalUnits, 0);
  const completedUnits = items.reduce((total, item) => total + item.completedUnits, 0);
  const remainingMinutes = items.reduce((total, item) => total + item.remainingMinutes, 0);
  const progressPct = totalUnits <= 0 ? 0 : Math.round((completedUnits / totalUnits) * 100);

  return {
    totalUnits,
    completedUnits,
    remainingMinutes,
    progressPct,
  };
}

function getTaskTitle(task: PlannerSnapshot["weeklyPlan"]["days"][number]["tasks"][number]) {
  const unitTitle = task.unitTitles[0] ?? task.lectureTitles[0];
  return unitTitle ? `${task.courseName}：${unitTitle}` : task.courseName;
}

function getWeeklyFocusTasks(
  subjectItems: UnifiedStudyItem[],
  snapshot: PlannerSnapshot,
): WeeklyFocusTask[] {
  const itemIds = new Set(subjectItems.map((item) => item.id));

  return snapshot.weeklyPlan.days.flatMap((day) =>
    day.tasks
      .filter((task) => itemIds.has(task.courseId) || itemIds.has(task.itemId))
      .map((task) => ({
        taskId: task.taskId,
        date: day.date,
        label: day.label,
        title: getTaskTitle(task),
        minutes: task.estimatedMinutes,
      })),
  );
}

function formatMinutes(minutes: number) {
  if (minutes < 60) {
    return `${Math.round(minutes)} 分钟`;
  }

  const hours = minutes / 60;
  return `${Math.round(hours * 10) / 10} 小时`;
}

function needsExamTarget(item: UnifiedStudyItem) {
  return (
    item.remainingMinutes > 0 &&
    Boolean(item.course) &&
    (item.deadline !== EXAM_TARGET_DATE ||
      item.deadlineMode !== "manual" ||
      item.priority < EXAM_PRIORITY ||
      item.roadmapStatus !== "active" ||
      item.scheduleMode !== "scheduled")
  );
}

function buildAdjustmentSummary(adjustments: ExamFocusAdjustment[]) {
  return adjustments
    .map((adjustment) => {
      const activationText = adjustment.willActivate ? "，设为主线执行" : "";
      return `- ${adjustment.title}: ${formatDateShort(
        adjustment.fromDeadline,
      )} -> ${formatDateShort(adjustment.toDeadline)}，priority ${adjustment.fromPriority} -> ${adjustment.toPriority}，锁定期末目标${activationText}`;
    })
    .join("\n");
}

export function ExamFocusPanel({ items, snapshot }: ExamFocusPanelProps) {
  const { updateCourse } = useCourseContext();
  const [applyMessage, setApplyMessage] = useState<string | null>(null);
  const todayKey = getDateKey();
  const targetDaysLeft = differenceInCalendarDays(EXAM_TARGET_DATE, todayKey);
  const examWindowDaysLeft = differenceInCalendarDays(EXAM_WINDOW_START, todayKey);
  const subjectSummaries = useMemo(
    () =>
      examSubjects.map((subject) => {
        const subjectItems = items.filter((item) => isExamCourse(item, subject));
        const progress = getSubjectProgress(subjectItems);
        const projectedFinishDate = getLatestProjectedFinish(subjectItems, snapshot);
        const weeklyTasks = getWeeklyFocusTasks(subjectItems, snapshot);
        const weeklyMinutes = weeklyTasks.reduce((total, task) => total + task.minutes, 0);

        return {
          subject,
          items: subjectItems,
          progress,
          projectedFinishDate,
          projectedFinishLabel: getProjectedFinishLabel(subjectItems, snapshot),
          tone: getStatusTone(subjectItems, projectedFinishDate),
          weeklyTasks,
          weeklyMinutes,
        };
      }),
    [items, snapshot],
  );
  const adjustments = useMemo(
    () =>
      subjectSummaries
        .flatMap(({ items: subjectItems }) => subjectItems)
        .filter(needsExamTarget)
        .map((item) => ({
          id: item.id,
          title: item.title,
          fromDeadline: item.deadline,
          toDeadline: EXAM_TARGET_DATE,
          fromPriority: item.priority,
          toPriority: EXAM_PRIORITY,
          willActivate: item.roadmapStatus !== "active" || item.scheduleMode !== "scheduled",
          item,
        })),
    [subjectSummaries],
  );

  function handleApplyExamFocus() {
    if (adjustments.length === 0) {
      setApplyMessage("当前匹配到的期末课程已经使用期末目标，无需调整。");
      return;
    }

    const summary = buildAdjustmentSummary(adjustments);
    const confirmed = window.confirm(
      [
        `将把 ${adjustments.length} 门未完成的期末相关课程应用为现有排课目标：`,
        "",
        summary,
        "",
        "这只会修改课程的目标日、优先级和主线状态，不会改 lecture 进度、学习记录或笔记。确认应用？",
      ].join("\n"),
    );

    if (!confirmed) {
      return;
    }

    adjustments.forEach(({ item }) => {
      const course = item.course;
      if (!course) {
        return;
      }

      updateCourse(course.id, {
        ...makeCourseInputFromCourse(course),
        deadline: EXAM_TARGET_DATE,
        priority: EXAM_PRIORITY,
        roadmapStatus: "active",
        scheduleMode: "scheduled",
        deadlineMode: "manual",
      });
    });

    setApplyMessage(`已应用 ${adjustments.length} 门课程的期末目标。系统会用现有排课器重新计算计划。`);
  }

  return (
    <section className="panel overflow-hidden">
      <div className="flex flex-col gap-4 border-b border-slate-200/80 px-6 py-5 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="eyebrow">Exam Focus</p>
          <h2 className="section-title mt-2">期末前课程覆盖</h2>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
            按现有 Roadmap 课程、deadline 和长期计划估算高数、线代、大学物理能否在第一轮目标日前上完。应用期末目标只会写入现有课程字段，不增加新的排课规则。
          </p>
        </div>
        <div className="flex flex-col gap-3 lg:items-end">
          <div className="flex flex-wrap gap-2 text-xs text-slate-500 lg:justify-end">
            <span className="rounded-full bg-slate-50 px-3 py-1 ring-1 ring-slate-200">
              第一轮目标 {formatDateShort(EXAM_TARGET_DATE)}
              {targetDaysLeft >= 0 ? ` · 还剩 ${targetDaysLeft} 天` : ` · 已过 ${Math.abs(targetDaysLeft)} 天`}
            </span>
            <span className="rounded-full bg-slate-50 px-3 py-1 ring-1 ring-slate-200">
              考试周 {formatDateShort(EXAM_WINDOW_START)} - {formatDateShort(EXAM_WINDOW_END)}
              {examWindowDaysLeft >= 0
                ? ` · 还剩 ${examWindowDaysLeft} 天`
                : ` · 已开始`}
            </span>
          </div>
          <button
            type="button"
            onClick={handleApplyExamFocus}
            className="rounded-full bg-slate-950 px-4 py-2 text-sm font-medium text-white transition hover:bg-slate-800"
          >
            应用期末目标
          </button>
        </div>
      </div>

      {applyMessage ? (
        <div className="mx-6 mt-5 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
          {applyMessage}
        </div>
      ) : null}

      <div className="grid gap-4 px-6 py-6 xl:grid-cols-3">
        {subjectSummaries.map(
          ({
            subject,
            items: subjectItems,
            progress,
            projectedFinishLabel,
            tone,
            weeklyTasks,
            weeklyMinutes,
          }) => (
            <article
              key={subject.id}
              className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm"
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h3 className="text-xl font-semibold text-slate-950">{subject.label}</h3>
                  <p className="mt-1 text-xs text-slate-500">{subject.aliases}</p>
                </div>
                <span className={`rounded-full border px-3 py-1 text-xs font-semibold ${tone.className}`}>
                  {tone.label}
                </span>
              </div>

              <div className="mt-5">
                <div className="flex items-center justify-between gap-3 text-xs text-slate-500">
                  <span>
                    {progress.completedUnits}/{progress.totalUnits || 0} units
                  </span>
                  <span className="font-medium text-slate-950">{progress.progressPct}%</span>
                </div>
                <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-100">
                  <div
                    className="h-full rounded-full bg-teal-500"
                    style={{ width: `${progress.progressPct}%` }}
                  />
                </div>
              </div>

              <div className="mt-4 grid gap-3 text-sm text-slate-600">
                <p>
                  预计上完：
                  <span className="font-medium text-slate-950">
                    {projectedFinishLabel ?? "未匹配"}
                  </span>
                </p>
                <p>
                  剩余量：
                  <span className="font-medium text-slate-950">
                    {formatMinutes(progress.remainingMinutes)}
                  </span>
                </p>
                <p>{tone.detail}</p>
              </div>

              <div className="mt-5 rounded-2xl bg-slate-50 px-4 py-4">
                <p className="text-xs font-medium uppercase tracking-[0.16em] text-slate-500">
                  本周排到
                </p>
                <p className="mt-2 text-sm text-slate-600">
                  {weeklyTasks.length} 个动作 / {formatMinutes(weeklyMinutes)}
                </p>
                <div className="mt-3 space-y-2">
                  {weeklyTasks.length === 0 ? (
                    <p className="text-sm text-slate-500">
                      本周暂未排到。若这里长期为空，优先检查课程 deadline、priority 或依赖是否锁住。
                    </p>
                  ) : (
                    weeklyTasks.slice(0, 3).map((task) => (
                      <div key={task.taskId} className="rounded-2xl bg-white px-3 py-3 text-sm">
                        <p className="font-medium text-slate-950">{task.title}</p>
                        <p className="mt-1 text-xs text-slate-500">
                          {task.label} · {formatDateShort(task.date)} · {task.minutes} 分钟
                        </p>
                      </div>
                    ))
                  )}
                </div>
              </div>

              <div className="mt-5 flex flex-wrap gap-2">
                {subjectItems.length === 0 ? (
                  <Link
                    to="/courses"
                    className="rounded-full border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 transition hover:text-slate-950"
                  >
                    去学习库匹配课程
                  </Link>
                ) : (
                  subjectItems.slice(0, 3).map((item) => (
                    <Link
                      key={item.id}
                      to={getUnifiedStudyItemPath(item)}
                      className="rounded-full border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 transition hover:text-slate-950"
                    >
                      {item.title}
                    </Link>
                  ))
                )}
              </div>
            </article>
          ),
        )}
      </div>
    </section>
  );
}
