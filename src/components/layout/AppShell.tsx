import { NavLink, Outlet } from "react-router-dom";
import { useCourseContext } from "../../context/CourseContext";
import {
  calculateDashboardSummary,
  formatHours,
  minutesToHours,
} from "../../utils/courseMetrics";
import { isWeekendDate } from "../../utils/date";
import { learningItemToCourse } from "../../utils/learningFactory";
import { isRoadmapActiveScheduled } from "../../utils/roadmapMetadata";

const navItems = [
  { to: "/dashboard", label: "总览" },
  { to: "/today", label: "今日任务" },
  { to: "/goals", label: "目标" },
  { to: "/roadmap", label: "Roadmap" },
  { to: "/weekly", label: "周计划" },
  { to: "/courses", label: "学习库" },
  { to: "/insights", label: "趋势与调度" },
];

export function AppShell() {
  const { courses, learningItems, plannerSettings, lastReplanAt } = useCourseContext();
  const allStudyCourses = [...courses, ...learningItems.map(learningItemToCourse)];
  const activeStudyCourses = allStudyCourses.filter(isRoadmapActiveScheduled);
  const summary = calculateDashboardSummary(activeStudyCourses);
  const isWeekend = isWeekendDate(new Date());
  const todayHeavyCapacity = isWeekend
    ? plannerSettings.weekendHeavyMinutes
    : plannerSettings.weekdayHeavyMinutes;
  const todayLightCapacity = isWeekend
    ? plannerSettings.weekendLightMinutes
    : plannerSettings.weekdayLightMinutes;

  const statItems = [
    {
      label: "进行中",
      value: `${summary.activeCourses} 项`,
    },
    {
      label: "关注项",
      value: `${summary.highRiskCourses} 项`,
    },
    {
      label: "剩余内容",
      value: `${summary.unitsRemaining} 个 unit`,
      detail: `约 ${formatHours(minutesToHours(summary.estimatedMinutesRemaining))}`,
    },
    {
      label: "今日容量",
      value: `重 ${todayHeavyCapacity} 分钟`,
      detail: `轻 ${todayLightCapacity} 分钟`,
    },
  ];

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-30 border-b border-white/70 bg-white/80 backdrop-blur">
        <div className="mx-auto flex max-w-7xl flex-col gap-4 px-4 py-4 sm:px-6 lg:px-8">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div className="space-y-2">
              <p className="eyebrow">Study Runway</p>
              <h1 className="text-2xl font-semibold tracking-tight text-slate-950">
                Roadmap 学习进度执行系统
              </h1>
              <p className="max-w-2xl text-sm text-slate-600">
                课程、书籍、资料、练习和项目会进入同一套 Roadmap。系统负责按容量、依赖和进度排任务，你只需要按顺序执行。
              </p>
              <p className="text-xs text-slate-500">
                {lastReplanAt
                  ? `最近一次重排：${new Intl.DateTimeFormat("zh-CN", {
                      month: "numeric",
                      day: "numeric",
                      hour: "2-digit",
                      minute: "2-digit",
                    }).format(new Date(lastReplanAt))}`
                  : "还没有触发重排。"}
              </p>
            </div>

            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {statItems.map((item) => (
                <div
                  key={item.label}
                  className="rounded-2xl border border-slate-200 bg-white px-4 py-3"
                >
                  <p className="text-xs text-slate-500">{item.label}</p>
                  <p className="mt-1 text-lg font-semibold text-slate-950">
                    {item.value}
                  </p>
                  {"detail" in item && item.detail ? (
                    <p className="mt-1 text-xs text-slate-500">{item.detail}</p>
                  ) : null}
                </div>
              ))}
            </div>
          </div>

          <nav className="flex flex-wrap gap-2">
            {navItems.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                className={({ isActive }) =>
                  `rounded-full px-4 py-2 text-sm font-medium transition ${
                    isActive
                      ? "bg-slate-950 text-white"
                      : "bg-slate-100 text-slate-600 hover:bg-slate-200 hover:text-slate-950"
                  }`
                }
              >
                {item.label}
              </NavLink>
            ))}
          </nav>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        <Outlet />
      </main>
    </div>
  );
}
