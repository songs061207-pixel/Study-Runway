import { ReplanImpact } from "../../types";
import { formatHoursPerDay } from "../../utils/courseMetrics";

interface ReplanImpactPanelProps {
  impact: ReplanImpact | null;
  title?: string;
}

const levelLabels = {
  low: "低风险",
  medium: "中风险",
  high: "高风险",
  overdue: "已延期",
  completed: "已完成",
} as const;

export function ReplanImpactPanel({
  impact,
  title = "跳过后的重排影响",
}: ReplanImpactPanelProps) {
  if (!impact) {
    return null;
  }

  return (
    <section className="rounded-[28px] border border-rose-200 bg-rose-50/80 p-5">
      <div className="flex flex-col gap-2">
        <p className="eyebrow text-rose-600">Replan</p>
        <h3 className="text-xl font-semibold text-slate-950">{title}</h3>
        <p className="text-sm text-slate-700">{impact.summary}</p>
      </div>

      <div className="mt-5 grid gap-4 lg:grid-cols-[0.95fr_1.05fr]">
        <div className="rounded-2xl bg-white/70 p-4">
          <p className="text-xs font-medium uppercase tracking-[0.16em] text-slate-500">
            明天压力增加
          </p>
          <p className="mt-2 text-3xl font-semibold text-slate-950">
            +{formatHoursPerDay(impact.tomorrowRequiredDelta)}
          </p>
          <p className="mt-2 text-sm text-slate-600">
            {impact.skippedCourseName} 的所需日均会抬升，后面几天的计划也会更紧。
          </p>
        </div>

        <div className="grid gap-3 md:grid-cols-2">
          <div className="rounded-2xl bg-white/70 p-4">
            <p className="text-xs font-medium uppercase tracking-[0.16em] text-slate-500">
              风险上升课程
            </p>
            <div className="mt-3 space-y-2 text-sm text-slate-700">
              {impact.riskChanges.length === 0 ? (
                <p>没有课程升级风险等级，但优先级仍会重新排序。</p>
              ) : (
                impact.riskChanges.map((change) => (
                  <div key={change.courseId} className="rounded-2xl bg-slate-50 px-3 py-3">
                    <p className="font-medium text-slate-950">{change.courseName}</p>
                    <p className="mt-1">
                      {levelLabels[change.beforeLevel]} → {levelLabels[change.afterLevel]}，优先级分数 +{change.delta}
                    </p>
                  </div>
                ))
              )}
            </div>
          </div>

          <div className="rounded-2xl bg-white/70 p-4">
            <p className="text-xs font-medium uppercase tracking-[0.16em] text-slate-500">
              更重的日期
            </p>
            <div className="mt-3 space-y-2 text-sm text-slate-700">
              {impact.heavierDays.length === 0 ? (
                <p>后续几天都会略微收紧，但没有单日明显抬升。</p>
              ) : (
                impact.heavierDays.map((day) => (
                  <div key={day.date} className="rounded-2xl bg-slate-50 px-3 py-3">
                    <p className="font-medium text-slate-950">{day.label}</p>
                    <p className="mt-1">
                      {day.beforeMinutes} → {day.afterMinutes} 分钟，增加 {day.deltaMinutes} 分钟
                    </p>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
