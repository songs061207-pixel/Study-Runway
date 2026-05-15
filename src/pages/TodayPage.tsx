import { Link } from "react-router-dom";
import { TodayPlanPanel } from "../components/dashboard/TodayPlanPanel";
import { EmptyState } from "../components/ui/EmptyState";
import { useCourseContext } from "../context/CourseContext";
import { usePlannerSnapshot } from "../planner/usePlannerSnapshot";

export function TodayPage() {
  const { courses, learningItems } = useCourseContext();
  const { snapshot } = usePlannerSnapshot();

  if (courses.length === 0 && learningItems.length === 0) {
    return (
      <EmptyState
        title="今日学习动作还没生成"
        description="先在学习库添加课程、书籍、资料或 Roadmap 学习项后，系统才能基于依赖、难度、进度和容量生成今日执行计划。"
        actionLabel="去学习库导入"
        actionTo="/courses"
      />
    );
  }

  return (
    <div className="space-y-6">
      <section className="flex flex-col justify-between gap-5 lg:flex-row lg:items-end">
        <div>
          <p className="eyebrow">Today</p>
          <h1 className="mt-2 text-4xl font-semibold tracking-tight text-slate-950">
            今日学习动作页
          </h1>
          <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-600">
            这里只保留今天真正要执行的内容。系统会在重学习槽和轻学习槽里混排课程、阅读、练习和项目；记录今日学习动作只增加进度，不会自动勾完成。
          </p>
        </div>

        <div className="flex flex-wrap gap-3">
          <Link
            to="/weekly"
            className="rounded-full bg-slate-950 px-5 py-3 text-sm font-medium text-white transition hover:bg-slate-800"
          >
            打开周计划
          </Link>
          <Link
            to="/dashboard"
            className="rounded-full border border-slate-200 px-5 py-3 text-sm font-medium text-slate-700 transition hover:border-slate-300 hover:text-slate-950"
          >
            返回总览
          </Link>
        </div>
      </section>

      <TodayPlanPanel
        snapshot={snapshot}
        title="今日学习动作"
        description="每个动作都只显示今天应推进的 unit。勾选完成需要你手动确认；如果想继续超额学习，请进入课程详情或学习项详情手动补记新增分钟。"
      />

      <section className="panel p-6">
        <p className="eyebrow">Execution Note</p>
        <h2 className="section-title mt-2">执行说明</h2>
        <div className="mt-6 space-y-4 text-sm leading-6 text-slate-600">
          <p>1. 先记录今天实际学掉的时间，再决定下面显示的这个 unit 是否真的学完；这里填的分钟数可以小于或大于计划值。</p>
          <p>2. 如果某个任务做不完，直接点“跳过并重排”，不要拖到明天再想。</p>
          <p>3. unit 完成勾选会停留在当前这一项，不会在你勾完后自动切到下一项。</p>
          <p>4. 如果今天负载超了，优先去周计划页调整明后天，再回来执行。</p>
        </div>
      </section>
    </div>
  );
}
