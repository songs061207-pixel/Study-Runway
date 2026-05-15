import { FormEvent, useEffect, useMemo, useState } from "react";
import { useCourseContext } from "../../context/CourseContext";
import {
  Course,
  CourseImportSource,
  CourseInput,
  RoadmapRoute,
  RoadmapStatus,
  RoadmapYear,
} from "../../types";
import { makeCourseInputFromCourse, parseLectureTitles } from "../../utils/courseFactory";
import { importCourseFromUrl } from "../../utils/courseImport";
import {
  ROADMAP_ROUTES,
  ROADMAP_STATUSES,
  roadmapRouteLabels,
  roadmapStatusLabels,
} from "../../utils/roadmapMetadata";
import { addDays, getDateKey } from "../../utils/date";
import { MAX_STUDY_UNIT_MINUTES } from "../../utils/studyLimits";
import { Modal } from "../ui/Modal";

function createEmptyForm(): CourseInput {
  return {
    name: "",
    provider: "",
    totalUnits: 12,
    lectureMinutes: 60,
    deadline: getDateKey(addDays(new Date(), 30)),
    color: "#0f766e",
    notes: "",
    difficulty: 3,
    intensity: "heavy",
    priority: 3,
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
    sourceUrl: "",
    lectureTitlesText: "",
  };
}

type ImportState = "idle" | "loading" | "success" | "warning" | "error";

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

interface CourseFormModalProps {
  open: boolean;
  initialCourse?: Course | null;
  onClose: () => void;
}

function getImportMessage(source: CourseImportSource) {
  switch (source) {
    case "direct":
      return "已从课程页面抓取信息，请校正后保存。";
    case "proxy":
      return "已通过代理抓取课程信息，请校正后保存。";
    case "preset":
      return "页面没有稳定抓到完整内容，已按校验模板预填，请检查后保存。";
    default:
      return "已生成课程预填结果，请校正后保存。";
  }
}

export function CourseFormModal({
  open,
  initialCourse,
  onClose,
}: CourseFormModalProps) {
  const { addCourse, updateCourse, courses, learningItems } = useCourseContext();
  const [form, setForm] = useState<CourseInput>(createEmptyForm());
  const [importUrl, setImportUrl] = useState("");
  const [importState, setImportState] = useState<ImportState>("idle");
  const [importMessage, setImportMessage] = useState("");
  const [importWarnings, setImportWarnings] = useState<string[]>([]);

  const dependencyOptions = useMemo(
    () => [
      ...courses
        .filter((course) => course.id !== initialCourse?.id)
        .map((course) => ({
          id: course.id,
          title: `${course.name} (课程)`,
        })),
      ...learningItems.map((item) => ({
        id: item.id,
        title: `${item.title} (${item.type})`,
      })),
    ],
    [courses, initialCourse?.id, learningItems],
  );

  useEffect(() => {
    if (!open) {
      return;
    }

    const nextForm = initialCourse ? makeCourseInputFromCourse(initialCourse) : createEmptyForm();
    setForm(nextForm);
    setImportUrl(initialCourse?.sourceUrl ?? "");
    setImportState("idle");
    setImportMessage("");
    setImportWarnings([]);
  }, [initialCourse, open]);

  const detectedLectureCount = parseLectureTitles(form.lectureTitlesText).length;

  function handleDependencyChange(field: "dependencyIds" | "softDependencyIds", values: string[]) {
    setForm((current) => ({
      ...current,
      [field]: values.filter((id) => id !== initialCourse?.id),
    }));
  }

  async function handleImport() {
    try {
      setImportState("loading");
      setImportMessage("正在抓取课程页面并生成预填结果...");
      setImportWarnings([]);

      const preview = await importCourseFromUrl(importUrl);

      setForm((current) => ({
        ...current,
        name: preview.name,
        provider: preview.provider,
        totalUnits: preview.totalUnits,
        lectureMinutes: preview.lectureMinutes ?? current.lectureMinutes,
        notes: preview.notes,
        sourceUrl: preview.normalizedUrl,
        color: preview.color,
        difficulty: preview.difficulty ?? current.difficulty,
        priority: preview.difficulty ?? current.priority,
        intensity: preview.intensity ?? current.intensity,
        roadmapTrack: preview.roadmapTrack ?? current.roadmapTrack,
        roadmapPhase: preview.roadmapPhase ?? current.roadmapPhase,
        roadmapOrder: preview.roadmapOrder ?? current.roadmapOrder,
        roadmapRoute: preview.roadmapRoute ?? current.roadmapRoute,
        roadmapYear: preview.roadmapYear ?? current.roadmapYear,
        roadmapStatus: preview.roadmapStatus ?? current.roadmapStatus,
        scheduleMode: preview.scheduleMode ?? current.scheduleMode,
        deadlineMode: "auto",
        lectureTitlesText: preview.lectureTitles.join("\n"),
      }));
      setImportWarnings(preview.warnings);
      setImportState(preview.source === "preset" ? "warning" : "success");
      setImportMessage(getImportMessage(preview.source));
    } catch (error) {
      setImportState("error");
      setImportMessage(error instanceof Error ? error.message : "抓取失败，请稍后再试。");
    }
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!form.name.trim() || !form.provider.trim() || !form.deadline) {
      return;
    }

    const nextTotalUnits = Math.max(
      Math.max(1, Number(form.totalUnits) || 1),
      detectedLectureCount,
    );
    const nextLectureMinutes = Math.max(1, Number(form.lectureMinutes) || 60);

    const payload: CourseInput = {
      ...form,
      totalUnits: nextTotalUnits,
      lectureMinutes: nextLectureMinutes,
      difficulty: Math.min(5, Math.max(1, Number(form.difficulty) || 3)),
      priority: Math.min(5, Math.max(1, Number(form.priority) || 3)),
      roadmapPhase: Math.min(99, Math.max(0, Number(form.roadmapPhase) || 0)),
      roadmapOrder: Math.min(9999, Math.max(0, Number(form.roadmapOrder) || 0)),
      roadmapRoute: (form.roadmapRoute ?? "foundation") as RoadmapRoute,
      roadmapYear: clampRoadmapYear(Number(form.roadmapYear)),
      roadmapStatus: (form.roadmapStatus ?? "backlog") as RoadmapStatus,
      scheduleMode: getScheduleModeForStatus((form.roadmapStatus ?? "backlog") as RoadmapStatus),
      deadlineMode: "auto",
    };

    if (initialCourse) {
      updateCourse(initialCourse.id, payload);
    } else {
      addCourse(payload);
    }

    onClose();
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={initialCourse ? "编辑课程" : "新增课程"}
      description="课程会和书籍、资料一起进入 Roadmap。硬依赖会锁定排课，软依赖只影响推荐顺序。"
    >
      <form className="space-y-6 px-6 py-6" onSubmit={handleSubmit}>
        <section className="rounded-[28px] border border-slate-200 bg-slate-50/80 p-5">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end">
            <label className="block flex-1 space-y-2">
              <span className="text-sm font-medium text-slate-700">课程链接</span>
              <input
                value={importUrl}
                onChange={(event) => setImportUrl(event.target.value)}
                className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 outline-none transition focus:border-teal-500"
                placeholder="例如：https://ocw.mit.edu/..."
              />
            </label>
            <button
              type="button"
              onClick={handleImport}
              disabled={importState === "loading"}
              className="rounded-full bg-slate-950 px-5 py-3 text-sm font-medium text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-400"
            >
              {importState === "loading" ? "抓取中..." : "从链接导入"}
            </button>
          </div>

          <p className="mt-3 text-xs text-slate-500">
            优先适配 Harvard、MIT OCW、MIT Open Learning Library、Stanford、USACO Guide 和已加入的轻课程模板。
          </p>

          {importMessage ? (
            <p
              className={`mt-4 rounded-2xl px-4 py-3 text-sm ${
                importState === "error"
                  ? "bg-rose-50 text-rose-700"
                  : importState === "warning"
                    ? "bg-amber-50 text-amber-800"
                    : importState === "success"
                      ? "bg-emerald-50 text-emerald-700"
                      : "bg-slate-100 text-slate-600"
              }`}
            >
              {importMessage}
            </p>
          ) : null}

          {importWarnings.length > 0 ? (
            <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
              <p className="font-medium">导入提醒</p>
              <ul className="mt-2 space-y-1">
                {importWarnings.map((warning) => (
                  <li key={warning}>- {warning}</li>
                ))}
              </ul>
            </div>
          ) : null}
        </section>

        <section className="space-y-4">
          <div className="flex items-center justify-between gap-3">
            <h3 className="text-lg font-semibold text-slate-950">课程信息</h3>
            <span className="text-xs text-slate-500">当前识别到 {detectedLectureCount} 个 lecture</span>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <label className="space-y-2">
              <span className="text-sm font-medium text-slate-700">课程名</span>
              <input
                required
                value={form.name}
                onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))}
                className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 outline-none transition focus:border-teal-500"
              />
            </label>

            <label className="space-y-2">
              <span className="text-sm font-medium text-slate-700">平台 / 来源</span>
              <input
                required
                value={form.provider}
                onChange={(event) =>
                  setForm((current) => ({ ...current, provider: event.target.value }))
                }
                className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 outline-none transition focus:border-teal-500"
              />
            </label>

            <label className="space-y-2">
              <span className="text-sm font-medium text-slate-700">总节数</span>
              <input
                type="number"
                min={1}
                value={form.totalUnits}
                onChange={(event) =>
                  setForm((current) => ({ ...current, totalUnits: Number(event.target.value) || 1 }))
                }
                className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 outline-none transition focus:border-teal-500"
              />
            </label>

            <label className="space-y-2">
              <span className="text-sm font-medium text-slate-700">lecture 默认预计时长（分钟）</span>
              <input
                type="number"
                min={1}
                max={MAX_STUDY_UNIT_MINUTES}
                value={form.lectureMinutes}
                onChange={(event) =>
                  setForm((current) => ({ ...current, lectureMinutes: Number(event.target.value) || 60 }))
                }
                className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 outline-none transition focus:border-teal-500"
              />
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
                系统会按当前容量、Roadmap 顺序和剩余工作量自动生成目标完成日。
              </p>
            </label>

            <label className="space-y-2">
              <span className="text-sm font-medium text-slate-700">课程类型</span>
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
                <option value="heavy">重课程：数学、编程、解题、高专注</option>
                <option value="light">轻课程：观看、泛听、低状态也能推进</option>
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
              <span className="text-sm font-medium text-slate-700">难度（1-5）</span>
              <input
                type="number"
                min={1}
                max={5}
                value={form.difficulty}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    difficulty: Math.min(5, Math.max(1, Number(event.target.value) || 3)),
                  }))
                }
                className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 outline-none transition focus:border-teal-500"
              />
            </label>

            <label className="space-y-2">
              <span className="text-sm font-medium text-slate-700">优先级（1-5）</span>
              <input
                type="number"
                min={1}
                max={5}
                value={form.priority ?? 3}
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
                placeholder="例如：math-foundation / ml-ai-core"
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

            <label className="space-y-2">
              <span className="text-sm font-medium text-slate-700">课程颜色</span>
              <div className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-3">
                <input
                  type="color"
                  value={form.color}
                  onChange={(event) => setForm((current) => ({ ...current, color: event.target.value }))}
                  className="h-10 w-16 cursor-pointer rounded-xl border-0 bg-transparent p-0"
                />
                <span className="text-sm text-slate-500">{form.color}</span>
              </div>
            </label>

            <label className="space-y-2 md:col-span-2">
              <span className="text-sm font-medium text-slate-700">硬依赖 / 必须先完成</span>
              <select
                multiple
                value={form.dependencyIds ?? []}
                onChange={(event) =>
                  handleDependencyChange(
                    "dependencyIds",
                    Array.from(event.target.selectedOptions).map((option) => option.value),
                  )
                }
                className="min-h-28 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 outline-none transition focus:border-teal-500"
              >
                {dependencyOptions.map((option) => (
                  <option key={option.id} value={option.id}>
                    {option.title}
                  </option>
                ))}
              </select>
              <p className="text-xs text-slate-500">硬依赖未完成前，这门课不会进入今日任务。</p>
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
                {dependencyOptions.map((option) => (
                  <option key={option.id} value={option.id}>
                    {option.title}
                  </option>
                ))}
              </select>
              <p className="text-xs text-slate-500">软依赖只会让系统更倾向于先排前置项，不会锁死这门课。</p>
            </label>

            <label className="space-y-2 md:col-span-2">
              <span className="text-sm font-medium text-slate-700">课程链接</span>
              <input
                value={form.sourceUrl ?? ""}
                onChange={(event) => setForm((current) => ({ ...current, sourceUrl: event.target.value }))}
                className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 outline-none transition focus:border-teal-500"
              />
            </label>
          </div>

          <label className="block space-y-2">
            <span className="text-sm font-medium text-slate-700">课程备注</span>
            <textarea
              rows={3}
              value={form.notes}
              onChange={(event) => setForm((current) => ({ ...current, notes: event.target.value }))}
              className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 outline-none transition focus:border-teal-500"
              placeholder="记录这门课的定位、重点章节或执行策略"
            />
          </label>

          <label className="block space-y-2">
            <span className="text-sm font-medium text-slate-700">Lecture 标题</span>
            <textarea
              rows={8}
              value={form.lectureTitlesText}
              onChange={(event) =>
                setForm((current) => ({ ...current, lectureTitlesText: event.target.value }))
              }
              className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 outline-none transition focus:border-teal-500"
              placeholder={`每行一节，例如：\nLecture 1 - Limits\nLecture 2 - Derivatives`}
            />
          </label>
        </section>

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
            {initialCourse ? "保存修改" : "创建课程"}
          </button>
        </div>
      </form>
    </Modal>
  );
}

