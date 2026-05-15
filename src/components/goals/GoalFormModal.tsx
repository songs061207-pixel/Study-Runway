import { FormEvent, useEffect, useMemo, useState } from "react";
import {
  GoalLevel,
  GoalStatus,
  RoadmapRoute,
  RoadmapYear,
  StudyGoal,
  StudyGoalInput,
} from "../../types";
import { addDays, getDateKey } from "../../utils/date";
import {
  GOAL_LEVELS,
  GOAL_STATUSES,
  getGoalChecklistText,
  goalLevelLabels,
  goalStatusLabels,
} from "../../utils/goalFactory";
import { ROADMAP_ROUTES, roadmapRouteLabels } from "../../utils/roadmapMetadata";
import { Modal } from "../ui/Modal";

export interface GoalStudyItemOption {
  id: string;
  title: string;
  detail: string;
}

interface GoalFormModalProps {
  open: boolean;
  goal?: StudyGoal | null;
  goals: StudyGoal[];
  studyItems: GoalStudyItemOption[];
  onClose: () => void;
  onSubmit: (input: StudyGoalInput) => void;
}

function getDefaultDateRange(level: GoalLevel) {
  const startDate = getDateKey(new Date());
  const dayCount = level === "quarter" ? 89 : level === "month" ? 29 : 6;
  return {
    startDate,
    endDate: getDateKey(addDays(new Date(), dayCount)),
  };
}

function getInitialForm(goal?: StudyGoal | null) {
  const defaultRange = getDefaultDateRange(goal?.level ?? "quarter");
  return {
    title: goal?.title ?? "",
    level: goal?.level ?? "quarter",
    parentGoalId: goal?.parentGoalId ?? "",
    startDate: goal?.startDate ?? defaultRange.startDate,
    endDate: goal?.endDate ?? defaultRange.endDate,
    status: goal?.status ?? "planned",
    roadmapRoute: goal?.roadmapRoute ?? "foundation",
    roadmapYear: goal?.roadmapYear ?? 1,
    roadmapPhase: goal?.roadmapPhase == null ? "" : String(goal.roadmapPhase),
    linkedItemIds: goal?.linkedItemIds ?? [],
    checklistText: goal ? getGoalChecklistText(goal) : "",
    outcome: goal?.outcome ?? "",
    order: goal?.order == null ? "" : String(goal.order),
  };
}

function canUseParent(candidate: StudyGoal, level: GoalLevel, currentGoalId?: string) {
  if (candidate.id === currentGoalId) {
    return false;
  }
  if (level === "quarter") {
    return false;
  }
  if (level === "month") {
    return candidate.level === "quarter";
  }
  return candidate.level === "quarter" || candidate.level === "month";
}

export function GoalFormModal({
  open,
  goal,
  goals,
  studyItems,
  onClose,
  onSubmit,
}: GoalFormModalProps) {
  const [form, setForm] = useState(getInitialForm(goal));
  const parentOptions = useMemo(
    () => goals.filter((candidate) => canUseParent(candidate, form.level, goal?.id)),
    [form.level, goal?.id, goals],
  );

  useEffect(() => {
    setForm(getInitialForm(goal));
  }, [goal, open]);

  function handleLevelChange(level: GoalLevel) {
    const defaultRange = getDefaultDateRange(level);
    setForm((current) => ({
      ...current,
      level,
      parentGoalId: canUseParent(
        goals.find((candidate) => candidate.id === current.parentGoalId) ?? ({} as StudyGoal),
        level,
        goal?.id,
      )
        ? current.parentGoalId
        : "",
      startDate: current.startDate || defaultRange.startDate,
      endDate: current.endDate || defaultRange.endDate,
    }));
  }

  function toggleLinkedItem(itemId: string) {
    setForm((current) => {
      const linkedItemIds = current.linkedItemIds.includes(itemId)
        ? current.linkedItemIds.filter((linkedItemId) => linkedItemId !== itemId)
        : [...current.linkedItemIds, itemId];

      return {
        ...current,
        linkedItemIds,
      };
    });
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    onSubmit({
      title: form.title,
      level: form.level,
      parentGoalId: form.parentGoalId || undefined,
      startDate: form.startDate,
      endDate: form.endDate,
      status: form.status,
      roadmapRoute: form.roadmapRoute,
      roadmapYear: form.roadmapYear,
      roadmapPhase: form.roadmapPhase === "" ? undefined : Number(form.roadmapPhase),
      linkedItemIds: form.linkedItemIds,
      checklistText: form.checklistText,
      outcome: form.outcome,
      order: form.order === "" ? undefined : Number(form.order),
    });
    onClose();
  }

  return (
    <Modal
      open={open}
      title={goal ? "编辑目标" : "新增目标"}
      description="目标只负责组织项目和学习项，不会直接进入每日排课。"
      onClose={onClose}
    >
      <form onSubmit={handleSubmit} className="space-y-5 px-6 py-6">
        <label className="block space-y-2">
          <span className="text-xs font-medium uppercase tracking-[0.16em] text-slate-500">
            标题
          </span>
          <input
            required
            value={form.title}
            onChange={(event) => setForm((current) => ({ ...current, title: event.target.value }))}
            className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none transition focus:border-teal-500"
            placeholder="例如：Spatial Interface 原型季"
          />
        </label>

        <div className="grid gap-4 md:grid-cols-3">
          <label className="space-y-2">
            <span className="text-xs font-medium uppercase tracking-[0.16em] text-slate-500">
              层级
            </span>
            <select
              value={form.level}
              onChange={(event) => handleLevelChange(event.target.value as GoalLevel)}
              className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none transition focus:border-teal-500"
            >
              {GOAL_LEVELS.map((level) => (
                <option key={level} value={level}>
                  {goalLevelLabels[level]}
                </option>
              ))}
            </select>
          </label>

          <label className="space-y-2">
            <span className="text-xs font-medium uppercase tracking-[0.16em] text-slate-500">
              状态
            </span>
            <select
              value={form.status}
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  status: event.target.value as GoalStatus,
                }))
              }
              className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none transition focus:border-teal-500"
            >
              {GOAL_STATUSES.map((status) => (
                <option key={status} value={status}>
                  {goalStatusLabels[status]}
                </option>
              ))}
            </select>
          </label>

          <label className="space-y-2">
            <span className="text-xs font-medium uppercase tracking-[0.16em] text-slate-500">
              父目标
            </span>
            <select
              value={form.parentGoalId}
              disabled={form.level === "quarter"}
              onChange={(event) =>
                setForm((current) => ({ ...current, parentGoalId: event.target.value }))
              }
              className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none transition focus:border-teal-500 disabled:bg-slate-50 disabled:text-slate-400"
            >
              <option value="">不绑定父目标</option>
              {parentOptions.map((parentGoal) => (
                <option key={parentGoal.id} value={parentGoal.id}>
                  {parentGoal.title}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="grid gap-4 md:grid-cols-4">
          <label className="space-y-2">
            <span className="text-xs font-medium uppercase tracking-[0.16em] text-slate-500">
              开始
            </span>
            <input
              type="date"
              value={form.startDate}
              onChange={(event) =>
                setForm((current) => ({ ...current, startDate: event.target.value }))
              }
              className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none transition focus:border-teal-500"
            />
          </label>
          <label className="space-y-2">
            <span className="text-xs font-medium uppercase tracking-[0.16em] text-slate-500">
              结束
            </span>
            <input
              type="date"
              value={form.endDate}
              onChange={(event) =>
                setForm((current) => ({ ...current, endDate: event.target.value }))
              }
              className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none transition focus:border-teal-500"
            />
          </label>
          <label className="space-y-2">
            <span className="text-xs font-medium uppercase tracking-[0.16em] text-slate-500">
              Route
            </span>
            <select
              value={form.roadmapRoute}
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  roadmapRoute: event.target.value as RoadmapRoute,
                }))
              }
              className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none transition focus:border-teal-500"
            >
              {ROADMAP_ROUTES.map((route) => (
                <option key={route} value={route}>
                  {roadmapRouteLabels[route]}
                </option>
              ))}
            </select>
          </label>
          <div className="grid grid-cols-2 gap-3">
            <label className="space-y-2">
              <span className="text-xs font-medium uppercase tracking-[0.16em] text-slate-500">
                Year
              </span>
              <select
                value={form.roadmapYear}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    roadmapYear: Number(event.target.value) as RoadmapYear,
                  }))
                }
                className="w-full rounded-2xl border border-slate-200 bg-white px-3 py-3 text-sm outline-none transition focus:border-teal-500"
              >
                {[1, 2, 3, 4].map((year) => (
                  <option key={year} value={year}>
                    {year}
                  </option>
                ))}
              </select>
            </label>
            <label className="space-y-2">
              <span className="text-xs font-medium uppercase tracking-[0.16em] text-slate-500">
                Phase
              </span>
              <input
                type="number"
                min={0}
                value={form.roadmapPhase}
                onChange={(event) =>
                  setForm((current) => ({ ...current, roadmapPhase: event.target.value }))
                }
                className="w-full rounded-2xl border border-slate-200 px-3 py-3 text-sm outline-none transition focus:border-teal-500"
              />
            </label>
          </div>
        </div>

        <label className="block space-y-2">
          <span className="text-xs font-medium uppercase tracking-[0.16em] text-slate-500">
            项目产出
          </span>
          <textarea
            value={form.outcome}
            onChange={(event) => setForm((current) => ({ ...current, outcome: event.target.value }))}
            rows={3}
            className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none transition focus:border-teal-500"
            placeholder="这个目标最后应该产出什么 demo、复盘或作品集材料？"
          />
        </label>

        <label className="block space-y-2">
          <span className="text-xs font-medium uppercase tracking-[0.16em] text-slate-500">
            验收清单
          </span>
          <textarea
            value={form.checklistText}
            onChange={(event) =>
              setForm((current) => ({ ...current, checklistText: event.target.value }))
            }
            rows={5}
            className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none transition focus:border-teal-500"
            placeholder={"每行一个验收项\n例如：完成最小可演示 demo"}
          />
        </label>

        <div className="space-y-3">
          <p className="text-xs font-medium uppercase tracking-[0.16em] text-slate-500">
            绑定学习项
          </p>
          <div className="max-h-64 space-y-2 overflow-y-auto rounded-2xl border border-slate-200 bg-slate-50/70 p-3">
            {studyItems.length === 0 ? (
              <p className="px-2 py-3 text-sm text-slate-500">学习库里还没有可绑定项目。</p>
            ) : (
              studyItems.map((item) => (
                <label
                  key={item.id}
                  className="flex items-start gap-3 rounded-2xl bg-white px-3 py-3 text-sm"
                >
                  <input
                    type="checkbox"
                    checked={form.linkedItemIds.includes(item.id)}
                    onChange={() => toggleLinkedItem(item.id)}
                    className="mt-1 h-4 w-4 rounded border-slate-300 text-teal-600 focus:ring-teal-500"
                  />
                  <span>
                    <span className="font-medium text-slate-950">{item.title}</span>
                    <span className="mt-1 block text-xs text-slate-500">{item.detail}</span>
                  </span>
                </label>
              ))
            )}
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-[1fr_auto] md:items-end">
          <label className="space-y-2">
            <span className="text-xs font-medium uppercase tracking-[0.16em] text-slate-500">
              排序
            </span>
            <input
              type="number"
              min={0}
              value={form.order}
              onChange={(event) => setForm((current) => ({ ...current, order: event.target.value }))}
              className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none transition focus:border-teal-500"
              placeholder="999"
            />
          </label>
          <button
            type="submit"
            className="rounded-full bg-slate-950 px-5 py-3 text-sm font-medium text-white transition hover:bg-slate-800"
          >
            保存目标
          </button>
        </div>
      </form>
    </Modal>
  );
}

