import { useState } from "react";
import { useCourseContext } from "../../context/CourseContext";
import { Lecture, LectureTimingInsight, LectureTimingStatus } from "../../types";
import {
  MAX_STUDY_LOG_MINUTES,
  MAX_STUDY_UNIT_MINUTES,
  clampStudyMinutes,
} from "../../utils/studyLimits";

interface LectureTableProps {
  courseId: string;
  lectures: Lecture[];
  timingInsights: Map<string, LectureTimingInsight>;
}

const statusMeta: Record<
  LectureTimingStatus,
  {
    label: string;
    badgeClassName: string;
    description: string;
  }
> = {
  accurate: {
    label: "准确",
    badgeClassName: "bg-emerald-50 text-emerald-700",
    description: "这节课的实际时长和预估基本一致。",
  },
  longer: {
    label: "偏长",
    badgeClassName: "bg-amber-50 text-amber-700",
    description: "这节课通常比预估更费时间，后续可以适当上调。",
  },
  shorter: {
    label: "偏短",
    badgeClassName: "bg-sky-50 text-sky-700",
    description: "这节课通常比预估更快，后续可以适当下调。",
  },
  inProgress: {
    label: "进行中",
    badgeClassName: "bg-slate-100 text-slate-700",
    description: "这节课还没结束，当前实际时长只代表已投入的时间。",
  },
  missing: {
    label: "暂无数据",
    badgeClassName: "bg-slate-100 text-slate-500",
    description: "完成或记录学习时间后，这里会自动生成对照。",
  },
};

const noticeClasses = {
  success: "border-emerald-200 bg-emerald-50 text-emerald-700",
  warning: "border-amber-200 bg-amber-50 text-amber-700",
} as const;

interface StudyLogNotice {
  tone: "success" | "warning";
  message: string;
}

function formatSignedMinutes(minutes: number | null) {
  if (minutes === null) {
    return "未生成";
  }

  if (minutes === 0) {
    return "0 分钟";
  }

  return `${minutes > 0 ? "+" : ""}${minutes} 分钟`;
}

function formatRatio(ratio: number | null) {
  if (ratio === null) {
    return "--";
  }

  return `${ratio > 0 ? "+" : ""}${Math.round(ratio * 100)}%`;
}

function parseStudyLogMinutes(rawValue: string) {
  if (!rawValue.trim()) {
    return null;
  }

  const parsedValue = Number(rawValue);
  if (!Number.isFinite(parsedValue) || parsedValue <= 0) {
    return null;
  }

  return clampStudyMinutes(parsedValue, 1, MAX_STUDY_LOG_MINUTES);
}

export function LectureTable({ courseId, lectures, timingInsights }: LectureTableProps) {
  const { toggleLectureCompletion, updateLecture, logLectureStudyTime } = useCourseContext();
  const [studyLogDrafts, setStudyLogDrafts] = useState<Record<string, string>>({});
  const [notice, setNotice] = useState<StudyLogNotice | null>(null);

  function handleStudyLogDraftChange(lectureId: string, value: string) {
    setStudyLogDrafts((currentDrafts) => ({
      ...currentDrafts,
      [lectureId]: value,
    }));
  }

  function handleLogLectureStudyTime(lecture: Lecture) {
    const loggedMinutes = parseStudyLogMinutes(studyLogDrafts[lecture.id] ?? "");
    if (loggedMinutes == null) {
      setNotice({
        tone: "warning",
        message: `请先为 #${lecture.order} ${lecture.title} 填写大于 0 的分钟数。`,
      });
      return;
    }

    logLectureStudyTime(courseId, lecture.id, loggedMinutes);
    setStudyLogDrafts((currentDrafts) => ({
      ...currentDrafts,
      [lecture.id]: "",
    }));
    setNotice({
      tone: "success",
      message: `已为 #${lecture.order} ${lecture.title} 补记 ${loggedMinutes} 分钟。`,
    });
  }

  if (lectures.length === 0) {
    return (
      <div className="rounded-[24px] border border-dashed border-slate-300 px-4 py-6 text-sm text-slate-500">
        当前筛选条件下没有 lecture。
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {notice ? (
        <div className={`rounded-[24px] border px-4 py-4 text-sm ${noticeClasses[notice.tone]}`}>
          {notice.message}
        </div>
      ) : null}

      {lectures.map((lecture) => {
        const lowUnderstanding = lecture.completed && (lecture.understanding ?? 5) <= 2;
        const timingInsight = timingInsights.get(lecture.id);
        const timingMeta = statusMeta[timingInsight?.timingStatus ?? "missing"];
        const studyLogDraft = studyLogDrafts[lecture.id] ?? "";
        const canLogStudyTime = parseStudyLogMinutes(studyLogDraft) != null;

        return (
          <div
            key={lecture.id}
            className={`rounded-[26px] border p-4 transition ${
              lecture.completed
                ? "border-slate-200 bg-white"
                : "border-slate-300 bg-slate-50/80"
            }`}
          >
            <div className="flex flex-col gap-4 xl:flex-row xl:items-start">
              <div className="flex min-w-0 flex-1 gap-4">
                <input
                  type="checkbox"
                  checked={lecture.completed}
                  onChange={() => toggleLectureCompletion(courseId, lecture.id)}
                  className="mt-1 h-5 w-5 rounded border-slate-300 text-teal-600 focus:ring-teal-500"
                />

                <div className="min-w-0 flex-1 space-y-3">
                  <div className="flex flex-wrap items-center gap-3">
                    <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-600">
                      #{lecture.order}
                    </span>
                    <input
                      value={lecture.title}
                      onChange={(event) =>
                        updateLecture(courseId, lecture.id, {
                          title: event.target.value,
                        })
                      }
                      className="min-w-[220px] flex-1 rounded-xl border border-slate-200 bg-white px-3 py-2 font-medium text-slate-900 outline-none transition focus:border-teal-500"
                    />
                    <span
                      className={`rounded-full px-3 py-1 text-xs font-semibold ${
                        lecture.completed
                          ? "bg-emerald-50 text-emerald-700"
                          : "bg-slate-200 text-slate-700"
                      }`}
                    >
                      {lecture.completed ? "已完成" : "未完成"}
                    </span>
                    {lowUnderstanding ? (
                      <span className="rounded-full bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-700">
                        低理解评分
                      </span>
                    ) : null}
                  </div>

                  <textarea
                    rows={2}
                    value={lecture.notes}
                    onChange={(event) =>
                      updateLecture(courseId, lecture.id, {
                        notes: event.target.value,
                      })
                    }
                    className="w-full rounded-2xl border border-slate-200 bg-white px-3 py-3 text-sm text-slate-700 outline-none transition focus:border-teal-500"
                    placeholder="补充难点、复盘重点或下次继续的切入点"
                  />
                </div>
              </div>

              <div className="grid gap-3 sm:grid-cols-2 xl:w-[520px]">
                <label className="space-y-2">
                  <span className="text-xs font-medium uppercase tracking-[0.16em] text-slate-500">
                    理解评分
                  </span>
                  <select
                    value={lecture.understanding ?? ""}
                    onChange={(event) =>
                      updateLecture(courseId, lecture.id, {
                        understanding: event.target.value
                          ? Number(event.target.value)
                          : null,
                      })
                    }
                    className="w-full rounded-2xl border border-slate-200 bg-white px-3 py-3 outline-none transition focus:border-teal-500"
                  >
                    <option value="">未评分</option>
                    <option value="1">1 - 很模糊</option>
                    <option value="2">2 - 需要重学</option>
                    <option value="3">3 - 基本理解</option>
                    <option value="4">4 - 比较熟</option>
                    <option value="5">5 - 已吃透</option>
                  </select>
                </label>

                <label className="space-y-2">
                  <span className="text-xs font-medium uppercase tracking-[0.16em] text-slate-500">
                    完成日期
                  </span>
                  <input
                    type="date"
                    disabled={!lecture.completed}
                    value={lecture.completedAt ?? ""}
                    onChange={(event) =>
                      updateLecture(courseId, lecture.id, {
                        completedAt: event.target.value || undefined,
                      })
                    }
                    className="w-full rounded-2xl border border-slate-200 bg-white px-3 py-3 outline-none transition disabled:cursor-not-allowed disabled:bg-slate-100 focus:border-teal-500"
                  />
                </label>

                <label className="space-y-2">
                  <span className="text-xs font-medium uppercase tracking-[0.16em] text-slate-500">
                    lecture 预计时长
                  </span>
                  <input
                    type="number"
                    min={1}
                    max={MAX_STUDY_UNIT_MINUTES}
                    value={lecture.estimatedMinutes}
                    onChange={(event) =>
                      updateLecture(courseId, lecture.id, {
                        estimatedMinutes: Number(event.target.value) || 1,
                      })
                    }
                    className="w-full rounded-2xl border border-slate-200 bg-white px-3 py-3 outline-none transition focus:border-teal-500"
                    placeholder="分钟"
                  />
                </label>

                <div className="space-y-2">
                  <span className="text-xs font-medium uppercase tracking-[0.16em] text-slate-500">
                    实际时长
                  </span>
                  <div className="rounded-2xl border border-slate-200 bg-slate-50 px-3 py-3">
                    <p className="text-base font-semibold text-slate-950">
                      {timingInsight?.actualMinutes != null
                        ? `${timingInsight.actualMinutes} 分钟`
                        : "暂无数据"}
                    </p>
                    <p className="mt-1 text-xs text-slate-500">
                      {timingInsight?.usedLegacyActualMinutes
                        ? "当前显示的是旧的手动实际时长。"
                        : timingInsight?.actualMinutes != null
                          ? "按学习记录自动累计。"
                          : "完成或记录学习后会自动出现。"}
                    </p>
                  </div>
                </div>

                <div className="rounded-2xl border border-slate-200 bg-white px-3 py-3 sm:col-span-2">
                  <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
                    <div>
                      <p className="text-xs font-medium uppercase tracking-[0.16em] text-slate-500">
                        新增学习时长
                      </p>
                      <p className="mt-2 text-sm text-slate-600">
                        完成今日任务后，如果你还继续学了这节内容，就在这里补记新增分钟。默认记到今天，不会改动今日任务的完成状态。
                      </p>
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      <input
                        type="number"
                        min={1}
                        max={MAX_STUDY_LOG_MINUTES}
                        step={5}
                        value={studyLogDraft}
                        onChange={(event) =>
                          handleStudyLogDraftChange(lecture.id, event.target.value)
                        }
                        className="w-24 rounded-full border border-slate-200 bg-slate-50 px-4 py-2 text-sm font-medium text-slate-950 outline-none transition focus:border-teal-300 focus:bg-white"
                        placeholder="分钟"
                      />
                      <span className="text-sm text-slate-500">分钟</span>
                      <button
                        type="button"
                        onClick={() => handleLogLectureStudyTime(lecture)}
                        disabled={!canLogStudyTime}
                        className="rounded-full bg-slate-950 px-4 py-2 text-sm font-medium text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-300"
                      >
                        补记时长
                      </button>
                    </div>
                  </div>
                </div>

                <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-3 py-3 text-sm leading-6 text-slate-600 sm:col-span-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <span
                      className={`rounded-full px-3 py-1 text-xs font-semibold ${timingMeta.badgeClassName}`}
                    >
                      {timingMeta.label}
                    </span>
                    <span className="text-xs text-slate-500">
                      差值 {formatSignedMinutes(timingInsight?.deltaMinutes ?? null)}
                    </span>
                    <span className="text-xs text-slate-500">
                      偏差 {formatRatio(timingInsight?.deltaRatio ?? null)}
                    </span>
                  </div>
                  <p className="mt-3">{timingMeta.description}</p>
                  <p className="mt-2 text-slate-700">
                    {timingInsight?.suggestedEstimateMinutes != null
                      ? `下次可估 ${timingInsight.suggestedEstimateMinutes} 分钟。`
                      : "这节 lecture 的最终建议会在你完成并记录学习时间后生成。"}
                  </p>
                </div>

                <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-3 py-3 text-sm leading-6 text-slate-600 sm:col-span-2">
                  这里改的是这节 lecture 自己预计需要多久。Roadmap 调度会按重/轻学习槽拆分或衔接内容，
                  不会强行把 lecture 本身改成固定时长。
                </div>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
