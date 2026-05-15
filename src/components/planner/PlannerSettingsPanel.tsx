import { useCourseContext } from "../../context/CourseContext";
import { useState } from "react";

interface PlannerSettingsPanelProps {
  title?: string;
  description?: string;
}

function getSlotMinutes(totalMinutes: number, slotCount: number) {
  return Math.floor(totalMinutes / Math.max(1, slotCount));
}

export function PlannerSettingsPanel({
  title = "学习容量与排课模式",
  description = "正常上课模式会尽量填满每天 2 个 120 分钟重学习块、1 个 60 分钟轻学习块；轻课会在一个学习块内连续推进多个 unit，重学习和轻学习仍严格分池。",
}: PlannerSettingsPanelProps) {
  const { plannerSettings, updatePlannerSettings, recalibrateStudyDeadlines } = useCourseContext();
  const [deadlineMessage, setDeadlineMessage] = useState<string | null>(null);
  const weekdayHeavySlotMinutes = getSlotMinutes(
    plannerSettings.weekdayHeavyMinutes,
    plannerSettings.heavyCoursesPerDay,
  );
  const weekdayLightSlotMinutes = getSlotMinutes(
    plannerSettings.weekdayLightMinutes,
    plannerSettings.lightCoursesPerDay,
  );
  const weekendHeavySlotMinutes = getSlotMinutes(
    plannerSettings.weekendHeavyMinutes,
    plannerSettings.weekendHeavyCoursesPerDay,
  );
  const weekendLightSlotMinutes = getSlotMinutes(
    plannerSettings.weekendLightMinutes,
    plannerSettings.weekendLightCoursesPerDay,
  );

  return (
    <section className="panel p-6">
      <div className="flex flex-col gap-2">
        <p className="eyebrow">容量设置</p>
        <h2 className="section-title">{title}</h2>
        <p className="text-sm text-slate-600">{description}</p>
      </div>

      {deadlineMessage ? (
        <div className="mt-5 rounded-[24px] border border-emerald-200 bg-emerald-50/80 px-4 py-4 text-sm text-emerald-800">
          {deadlineMessage}
        </div>
      ) : null}

      <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <label className="space-y-2">
          <span className="text-xs font-medium uppercase tracking-[0.16em] text-slate-500">
            工作日重学习分钟
          </span>
          <input
            type="number"
            min={0}
            step={10}
            value={plannerSettings.weekdayHeavyMinutes}
            onChange={(event) =>
              updatePlannerSettings({ weekdayHeavyMinutes: Number(event.target.value) || 0 })
            }
            className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 outline-none transition focus:border-teal-500"
          />
          <p className="text-xs text-slate-500">
            默认 240 分钟，分成 {plannerSettings.heavyCoursesPerDay} 槽，约 {weekdayHeavySlotMinutes} 分钟/槽。
          </p>
        </label>

        <label className="space-y-2">
          <span className="text-xs font-medium uppercase tracking-[0.16em] text-slate-500">
            工作日轻学习分钟
          </span>
          <input
            type="number"
            min={0}
            step={10}
            value={plannerSettings.weekdayLightMinutes}
            onChange={(event) =>
              updatePlannerSettings({ weekdayLightMinutes: Number(event.target.value) || 0 })
            }
            className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 outline-none transition focus:border-teal-500"
          />
          <p className="text-xs text-slate-500">
            默认 60 分钟，分成 {plannerSettings.lightCoursesPerDay} 槽，约 {weekdayLightSlotMinutes} 分钟/槽。
          </p>
        </label>

        <label className="space-y-2">
          <span className="text-xs font-medium uppercase tracking-[0.16em] text-slate-500">
            工作日重学习槽
          </span>
          <input
            type="number"
            min={1}
            max={5}
            value={plannerSettings.heavyCoursesPerDay}
            onChange={(event) =>
              updatePlannerSettings({ heavyCoursesPerDay: Number(event.target.value) || 1 })
            }
            className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 outline-none transition focus:border-teal-500"
          />
          <p className="text-xs text-slate-500">默认 2 槽，对应两个 120 分钟重学习块。</p>
        </label>

        <label className="space-y-2">
          <span className="text-xs font-medium uppercase tracking-[0.16em] text-slate-500">
            工作日轻学习槽
          </span>
          <input
            type="number"
            min={1}
            max={5}
            value={plannerSettings.lightCoursesPerDay}
            onChange={(event) =>
              updatePlannerSettings({ lightCoursesPerDay: Number(event.target.value) || 1 })
            }
            className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 outline-none transition focus:border-teal-500"
          />
          <p className="text-xs text-slate-500">默认 1 槽，对应一个 60 分钟轻学习块。</p>
        </label>

        <label className="space-y-2">
          <span className="text-xs font-medium uppercase tracking-[0.16em] text-slate-500">
            周末重学习分钟
          </span>
          <input
            type="number"
            min={0}
            step={10}
            value={plannerSettings.weekendHeavyMinutes}
            onChange={(event) =>
              updatePlannerSettings({ weekendHeavyMinutes: Number(event.target.value) || 0 })
            }
            className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 outline-none transition focus:border-teal-500"
          />
          <p className="text-xs text-slate-500">
            默认 240 分钟，分成 {plannerSettings.weekendHeavyCoursesPerDay} 槽，约 {weekendHeavySlotMinutes} 分钟/槽。
          </p>
        </label>

        <label className="space-y-2">
          <span className="text-xs font-medium uppercase tracking-[0.16em] text-slate-500">
            周末轻学习分钟
          </span>
          <input
            type="number"
            min={0}
            step={10}
            value={plannerSettings.weekendLightMinutes}
            onChange={(event) =>
              updatePlannerSettings({ weekendLightMinutes: Number(event.target.value) || 0 })
            }
            className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 outline-none transition focus:border-teal-500"
          />
          <p className="text-xs text-slate-500">
            默认 60 分钟，分成 {plannerSettings.weekendLightCoursesPerDay} 槽，约 {weekendLightSlotMinutes} 分钟/槽。
          </p>
        </label>

        <label className="space-y-2">
          <span className="text-xs font-medium uppercase tracking-[0.16em] text-slate-500">
            周末重学习槽
          </span>
          <input
            type="number"
            min={1}
            max={5}
            value={plannerSettings.weekendHeavyCoursesPerDay}
            onChange={(event) =>
              updatePlannerSettings({ weekendHeavyCoursesPerDay: Number(event.target.value) || 1 })
            }
            className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 outline-none transition focus:border-teal-500"
          />
          <p className="text-xs text-slate-500">默认 2 槽，对应两个 120 分钟重学习块。</p>
        </label>

        <label className="space-y-2">
          <span className="text-xs font-medium uppercase tracking-[0.16em] text-slate-500">
            周末轻学习槽
          </span>
          <input
            type="number"
            min={1}
            max={5}
            value={plannerSettings.weekendLightCoursesPerDay}
            onChange={(event) =>
              updatePlannerSettings({ weekendLightCoursesPerDay: Number(event.target.value) || 1 })
            }
            className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 outline-none transition focus:border-teal-500"
          />
          <p className="text-xs text-slate-500">默认 1 槽，适合轻量复盘或观看。</p>
        </label>

        <label className="space-y-2 xl:col-span-2">
          <span className="text-xs font-medium uppercase tracking-[0.16em] text-slate-500">
            排课节奏
          </span>
          <select
            value={plannerSettings.scheduleFillMode}
            onChange={(event) =>
              updatePlannerSettings({
                scheduleFillMode: event.target.value === "deadline" ? "deadline" : "school",
              })
            }
            className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 outline-none transition focus:border-teal-500"
          >
            <option value="school">正常上课模式：尽量填满每日槽位</option>
            <option value="deadline">Deadline 摊平模式：远期内容先保守推进</option>
          </select>
          <p className="text-xs text-slate-500">
            当前：
            {plannerSettings.scheduleFillMode === "school"
              ? "远期任务不会被完全 holdback，只会在排序上靠后。"
              : "远期任务会更保守，适合临时减压。"}
          </p>
        </label>

        <label className="space-y-2">
          <span className="text-xs font-medium uppercase tracking-[0.16em] text-slate-500">
            安全余量提示
          </span>
          <input
            type="range"
            min={0.5}
            max={1}
            step={0.05}
            value={plannerSettings.bufferRatio}
            onChange={(event) =>
              updatePlannerSettings({ bufferRatio: Number(event.target.value) || 0.8 })
            }
            className="w-full accent-slate-950"
          />
          <p className="text-sm text-slate-600">
            {Math.round(plannerSettings.bufferRatio * 100)}% · 仅用于风险提示，不压缩重/轻学习的真实容量。
          </p>
        </label>

        <label className="flex items-center justify-between rounded-[24px] border border-slate-200 bg-slate-50 px-4 py-4">
          <div>
            <p className="text-xs font-medium uppercase tracking-[0.16em] text-slate-500">
              高风险优先
            </p>
            <p className="mt-2 text-sm text-slate-600">
              打开后，高风险学习项只会在同跑道里提权，不会抢另一条跑道的容量。
            </p>
          </div>
          <button
            type="button"
            onClick={() =>
              updatePlannerSettings({
                prioritizeHighRisk: !plannerSettings.prioritizeHighRisk,
              })
            }
            className={`rounded-full px-4 py-2 text-sm font-medium transition ${
              plannerSettings.prioritizeHighRisk
                ? "bg-slate-950 text-white"
                : "bg-white text-slate-600 ring-1 ring-slate-200"
            }`}
          >
            {plannerSettings.prioritizeHighRisk ? "已开启" : "已关闭"}
          </button>
        </label>

        <div className="rounded-[24px] border border-teal-100 bg-teal-50/70 px-4 py-4 xl:col-span-2">
          <p className="text-xs font-medium uppercase tracking-[0.16em] text-teal-700">
            系统目标校准
          </p>
          <p className="mt-2 text-sm leading-6 text-teal-800">
            按当前重/轻容量、剩余进度和 Roadmap 顺序，重新生成自动模式下 scheduled 学习项的系统目标日。Reference 资料和手动锁定目标日不会被覆盖。
          </p>
          <button
            type="button"
            onClick={() => {
              const changedCount = recalibrateStudyDeadlines();
              setDeadlineMessage(
                changedCount > 0
                  ? `已按当前容量重算 ${changedCount} 个学习项的系统目标日。`
                  : "当前系统目标日已经和容量倒推结果一致，无需调整。",
              );
            }}
            className="mt-4 rounded-full bg-slate-950 px-4 py-2 text-sm font-medium text-white transition hover:bg-slate-800"
          >
            按当前容量重算系统目标
          </button>
        </div>
      </div>
    </section>
  );
}
