import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Link } from "react-router-dom";
import { DeadlineOverflowPanel } from "../components/planner/DeadlineOverflowPanel";
import { PlannerSettingsPanel } from "../components/planner/PlannerSettingsPanel";
import { EmptyState } from "../components/ui/EmptyState";
import { useCourseContext } from "../context/CourseContext";
import { usePlannerSnapshot } from "../planner/usePlannerSnapshot";
import { formatHoursPerDay } from "../utils/courseMetrics";
import { learningItemToCourse } from "../utils/learningFactory";

export function InsightsPage() {
  const { courses, learningItems } = useCourseContext();
  const { snapshot } = usePlannerSnapshot();
  const allStudyCourses = [...courses, ...learningItems.map(learningItemToCourse)];

  if (allStudyCourses.length === 0) {
    return (
      <EmptyState
        title="还没有趋势数据"
        description="先在学习库加入课程、书籍或资料并开始记录进度，趋势页才会显示速度差、周负载和长期冷落提醒。"
        actionLabel="去学习库导入"
        actionTo="/courses"
      />
    );
  }

  const paceSeries = snapshot.priorityRanking
    .filter((entry) => entry.remainingUnits > 0)
    .slice(0, 6)
    .map((entry) => ({
      name: entry.courseName,
      真实速度: entry.recentDailyPace,
      "目标压力": entry.requiredDailyPace,
    }));

  const loadSeries = snapshot.weeklyPlan.days.map((day) => ({
    label: day.label,
    计划时长: day.totalMinutes,
    可用容量: day.capacityMinutes,
  }));

  const prioritySeries = snapshot.priorityRanking
    .filter((entry) => entry.remainingUnits > 0)
    .slice(0, 6)
    .map((entry) => ({
      name: entry.courseName,
      priority: entry.score,
    }));

  return (
    <div className="space-y-6">
      <section className="flex flex-col justify-between gap-5 lg:flex-row lg:items-end">
        <div>
          <p className="eyebrow">Insights</p>
          <h1 className="mt-2 text-4xl font-semibold tracking-tight text-slate-950">
            趋势与调度提醒
          </h1>
          <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-600">
            这一页统一观察课程、书籍、资料和练习的速度偏离、周负载、手动目标压力、预计完成节奏和排课设置。
          </p>
        </div>

        <div className="flex flex-wrap gap-3">
          <Link
            to="/today"
            className="rounded-full bg-slate-950 px-5 py-3 text-sm font-medium text-white transition hover:bg-slate-800"
          >
            去看今日任务
          </Link>
          <Link
            to="/weekly"
            className="rounded-full border border-slate-200 px-5 py-3 text-sm font-medium text-slate-700 transition hover:border-slate-300 hover:text-slate-950"
          >
            去周计划调整
          </Link>
        </div>
      </section>

      <section className="grid gap-6 xl:grid-cols-2">
        <section className="panel p-6">
          <div className="flex items-end justify-between gap-3">
            <div>
              <p className="eyebrow">Pace</p>
              <h2 className="section-title mt-2">近 7 天真实速度 vs 目标压力</h2>
            </div>
            <p className="text-sm text-slate-500">单位已统一成小时/天。系统目标日用于调度排序和节奏参考，不再作为自动排课的硬失败提醒。</p>
          </div>
          <div className="mt-6 h-80">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={paceSeries} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="name" tickLine={false} axisLine={false} />
                <YAxis tickLine={false} axisLine={false} unit="h" />
                <Tooltip formatter={(value) => [`${value} 小时/天`, ""]} />
                <Legend />
                <Bar dataKey="真实速度" fill="#0f766e" radius={[8, 8, 0, 0]} />
                <Bar dataKey="目标压力" fill="#0f172a" radius={[8, 8, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </section>

        <section className="panel p-6">
          <div className="flex items-end justify-between gap-3">
            <div>
              <p className="eyebrow">Load</p>
              <h2 className="section-title mt-2">本周负载热力</h2>
            </div>
            <p className="text-sm text-slate-500">高于容量的日期会更接近超载。</p>
          </div>
          <div className="mt-6 h-80">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={loadSeries} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="label" tickLine={false} axisLine={false} />
                <YAxis tickLine={false} axisLine={false} />
                <Tooltip />
                <Legend />
                <Bar dataKey="计划时长" fill="#0f172a" radius={[8, 8, 0, 0]} />
                <Bar dataKey="可用容量" fill="#cbd5e1" radius={[8, 8, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </section>
      </section>

      <section className="grid gap-6 xl:grid-cols-[0.95fr_1.05fr]">
        <section className="panel p-6">
          <div className="flex items-end justify-between gap-3">
            <div>
              <p className="eyebrow">Priority</p>
              <h2 className="section-title mt-2">当前 priority score 排名</h2>
            </div>
            <p className="text-sm text-slate-500">分数越高，越应该被排到前面。</p>
          </div>
          <div className="mt-6 h-80">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={prioritySeries}
                layout="vertical"
                margin={{ top: 10, right: 10, left: 10, bottom: 0 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" horizontal={false} />
                <XAxis type="number" tickLine={false} axisLine={false} />
                <YAxis
                  type="category"
                  dataKey="name"
                  width={120}
                  tickLine={false}
                  axisLine={false}
                />
                <Tooltip />
                <Bar dataKey="priority" fill="#0f172a" radius={[0, 8, 8, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </section>

        <div className="space-y-6">
          <section className="panel p-6">
            <p className="eyebrow">Neglected</p>
            <h2 className="section-title mt-2">长期被冷落学习项</h2>
            <div className="mt-6 space-y-4">
              {snapshot.neglectedCourses.length === 0 ? (
                <div className="rounded-[24px] border border-dashed border-slate-300 px-4 py-5 text-sm text-slate-500">
                  当前没有被连续冷落 3 天以上的学习项。
                </div>
              ) : (
                snapshot.neglectedCourses.map((entry) => (
                  <div key={entry.courseId} className="rounded-[24px] bg-slate-50/80 p-4">
                    <p className="font-semibold text-slate-950">{entry.courseName}</p>
                    <p className="mt-2 text-xs text-slate-500">
                      已连续 {entry.daysSinceLastStudy} 天没推进，本周安排 {entry.scheduledUnitsThisWeek} 个动作。
                    </p>
                  </div>
                ))
              )}
            </div>
          </section>

          <section className="panel p-6">
            <p className="eyebrow">Impossible</p>
            <h2 className="section-title mt-2">手动目标压力项</h2>
            <div className="mt-6 space-y-4">
              {snapshot.impossibleCourses.length === 0 ? (
                <div className="rounded-[24px] border border-dashed border-slate-300 px-4 py-5 text-sm text-slate-500">
                  目前没有手动锁定且明确不可完成的学习项。
                </div>
              ) : (
                snapshot.impossibleCourses.map((entry) => (
                  <div
                    key={entry.courseId}
                    className="rounded-[24px] border border-rose-200 bg-rose-50/80 p-4"
                  >
                    <p className="font-semibold text-slate-950">{entry.courseName}</p>
                    <p className="mt-2 text-xs text-slate-500">
                      目标压力 {formatHoursPerDay(entry.requiredDailyPace)}，最近只有 {formatHoursPerDay(entry.recentDailyPace)}。
                    </p>
                  </div>
                ))
              )}
            </div>
          </section>
        </div>
      </section>

      <DeadlineOverflowPanel courses={snapshot.deadlineOverflowCourses} />



      <PlannerSettingsPanel
        title="容量与排课偏好"
        description="长线主计划和最近两周周计划都会直接使用这里的设置。改完后，系统会按新的容量与偏好重新排课。"
      />
    </div>
  );
}
