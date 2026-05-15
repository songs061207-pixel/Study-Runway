import { Link } from "react-router-dom";
import { useState } from "react";
import { WeeklyPlanBoard } from "../components/planner/WeeklyPlanBoard";
import { EmptyState } from "../components/ui/EmptyState";
import { useCourseContext } from "../context/CourseContext";
import { usePlannerSnapshot } from "../planner/usePlannerSnapshot";
import { PlannerWeekMode } from "../types";

export function WeeklyPlanPage() {
  const { courses, learningItems, setDayAdjustment, resetPlanAdjustments, touchReplan } = useCourseContext();
  const { snapshot } = usePlannerSnapshot();
  const [weekView, setWeekView] = useState<PlannerWeekMode>("current");

  if (courses.length === 0 && learningItems.length === 0) {
    return (
      <EmptyState
        title="还没有周计划"
        description="先在学习库添加课程、书籍、资料或 Roadmap 学习项，系统才能按依赖、进度、系统目标和容量生成学习动作表。"
        actionLabel="去学习库导入"
        actionTo="/courses"
      />
    );
  }

  return (
    <div className="space-y-6">
      <section className="flex flex-col justify-between gap-5 lg:flex-row lg:items-end">
        <div>
          <p className="eyebrow">Weekly Planner</p>
          <h1 className="mt-2 text-4xl font-semibold tracking-tight text-slate-950">
            周计划 / Roadmap 学习动作表
          </h1>
          <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-600">
            这里只看最近两周真正要执行的学习动作。长线主计划、预计完成节奏和排课设置都在总览与趋势页。
          </p>
        </div>

        <div className="flex flex-wrap gap-3">
          <Link
            to="/insights"
            className="rounded-full bg-slate-950 px-5 py-3 text-sm font-medium text-white transition hover:bg-slate-800"
          >
            查看趋势与规划
          </Link>
          <Link
            to="/today"
            className="rounded-full border border-slate-200 px-5 py-3 text-sm font-medium text-slate-700 transition hover:border-slate-300 hover:text-slate-950"
          >
            返回今日学习动作
          </Link>
        </div>
      </section>

      <WeeklyPlanBoard
        currentPlan={snapshot.weeklyPlan}
        nextPlan={snapshot.nextWeekPlan}
        view={weekView}
        onViewChange={setWeekView}
        onAdjustDay={setDayAdjustment}
        onResetAdjustments={resetPlanAdjustments}
        onRegenerate={touchReplan}
        title="周计划 / Roadmap 学习动作表"
        description="这里只保留最近两周的执行安排，方便你调整每日容量、挪动学习动作和重新排课。"
      />
    </div>
  );
}
