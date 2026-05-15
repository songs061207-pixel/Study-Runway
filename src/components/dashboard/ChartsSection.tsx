import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { CompletionSeriesItem, RiskSeriesItem } from "../../types";
import { EmptyState } from "../ui/EmptyState";

interface ChartsSectionProps {
  completionSeries: CompletionSeriesItem[];
  riskSeries: RiskSeriesItem[];
}

export function ChartsSection({
  completionSeries,
  riskSeries,
}: ChartsSectionProps) {
  if (riskSeries.length === 0) {
    return (
      <section className="panel p-6">
        <EmptyState
          title="还没有可分析的数据"
          description="当你导入学习项并开始记录进度后，这里会自动出现趋势图和风险图。"
          actionLabel="去学习库导入"
          actionTo="/courses"
        />
      </section>
    );
  }

  return (
    <section className="grid gap-6 xl:grid-cols-2">
      <div className="panel p-6">
        <div className="flex items-end justify-between gap-3">
          <div>
            <p className="eyebrow">Trend</p>
            <h2 className="section-title mt-2">最近 14 天完成情况</h2>
          </div>
          <p className="text-sm text-slate-500">快速判断最近有没有掉速。</p>
        </div>

        <div className="mt-6 h-72">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart
              data={completionSeries}
              margin={{ top: 10, right: 10, left: -20, bottom: 0 }}
            >
              <defs>
                <linearGradient id="completionFillV2" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#0f766e" stopOpacity={0.35} />
                  <stop offset="100%" stopColor="#0f766e" stopOpacity={0.02} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis dataKey="label" tickLine={false} axisLine={false} />
              <YAxis allowDecimals={false} tickLine={false} axisLine={false} />
              <Tooltip
                formatter={(value) => [`${value} 节`, "完成量"]}
                labelFormatter={(label) => `日期 ${label}`}
              />
              <Area
                type="monotone"
                dataKey="completed"
                stroke="#0f766e"
                strokeWidth={3}
                fill="url(#completionFillV2)"
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="panel p-6">
        <div className="flex items-end justify-between gap-3">
          <div>
            <p className="eyebrow">Risk</p>
            <h2 className="section-title mt-2">课程风险概览</h2>
          </div>
          <p className="text-sm text-slate-500">分数越高，越需要优先处理。</p>
        </div>

        <div className="mt-6 h-72">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={riskSeries}
              layout="vertical"
              margin={{ top: 10, right: 10, left: 20, bottom: 0 }}
            >
              <CartesianGrid
                strokeDasharray="3 3"
                stroke="#e2e8f0"
                horizontal={false}
              />
              <XAxis
                type="number"
                domain={[0, 100]}
                tickLine={false}
                axisLine={false}
              />
              <YAxis
                type="category"
                dataKey="name"
                width={110}
                tickLine={false}
                axisLine={false}
              />
              <Tooltip
                formatter={(value) => [`${value}`, "风险分"]}
                labelFormatter={(label) => `${label}`}
              />
              <Bar dataKey="riskScore" barSize={18} radius={[0, 10, 10, 0]}>
                {riskSeries.map((entry) => (
                  <Cell key={entry.courseId} fill={entry.color} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    </section>
  );
}
