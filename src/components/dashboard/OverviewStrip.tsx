import { DashboardSummary, PlannerSnapshot } from "../../types";
import { formatHours, minutesToHours } from "../../utils/courseMetrics";
import { formatDateLong } from "../../utils/date";

interface OverviewStripProps {
  summary: DashboardSummary;
  snapshot: PlannerSnapshot;
}

export function OverviewStrip({ summary, snapshot }: OverviewStripProps) {
  const topHardDeadlinePressure = snapshot.impossibleCourses[0];
  const projectedFinishLabel = snapshot.roadmapProjectedFinishDate
    ? formatDateLong(snapshot.roadmapProjectedFinishDate)
    : "暂无";
  const projectedFinishDetail =
    snapshot.unfinishedUnscheduledItemIds.length > 0
      ? `还有 ${snapshot.unfinishedUnscheduledItemIds.length} 项暂时无法推算完成，请看下方长线 Roadmap 明细`
      : topHardDeadlinePressure
        ? `${topHardDeadlinePressure.courseName} 的硬目标日需要调整`
        : "按当前容量和 Roadmap，已能推算全部非每周固定项";

  const items = [
    {
      label: "总体完成",
      value: `${summary.overallCompletionRate}%`,
      detail: `${summary.unitsCompleted}/${summary.totalUnits} 节已完成 · 约 ${formatHours(minutesToHours(summary.estimatedMinutesCompleted))} / ${formatHours(minutesToHours(summary.totalEstimatedMinutes))}`,
    },
    {
      label: "今日负载",
      value: `重 ${snapshot.capacitySummary.todayHeavyMinutes}/${snapshot.capacitySummary.todayHeavyCapacity} · 轻 ${snapshot.capacitySummary.todayLightMinutes}/${snapshot.capacitySummary.todayLightCapacity}`,
      detail: snapshot.todayPlan.withinCapacity
        ? `今天安排了 ${snapshot.todayPlan.scheduledCourses} 个学习动作，仍在容量内`
        : `今天超载 ${snapshot.todayPlan.overloadMinutes} 分钟，需要减压或重排`,
    },
    {
      label: "本周负载",
      value: `重 ${snapshot.capacitySummary.weeklyHeavyMinutes}/${snapshot.capacitySummary.weeklyHeavyCapacity} · 轻 ${snapshot.capacitySummary.weeklyLightMinutes}/${snapshot.capacitySummary.weeklyLightCapacity}`,
      detail:
        snapshot.capacitySummary.overloadedDays > 0
          ? `${snapshot.capacitySummary.overloadedDays} 天偏重，建议检查周计划`
          : `${snapshot.capacitySummary.underloadedDays} 天偏轻，可作为缓冲`,
    },
    {
      label: "预计全部上完",
      value: projectedFinishLabel,
      detail: projectedFinishDetail,
    },
  ];

  return (
    <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
      {items.map((item) => (
        <div key={item.label} className="panel p-5">
          <p className="text-sm text-slate-500">{item.label}</p>
          <p className="mt-3 text-3xl font-semibold tracking-tight text-slate-950">
            {item.value}
          </p>
          <p className="mt-2 text-sm text-slate-600">{item.detail}</p>
        </div>
      ))}
    </section>
  );
}
