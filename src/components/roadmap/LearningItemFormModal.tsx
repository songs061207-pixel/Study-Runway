import { FormEvent, useEffect, useState } from "react";
import { useCourseContext } from "../../context/CourseContext";
import {
  LearningItem,
  LearningItemInput,
  LearningItemType,
  RoadmapRoute,
  RoadmapStatus,
  RoadmapYear,
  ScheduleCadence,
} from "../../types";
import { addDays, getDateKey } from "../../utils/date";
import { makeLearningItemInputFromItem } from "../../utils/learningFactory";
import {
  ROADMAP_ROUTES,
  ROADMAP_STATUSES,
  roadmapRouteLabels,
  roadmapStatusLabels,
} from "../../utils/roadmapMetadata";
import { MAX_STUDY_UNIT_MINUTES } from "../../utils/studyLimits";
import { Modal } from "../ui/Modal";

interface DependencyOption {
  id: string;
  title: string;
}

interface LearningItemFormModalProps {
  open: boolean;
  initialItem?: LearningItem | null;
  dependencyOptions: DependencyOption[];
  onClose: () => void;
}

const itemTypeLabels = {
  book: "书籍",
  paper: "论文",
  roadmap: "Roadmap",
  practice: "练习",
  project: "项目",
  course: "课程",
} satisfies Record<LearningItemType, string>;

function createEmptyInput(): LearningItemInput {
  return {
    title: "",
    type: "book",
    intensity: "heavy",
    deadline: getDateKey(addDays(new Date(), 30)),
    priority: 3,
    estimatedMinutes: 60,
    dependencyIds: [],
    softDependencyIds: [],
    roadmapId: "ai-ml-main",
    roadmapTrack: "general",
    roadmapPhase: 99,
    roadmapOrder: 999,
    roadmapRoute: "foundation",
    roadmapYear: 4,
    roadmapStatus: "backlog",
    scheduleMode: "scheduled",
    deadlineMode: "auto",
    scheduleCadence: "roadmap",
    weeklySpacingDays: 1,
    notes: "",
    sourceUrl: "",
    unitTitlesText: "第 1 章",
  };
}

function clampWeeklyTargetBlocks(value: number | undefined) {
  const normalizedValue = typeof value === "number" && Number.isFinite(value) ? value : 4;
  return Math.min(14, Math.max(1, Math.round(normalizedValue)));
}

function clampWeeklySpacingDays(value: number | undefined) {
  const normalizedValue = typeof value === "number" && Number.isFinite(value) ? value : 1;
  return Math.min(6, Math.max(0, Math.round(normalizedValue)));
}

function getScheduleModeForStatus(status: RoadmapStatus) {
  return status === "reference" || status === "archived" ? "reference" : "scheduled";
}

function getStatusForScheduleMode(mode: string, currentStatus?: RoadmapStatus) {
  if (mode === "reference") {
    return "reference";
  }

  return currentStatus === "reference" || currentStatus === "archived"
    ? "active"
    : currentStatus ?? "active";
}

function clampRoadmapYear(value: number | undefined): RoadmapYear {
  const normalizedValue = typeof value === "number" && Number.isFinite(value) ? value : 4;
  return Math.min(4, Math.max(1, Math.round(normalizedValue))) as RoadmapYear;
}

export function LearningItemFormModal({
  open,
  initialItem,
  dependencyOptions,
  onClose,
}: LearningItemFormModalProps) {
  const { addLearningItem, updateLearningItem } = useCourseContext();
  const [form, setForm] = useState<LearningItemInput>(createEmptyInput);

  useEffect(() => {
    if (!open) {
      return;
    }

    setForm(initialItem ? makeLearningItemInputFromItem(initialItem) : createEmptyInput());
  }, [initialItem, open]);

  function handleDependencyChange(field: "dependencyIds" | "softDependencyIds", values: string[]) {
    setForm((current) => ({
      ...current,
      [field]: values.filter((id) => id !== initialItem?.id),
    }));
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!form.title.trim() || !form.deadline) {
      return;
    }

    const payload: LearningItemInput = {
      ...form,
      priority: Math.min(5, Math.max(1, Number(form.priority) || 3)),
      estimatedMinutes: Math.max(1, Number(form.estimatedMinutes) || 60),
      roadmapPhase: Math.min(99, Math.max(0, Number(form.roadmapPhase) || 0)),
      roadmapOrder: Math.min(9999, Math.max(0, Number(form.roadmapOrder) || 0)),
      roadmapRoute: (form.roadmapRoute ?? "foundation") as RoadmapRoute,
      roadmapYear: clampRoadmapYear(Number(form.roadmapYear)),
      roadmapStatus: (form.roadmapStatus ?? "backlog") as RoadmapStatus,
      scheduleMode: getScheduleModeForStatus((form.roadmapStatus ?? "backlog") as RoadmapStatus),
      deadlineMode: "auto",
      scheduleCadence: form.scheduleCadence === "weekly" ? "weekly" : "roadmap",
      weeklyTargetBlocks:
        form.scheduleCadence === "weekly"
          ? clampWeeklyTargetBlocks(Number(form.weeklyTargetBlocks))
          : undefined,
      weeklySpacingDays:
        form.scheduleCadence === "weekly"
          ? clampWeeklySpacingDays(Number(form.weeklySpacingDays))
          : undefined,
    };

    if (initialItem) {
      updateLearningItem(initialItem.id, payload);
    } else {
      addLearningItem(payload);
    }

    onClose();
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={initialItem ? "编辑学习项" : "新增 Roadmap 学习项"}
      description="书籍、纸质资料、论文、练习和项目都可以进入 Roadmap。硬依赖会锁定排课，reference 资料只展示不排每日任务。"
    >
      <form className="space-y-6 px-6 py-6" onSubmit={handleSubmit}>
        <section className="grid gap-4 md:grid-cols-2">
          <label className="space-y-2">
            <span className="text-sm font-medium text-slate-700">标题</span>
            <input
              required
              value={form.title}
              onChange={(event) => setForm((current) => ({ ...current, title: event.target.value }))}
              className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 outline-none transition focus:border-teal-500"
              placeholder="例如：CSAPP 第 1-3 章"
            />
          </label>

          <label className="space-y-2">
            <span className="text-sm font-medium text-slate-700">类型</span>
            <select
              value={form.type}
              onChange={(event) =>
                setForm((current) => ({ ...current, type: event.target.value as LearningItemType }))
              }
              className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 outline-none transition focus:border-teal-500"
            >
              {(["book", "paper", "roadmap", "practice", "project"] as LearningItemType[]).map((type) => (
                <option key={type} value={type}>
                  {itemTypeLabels[type]}
                </option>
              ))}
            </select>
          </label>

          <label className="space-y-2">
            <span className="text-sm font-medium text-slate-700">强度</span>
            <select
              value={form.intensity}
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  intensity: event.target.value === "light" ? "light" : "heavy",
                }))
              }
              className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 outline-none transition focus:border-teal-500"
            >
              <option value="heavy">重学习项：高精力槽</option>
              <option value="light">轻学习项：低精力槽</option>
            </select>
          </label>

          <label className="space-y-2">
            <span className="text-sm font-medium text-slate-700">Roadmap 状态</span>
            <select
              value={form.roadmapStatus ?? "backlog"}
              onChange={(event) => {
                const roadmapStatus = event.target.value as RoadmapStatus;
                setForm((current) => ({
                  ...current,
                  roadmapStatus,
                  scheduleMode: getScheduleModeForStatus(roadmapStatus),
                }));
              }}
              className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 outline-none transition focus:border-teal-500"
            >
              {ROADMAP_STATUSES.map((status) => (
                <option key={status} value={status}>
                  {roadmapStatusLabels[status]}
                </option>
              ))}
            </select>
          </label>

          <label className="space-y-2">
            <span className="text-sm font-medium text-slate-700">排课模式</span>
            <select
              value={form.scheduleMode ?? "scheduled"}
              onChange={(event) => {
                const scheduleMode = event.target.value === "reference" ? "reference" : "scheduled";
                setForm((current) => ({
                  ...current,
                  scheduleMode,
                  roadmapStatus: getStatusForScheduleMode(scheduleMode, current.roadmapStatus),
                }));
              }}
              className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 outline-none transition focus:border-teal-500"
            >
              <option value="scheduled">允许排课</option>
              <option value="reference">仅作参考资料</option>
            </select>
          </label>

          <label className="space-y-2">
            <span className="text-sm font-medium text-slate-700">系统目标日（自动）</span>
            <input
              type="date"
              required
              value={form.deadline}
              disabled
              className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 outline-none transition focus:border-teal-500 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-500"
            />
            <p className="text-xs text-slate-500">
              系统会按当前容量、Roadmap 顺序和剩余 unit 工作量自动生成目标完成日。
            </p>
          </label>

          <label className="space-y-2">
            <span className="text-sm font-medium text-slate-700">优先级（1-5）</span>
            <input
              type="number"
              min={1}
              max={5}
              value={form.priority}
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  priority: Math.min(5, Math.max(1, Number(event.target.value) || 3)),
                }))
              }
              className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 outline-none transition focus:border-teal-500"
            />
          </label>

          <label className="space-y-2">
            <span className="text-sm font-medium text-slate-700">每个 Unit 预计分钟</span>
            <input
              type="number"
              min={1}
              max={MAX_STUDY_UNIT_MINUTES}
              value={form.estimatedMinutes}
              onChange={(event) =>
                setForm((current) => ({ ...current, estimatedMinutes: Number(event.target.value) || 60 }))
              }
              className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 outline-none transition focus:border-teal-500"
            />
          </label>

          <label className="space-y-2">
            <span className="text-sm font-medium text-slate-700">排课节奏</span>
            <select
              value={form.scheduleCadence ?? "roadmap"}
              onChange={(event) =>
                setForm((current) => {
                  const scheduleCadence =
                    event.target.value === "weekly" ? "weekly" : "roadmap";

                  return {
                    ...current,
                    scheduleCadence: scheduleCadence as ScheduleCadence,
                    weeklyTargetBlocks:
                      scheduleCadence === "weekly"
                        ? current.weeklyTargetBlocks ?? 4
                        : undefined,
                    weeklySpacingDays:
                      scheduleCadence === "weekly"
                        ? current.weeklySpacingDays ?? 1
                        : undefined,
                  };
                })
              }
              className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 outline-none transition focus:border-teal-500"
            >
              <option value="roadmap">按 Roadmap 推进</option>
              <option value="weekly">每周固定</option>
            </select>
            <p className="text-xs text-slate-500">
              每周固定适合算法题、复盘等长期训练，不归入一次性完成路线。
            </p>
          </label>

          {form.scheduleCadence === "weekly" ? (
            <>
              <label className="space-y-2">
                <span className="text-sm font-medium text-slate-700">每周学习块数</span>
                <input
                  type="number"
                  min={1}
                  max={14}
                  value={form.weeklyTargetBlocks ?? 4}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      weeklyTargetBlocks: clampWeeklyTargetBlocks(Number(event.target.value)),
                    }))
                  }
                  className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 outline-none transition focus:border-teal-500"
                />
                <p className="text-xs text-slate-500">
                  每块使用这个学习项的单个 unit 时长；算法题周训练当前固定为 120 分钟/块。
                </p>
              </label>

              <label className="space-y-2">
                <span className="text-sm font-medium text-slate-700">最小间隔天数</span>
                <input
                  type="number"
                  min={0}
                  max={6}
                  value={form.weeklySpacingDays ?? 1}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      weeklySpacingDays: clampWeeklySpacingDays(Number(event.target.value)),
                    }))
                  }
                  className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 outline-none transition focus:border-teal-500"
                />
                <p className="text-xs text-slate-500">
                  1 表示尽量隔一天排一次；如果本周容量不足，系统会压缩补排。
                </p>
              </label>
            </>
          ) : null}

          <label className="space-y-2">
            <span className="text-sm font-medium text-slate-700">Roadmap 阶段</span>
            <input
              type="number"
              min={0}
              max={99}
              value={form.roadmapPhase ?? 99}
              onChange={(event) =>
                setForm((current) => ({ ...current, roadmapPhase: Number(event.target.value) || 0 }))
              }
              className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 outline-none transition focus:border-teal-500"
            />
          </label>

          <label className="space-y-2">
            <span className="text-sm font-medium text-slate-700">阶段内顺序</span>
            <input
              type="number"
              min={0}
              value={form.roadmapOrder ?? 999}
              onChange={(event) =>
                setForm((current) => ({ ...current, roadmapOrder: Number(event.target.value) || 0 }))
              }
              className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 outline-none transition focus:border-teal-500"
            />
          </label>

          <label className="space-y-2">
            <span className="text-sm font-medium text-slate-700">Roadmap Track</span>
            <input
              value={form.roadmapTrack ?? "general"}
              onChange={(event) =>
                setForm((current) => ({ ...current, roadmapTrack: event.target.value }))
              }
              className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 outline-none transition focus:border-teal-500"
              placeholder="例如：algorithms / systems / ml-ai-core"
            />
          </label>

          <label className="space-y-2">
            <span className="text-sm font-medium text-slate-700">Roadmap Route</span>
            <select
              value={form.roadmapRoute ?? "foundation"}
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  roadmapRoute: event.target.value as RoadmapRoute,
                }))
              }
              className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 outline-none transition focus:border-teal-500"
            >
              {ROADMAP_ROUTES.map((route) => (
                <option key={route} value={route}>
                  {roadmapRouteLabels[route]}
                </option>
              ))}
            </select>
          </label>

          <label className="space-y-2">
            <span className="text-sm font-medium text-slate-700">Roadmap Year</span>
            <select
              value={form.roadmapYear ?? 4}
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  roadmapYear: clampRoadmapYear(Number(event.target.value)),
                }))
              }
              className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 outline-none transition focus:border-teal-500"
            >
              {[1, 2, 3, 4].map((year) => (
                <option key={year} value={year}>
                  大{year}
                </option>
              ))}
            </select>
          </label>

          <label className="space-y-2 md:col-span-2">
            <span className="text-sm font-medium text-slate-700">硬依赖 / 必须先完成</span>
            <select
              multiple
              value={form.dependencyIds}
              onChange={(event) =>
                handleDependencyChange(
                  "dependencyIds",
                  Array.from(event.target.selectedOptions).map((option) => option.value),
                )
              }
              className="min-h-28 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 outline-none transition focus:border-teal-500"
            >
              {dependencyOptions
                .filter((option) => option.id !== initialItem?.id)
                .map((option) => (
                  <option key={option.id} value={option.id}>
                    {option.title}
                  </option>
                ))}
            </select>
            <p className="text-xs text-slate-500">硬依赖未完成前，该学习项不会自动进入今日任务。</p>
          </label>

          <label className="space-y-2 md:col-span-2">
            <span className="text-sm font-medium text-slate-700">软依赖 / 推荐先学</span>
            <select
              multiple
              value={form.softDependencyIds ?? []}
              onChange={(event) =>
                handleDependencyChange(
                  "softDependencyIds",
                  Array.from(event.target.selectedOptions).map((option) => option.value),
                )
              }
              className="min-h-28 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 outline-none transition focus:border-teal-500"
            >
              {dependencyOptions
                .filter((option) => option.id !== initialItem?.id)
                .map((option) => (
                  <option key={option.id} value={option.id}>
                    {option.title}
                  </option>
                ))}
            </select>
            <p className="text-xs text-slate-500">软依赖只影响排序，不会锁死当前学习项。</p>
          </label>

          <label className="space-y-2 md:col-span-2">
            <span className="text-sm font-medium text-slate-700">链接 / 文件位置</span>
            <input
              value={form.sourceUrl ?? ""}
              onChange={(event) => setForm((current) => ({ ...current, sourceUrl: event.target.value }))}
              className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 outline-none transition focus:border-teal-500"
              placeholder="可填网页链接、书名、纸质资料位置或本地路径"
            />
          </label>
        </section>

        <label className="block space-y-2">
          <span className="text-sm font-medium text-slate-700">Unit / 章节 / 页段</span>
          <textarea
            rows={8}
            value={form.unitTitlesText}
            onChange={(event) => setForm((current) => ({ ...current, unitTitlesText: event.target.value }))}
            className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 outline-none transition focus:border-teal-500"
            placeholder={`每行一个，例如：\n第 1 章：计算机系统漫游\np.20-p.45\n论文 Section 2-3`}
          />
        </label>

        <label className="block space-y-2">
          <span className="text-sm font-medium text-slate-700">备注</span>
          <textarea
            rows={3}
            value={form.notes}
            onChange={(event) => setForm((current) => ({ ...current, notes: event.target.value }))}
            className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 outline-none transition focus:border-teal-500"
            placeholder="记录学习目标、验收方式或和课程的关系"
          />
        </label>

        <div className="flex flex-col-reverse gap-3 border-t border-slate-200 pt-6 sm:flex-row sm:justify-end">
          <button
            type="button"
            onClick={onClose}
            className="rounded-full border border-slate-200 px-5 py-3 text-sm font-medium text-slate-700 transition hover:border-slate-300 hover:text-slate-900"
          >
            取消
          </button>
          <button
            type="submit"
            className="rounded-full bg-slate-950 px-5 py-3 text-sm font-medium text-white transition hover:bg-slate-800"
          >
            {initialItem ? "保存修改" : "加入 Roadmap"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
