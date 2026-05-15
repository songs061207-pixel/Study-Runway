import { Course } from "../../types";
import { formatDateLong } from "../../utils/date";
import {
  calculateCourseMetrics,
  RISK_THEME,
  sortCoursesByRisk,
} from "../../utils/courseMetrics";
import { RiskBadge } from "../ui/RiskBadge";

interface RiskBoardProps {
  courses: Course[];
  title?: string;
  description?: string;
  limit?: number;
}

export function RiskBoard({
  courses,
  title = "风险提醒",
  description = "先看最危险的，再决定今天的顺序。",
  limit = 4,
}: RiskBoardProps) {
  const riskItems = sortCoursesByRisk(courses)
    .filter(({ metrics }) => metrics.remainingUnits > 0)
    .slice(0, limit);

  return (
    <section className="panel p-6">
      <div className="flex items-end justify-between gap-3">
        <div>
          <p className="eyebrow">Alerts</p>
          <h2 className="section-title mt-2">{title}</h2>
        </div>
        <p className="text-sm text-slate-500">{description}</p>
      </div>

      <div className="mt-6 space-y-4">
        {riskItems.map(({ course }) => {
          const metrics = calculateCourseMetrics(course);
          let message = "当前节奏可控。";

          if (metrics.riskLevel === "overdue") {
            message = `已经超过手动目标日 ${Math.abs(metrics.daysLeft)} 天，还剩 ${metrics.remainingUnits} 节。`;
          } else if (course.deadlineMode === "manual" && metrics.daysLeft <= 7) {
            message = `手动目标日是 ${formatDateLong(course.deadline)}，还剩 ${metrics.remainingUnits} 节。`;
          } else if (metrics.recentDailyPace === 0) {
            message = "最近 7 天没有推进记录，系统会继续按 Roadmap 和容量排课。";
          } else {
            message = `系统目标是 ${formatDateLong(course.deadline)}，实际预计上完以总览和学习库为准。`;
          }

          return (
            <div
              key={course.id}
              className={`rounded-[24px] border p-4 ${RISK_THEME[metrics.riskLevel].panelClassName}`}
            >
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold">{course.name}</p>
                  <p className="mt-1 text-xs opacity-80">{course.provider}</p>
                </div>
                <RiskBadge level={metrics.riskLevel} />
              </div>
              <p className="mt-3 text-sm leading-6">{message}</p>
            </div>
          );
        })}
      </div>
    </section>
  );
}
