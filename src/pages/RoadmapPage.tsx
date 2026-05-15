import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { LearningItemFormModal } from "../components/roadmap/LearningItemFormModal";
import { useCourseContext } from "../context/CourseContext";
import { usePlannerSnapshot } from "../planner/usePlannerSnapshot";
import {
  Course,
  LearningItem,
  LearningItemType,
  LearningSourceType,
  RoadmapRoute,
  RoadmapScheduleMode,
  RoadmapStatus,
  RoadmapYear,
  ScheduleCadence,
} from "../types";
import { roadmapStatusLabels } from "../utils/roadmapMetadata";
import { buildGoalsByLinkedItem } from "../utils/goalProgress";

interface RoadmapCard {
  id: string;
  title: string;
  type: LearningItemType;
  sourceType: LearningSourceType;
  intensity: "heavy" | "light";
  deadline: string;
  priority: number;
  dependencyIds: string[];
  softDependencyIds: string[];
  roadmapTrack: string;
  roadmapPhase: number;
  roadmapOrder: number;
  roadmapRoute: RoadmapRoute;
  roadmapYear: RoadmapYear;
  roadmapStatus: RoadmapStatus;
  scheduleMode: RoadmapScheduleMode;
  scheduleCadence: ScheduleCadence;
  weeklyTargetBlocks?: number;
  weeklySpacingDays?: number;
  completedUnits: number;
  totalUnits: number;
  progressMinutes: number;
  totalMinutes: number;
  locked: boolean;
  completed: boolean;
  sourceUrl?: string;
  notes: string;
  item?: LearningItem;
  course?: Course;
}

const typeLabels = {
  course: "课程",
  book: "书籍",
  paper: "论文",
  roadmap: "Roadmap",
  practice: "练习",
  project: "项目",
} satisfies Record<LearningItemType, string>;

const statusLabels = {
  available: "可学习",
  inProgress: "进行中",
  locked: "未解锁",
  completed: "已完成",
} as const;

interface PhasePlan {
  title: string;
  objective: string;
  outcome: string;
}

const phasePlans: Record<number, PhasePlan> = {
  0: {
    title: "Target Profile / Reference",
    objective: "把长期目标收敛成 3D World Model Research Engineer / 3D Product Engineer，不再泛化成所有 AI 与机器人方向。",
    outcome: "知道 World Labs 路线需要哪些证据：3D demo、重建/渲染/SLAM 实验、工程化 pipeline 和技术写作。",
  },
  1: {
    title: "School + Programming + Math Foundation",
    objective: "期末前不新增 World Labs 重任务，优先完成学校考试相关数学、物理、线代和 CS 基础。",
    outcome: "高数、线代、物理和 CS50 能支撑后续 3D geometry、graphics、CV 和 ML 课程。",
  },
  2: {
    title: "Graphics + Systems + Algorithms Foundation",
    objective: "把底层兴趣收敛到 World Labs 前置工程能力：图形学、算法、系统和 Code-to-Silicon v1。",
    outcome: "完成解释器/VM 小切片，并能说明 3D 图形管线、相机、shader、GPU pipeline 的基本关系。",
  },
  3: {
    title: "ML + CV + 3D Reconstruction",
    objective: "进入 World Labs 最核心的作品线：机器学习、视觉理解、相机几何、多视图重建和 Marble/world model 原理。",
    outcome: "完成照片/视频 -> camera pose -> sparse point cloud -> Three.js viewer 的可复现 demo，并写清失败模式。",
  },
  4: {
    title: "Neural Rendering + SLAM + Real-time 3D",
    objective: "围绕 world model 证据链补齐 3DGS/NeRF、SLAM、状态估计和实时 3D viewer。",
    outcome: "能复现或改造 NeRF/3DGS/SLAM 小项目，并把结果接入可交互 viewer 或产品级 pipeline。",
  },
  5: {
    title: "Portfolio + Application",
    objective: "把课程、项目、论文复现和工程能力整理成申请 World Labs / Marble / 3D AI 团队的证据包。",
    outcome: "形成 GitHub 项目、demo reel、技术写作、研究陈述、岗位匹配表和 reach-out 清单。",
  },
  99: {
    title: "Unfiled / Routine",
    objective: "收纳暂未归入主线的内容，避免污染主要阶段路线。",
    outcome: "只保留确实有价值的例行训练或备用资料。",
  },
};

const worldLabsTargetProfile = {
  title: "3D World Model Research Engineer / 3D Product Engineer",
  thesis:
    "主线不是泛 AI 助手，而是把 3D reconstruction、graphics、neural rendering、SLAM 和产品工程串成可展示的 world model demo。",
  evidence: [
    "照片/视频 -> camera pose -> sparse point cloud -> 3DGS/NeRF -> Web viewer",
    "Marble/world model 使用、导出、失败模式和原理分析",
    "可复现实验记录、技术文章、demo reel 和 GitHub 项目页",
  ],
  currentFocus:
    "期末前只保 Phase 1 + Code-to-Silicon 每周 1 块；期末后优先 Graphics Foundations，再进入 Spatial World Lab。",
  deferred:
    "Jarvis、机器人控制、RL、FPGA 和 BCI 都保留为远期/集成层，不作为当前申请证据主线。",
};

const projectStageIds = new Set([
  "resource-code-to-silicon-lab",
  "resource-graphics-foundations-lab",
  "resource-spatial-world-lab",
  "resource-neural-rendering-lab",
  "resource-slam-state-estimation-lab",
  "resource-spatial-agent-demo",
  "resource-nand2tetris",
  "resource-visionos-spatial-interface",
]);

function isCompletedByUnits(totalUnits: number, completedUnits: number) {
  return totalUnits > 0 && completedUnits === totalUnits;
}

function getCourseCard(course: Course, completedMap: Map<string, boolean>): RoadmapCard {
  const totalMinutes = course.lectures.reduce((total, lecture) => total + lecture.estimatedMinutes, 0);
  const progressMinutes = course.lectures.reduce(
    (total, lecture) => total + Math.max(lecture.progressMinutes ?? 0, 0),
    0,
  );
  const completedUnits = course.lectures.filter((lecture) => lecture.completed).length;
  const dependencyIds = course.dependencyIds ?? [];
  const completed = isCompletedByUnits(course.lectures.length, completedUnits);
  const locked = !dependencyIds.every((dependencyId) => completedMap.get(dependencyId));

  return {
    id: course.id,
    title: course.name,
    type: "course",
    sourceType: course.sourceType ?? "course",
    intensity: course.intensity,
    deadline: course.deadline,
    priority: course.priority ?? course.difficulty,
    dependencyIds,
    softDependencyIds: course.softDependencyIds ?? [],
    roadmapTrack: course.roadmapTrack ?? "general",
    roadmapPhase: course.roadmapPhase ?? 99,
    roadmapOrder: course.roadmapOrder ?? 999,
    roadmapRoute: course.roadmapRoute ?? "foundation",
    roadmapYear: course.roadmapYear ?? 4,
    roadmapStatus: course.roadmapStatus ?? "backlog",
    scheduleMode: course.scheduleMode ?? "scheduled",
    scheduleCadence: course.scheduleCadence ?? "roadmap",
    weeklyTargetBlocks: course.weeklyTargetBlocks,
    weeklySpacingDays: course.weeklySpacingDays,
    completedUnits,
    totalUnits: course.lectures.length,
    progressMinutes,
    totalMinutes,
    locked,
    completed,
    sourceUrl: course.sourceUrl,
    notes: course.notes,
    course,
  };
}

function getLearningItemCard(item: LearningItem, completedMap: Map<string, boolean>): RoadmapCard {
  const totalMinutes = item.units.reduce((total, unit) => total + unit.estimatedMinutes, 0);
  const progressMinutes = item.units.reduce(
    (total, unit) => total + Math.max(unit.progressMinutes ?? 0, 0),
    0,
  );
  const completedUnits = item.units.filter((unit) => unit.completed).length;
  const completed = isCompletedByUnits(item.units.length, completedUnits);
  const locked = !item.dependencyIds.every((dependencyId) => completedMap.get(dependencyId));

  return {
    id: item.id,
    title: item.title,
    type: item.type,
    sourceType: "learningItem",
    intensity: item.intensity,
    deadline: item.deadline,
    priority: item.priority,
    dependencyIds: item.dependencyIds,
    softDependencyIds: item.softDependencyIds,
    roadmapTrack: item.roadmapTrack,
    roadmapPhase: item.roadmapPhase,
    roadmapOrder: item.roadmapOrder,
    roadmapRoute: item.roadmapRoute,
    roadmapYear: item.roadmapYear,
    roadmapStatus: item.roadmapStatus,
    scheduleMode: item.scheduleMode,
    scheduleCadence: item.scheduleCadence ?? "roadmap",
    weeklyTargetBlocks: item.weeklyTargetBlocks,
    weeklySpacingDays: item.weeklySpacingDays,
    completedUnits,
    totalUnits: item.units.length,
    progressMinutes,
    totalMinutes,
    locked,
    completed,
    sourceUrl: item.sourceUrl,
    notes: item.notes,
    item,
  };
}

function isActiveScheduledCard(card: RoadmapCard) {
  return card.roadmapStatus === "active" && card.scheduleMode === "scheduled";
}

function isReferenceCard(card: RoadmapCard) {
  return card.roadmapStatus === "reference" || card.scheduleMode === "reference";
}

function isProjectStageCard(card: RoadmapCard) {
  return (
    card.type === "project" ||
    projectStageIds.has(card.id) ||
    /\b(Lab|Demo|Sandbox|Project)\b/i.test(card.title)
  );
}

function getPhasePlan(phase: number): PhasePlan {
  return (
    phasePlans[phase] ?? {
      title: `Roadmap Phase ${phase}`,
      objective: "这一阶段还没有单独写目标说明，先按 Roadmap 顺序推进。",
      outcome: "完成本阶段进入排课的学习项和对应项目切片。",
    }
  );
}

function getCardStatus(card: RoadmapCard) {
  if (card.completed) {
    return "completed";
  }
  if (card.locked) {
    return "locked";
  }
  if (card.completedUnits > 0 || card.progressMinutes > 0) {
    return "inProgress";
  }

  return "available";
}

function sortRoadmapCards(left: RoadmapCard, right: RoadmapCard) {
  if (left.roadmapPhase !== right.roadmapPhase) {
    return left.roadmapPhase - right.roadmapPhase;
  }
  if (left.roadmapOrder !== right.roadmapOrder) {
    return left.roadmapOrder - right.roadmapOrder;
  }
  if (left.deadline !== right.deadline) {
    return left.deadline.localeCompare(right.deadline);
  }
  return right.priority - left.priority;
}

function formatMinutes(minutes: number) {
  if (minutes < 60) {
    return `${minutes} 分钟`;
  }

  return `${Math.round((minutes / 60) * 10) / 10} 小时`;
}

function getSourceLabel(sourceUrl?: string) {
  if (!sourceUrl) {
    return null;
  }

  if (sourceUrl.startsWith("http")) {
    return (
      <a
        href={sourceUrl}
        target="_blank"
        rel="noreferrer"
        className="text-teal-700 underline-offset-4 hover:underline"
      >
        打开链接
      </a>
    );
  }

  return <span className="break-all text-slate-500">{sourceUrl}</span>;
}

function getCardDetailPath(card: RoadmapCard) {
  return card.sourceType === "learningItem" ? `/learning-items/${card.id}` : `/courses/${card.id}`;
}

export function RoadmapPage() {
  const {
    courses,
    learningItems,
    goals,
  } = useCourseContext();
  const { snapshot } = usePlannerSnapshot();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<LearningItem | null>(null);

  const completedMap = useMemo(() => {
    const nextMap = new Map<string, boolean>();

    courses.forEach((course) => {
      const completed = course.lectures.length > 0 && course.lectures.every((lecture) => lecture.completed);
      nextMap.set(course.id, completed);
      if (course.canonicalId) {
        nextMap.set(course.canonicalId, completed);
      }
    });
    learningItems.forEach((item) => {
      nextMap.set(
        item.id,
        item.units.length > 0 && item.units.every((unit) => unit.completed),
      );
    });

    return nextMap;
  }, [courses, learningItems]);

  const cards = useMemo(
    () =>
      [
        ...courses.map((course) => getCourseCard(course, completedMap)),
        ...learningItems.map((item) => getLearningItemCard(item, completedMap)),
      ].sort(sortRoadmapCards),
    [completedMap, courses, learningItems],
  );

  const visibleCards = cards.filter((card) => card.roadmapStatus !== "archived");
  const dependencyOptions = visibleCards.map((card) => ({
    id: card.id,
    title: `${card.title} (${typeLabels[card.type]})`,
  }));
  const titleMap = new Map(
    cards.flatMap((card) => [
      [card.id, card.title] as const,
      ...(card.course?.canonicalId ? [[card.course.canonicalId, card.title] as const] : []),
    ]),
  );
  const todaysRoadmapTasks = snapshot.todayPlan.tasks.slice(0, 6);
  const weeklyCards = visibleCards.filter(
    (card) => card.scheduleCadence === "weekly" && isActiveScheduledCard(card),
  );
  const weeklyRoutineCards = weeklyCards.filter(
    (card) => card.roadmapTrack === "weekly-routine" || card.roadmapPhase === 99,
  );
  const phaseRoadmapCards = visibleCards.filter(
    (card) =>
      !(
        card.scheduleCadence === "weekly" &&
        (card.roadmapTrack === "weekly-routine" || card.roadmapPhase === 99)
      ),
  );
  const weeklyTaskIds = new Set(weeklyCards.map((card) => card.id));
  const weeklyRoutineTaskIds = new Set(weeklyRoutineCards.map((card) => card.id));
  const todaysWeeklyTasks = todaysRoadmapTasks.filter((task) => weeklyTaskIds.has(task.courseId));
  const weeklyRankingMap = new Map(snapshot.priorityRanking.map((entry) => [entry.courseId, entry]));
  const scheduledCards = visibleCards.filter(isActiveScheduledCard);
  const referenceCards = visibleCards.filter(isReferenceCard);
  const goalsByItemId = useMemo(() => buildGoalsByLinkedItem(goals), [goals]);
  const todaysTasksByPhase = new Map<number, typeof todaysRoadmapTasks>();
  todaysRoadmapTasks
    .filter((task) => !weeklyRoutineTaskIds.has(task.courseId))
    .forEach((task) => {
      const currentTasks = todaysTasksByPhase.get(task.roadmapPhase) ?? [];
      currentTasks.push(task);
      todaysTasksByPhase.set(task.roadmapPhase, currentTasks);
    });
  const phaseGroups = [...new Set(phaseRoadmapCards.map((card) => card.roadmapPhase))].sort(
    (left, right) => left - right,
  );

  function closeModal() {
    setEditingItem(null);
    setIsModalOpen(false);
  }

  function renderRoadmapCard(card: RoadmapCard, lane: "learning" | "project") {
    const status = getCardStatus(card);
    const progressPct =
      card.totalUnits <= 0 ? 0 : Math.round((card.completedUnits / card.totalUnits) * 100);
    const sourceLabel = getSourceLabel(card.sourceUrl);

    return (
      <article
        key={card.id}
        className={
          lane === "project"
            ? "rounded-2xl border border-teal-100 bg-teal-50/60 p-4"
            : "rounded-2xl border border-slate-200 bg-white p-4"
        }
      >
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded-full bg-white px-2.5 py-1 text-xs font-medium text-slate-600 ring-1 ring-slate-200">
                {typeLabels[card.type]}
              </span>
              <span className="rounded-full bg-white px-2.5 py-1 text-xs font-medium text-slate-600 ring-1 ring-slate-200">
                {card.intensity === "heavy" ? "重学习" : "轻学习"}
              </span>
              <span className="rounded-full bg-white px-2.5 py-1 text-xs font-medium text-slate-600 ring-1 ring-slate-200">
                {roadmapStatusLabels[card.roadmapStatus]}
              </span>
              <span className="rounded-full bg-white px-2.5 py-1 text-xs font-medium text-slate-600 ring-1 ring-slate-200">
                {statusLabels[status]}
              </span>
              {card.scheduleCadence === "weekly" ? (
                <span className="rounded-full bg-white px-2.5 py-1 text-xs font-medium text-teal-700 ring-1 ring-teal-100">
                  每周 {card.weeklyTargetBlocks ?? 0} 块
                </span>
              ) : null}
            </div>

            <h3 className="mt-3 text-base font-semibold text-slate-950">{card.title}</h3>
            <p className="mt-2 text-sm text-slate-600">
              {card.roadmapTrack} · Order {card.roadmapOrder} · Priority {card.priority}
            </p>
            <div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-100">
              <div
                className={lane === "project" ? "h-full bg-teal-500" : "h-full bg-slate-900"}
                style={{ width: `${Math.min(100, Math.max(0, progressPct))}%` }}
              />
            </div>
            <p className="mt-2 text-xs text-slate-500">
              {card.completedUnits}/{card.totalUnits} units · {progressPct}% · 已记{" "}
              {formatMinutes(card.progressMinutes)}
            </p>
          </div>

          <div className="flex shrink-0 flex-wrap gap-2">
            <Link
              to={getCardDetailPath(card)}
              className="rounded-full border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-700 transition hover:text-slate-950"
            >
              详情
            </Link>
            {card.item ? (
              <button
                type="button"
                onClick={() => {
                  setEditingItem(card.item ?? null);
                  setIsModalOpen(true);
                }}
                className="rounded-full border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-700 transition hover:text-slate-950"
              >
                编辑
              </button>
            ) : null}
          </div>
        </div>

        {card.dependencyIds.length > 0 || card.softDependencyIds.length > 0 ? (
          <div className="mt-4 space-y-1 rounded-2xl bg-white/80 px-3 py-3 text-xs leading-5 text-slate-600">
            {card.dependencyIds.length > 0 ? (
              <p>
                硬依赖：
                {card.dependencyIds.map((dependencyId) => (
                  <span key={dependencyId} className="ml-2 font-medium text-slate-900">
                    {titleMap.get(dependencyId) ?? dependencyId}
                  </span>
                ))}
              </p>
            ) : null}
            {card.softDependencyIds.length > 0 ? (
              <p>
                软依赖：
                {card.softDependencyIds.map((dependencyId) => (
                  <span key={dependencyId} className="ml-2 font-medium text-slate-900">
                    {titleMap.get(dependencyId) ?? dependencyId}
                  </span>
                ))}
              </p>
            ) : null}
          </div>
        ) : null}

        {card.notes ? (
          <p className="mt-3 line-clamp-3 text-sm leading-6 text-slate-600">{card.notes}</p>
        ) : null}

        {sourceLabel ? (
          <div className="mt-3 text-xs text-slate-500">
            <span>来源：</span>
            {sourceLabel}
          </div>
        ) : null}
      </article>
    );
  }

  return (
    <div className="space-y-6">
      <section className="flex flex-col justify-between gap-5 lg:flex-row lg:items-end">
        <div>
          <p className="eyebrow">Roadmap</p>
          <h1 className="mt-2 text-4xl font-semibold tracking-tight text-slate-950">
            Roadmap 课程与项目路线图
          </h1>
          <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-600">
            每个阶段左侧放课程、书籍和练习，右侧放对应项目切片。系统按阶段、依赖、重轻槽位和截止风险生成每日任务，reference 资料只展示不抢学习槽。
          </p>
        </div>

        <button
          type="button"
          onClick={() => setIsModalOpen(true)}
          className="rounded-full bg-slate-950 px-5 py-3 text-sm font-medium text-white transition hover:bg-slate-800"
        >
          新增学习项
        </button>
      </section>

      <section className="panel p-6">
        <div className="grid gap-5 lg:grid-cols-[minmax(0,1.1fr)_minmax(320px,0.9fr)]">
          <div>
            <p className="eyebrow">World Labs Target</p>
            <h2 className="section-title">{worldLabsTargetProfile.title}</h2>
            <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-600">
              {worldLabsTargetProfile.thesis}
            </p>
          </div>

          <div className="rounded-2xl border border-teal-100 bg-teal-50/70 px-4 py-4">
            <p className="text-xs font-medium uppercase tracking-[0.16em] text-teal-700">
              当前执行边界
            </p>
            <p className="mt-3 text-sm leading-6 text-slate-700">
              {worldLabsTargetProfile.currentFocus}
            </p>
            <p className="mt-3 text-sm leading-6 text-slate-600">
              {worldLabsTargetProfile.deferred}
            </p>
          </div>
        </div>

        <div className="mt-5 grid gap-3 md:grid-cols-3">
          {worldLabsTargetProfile.evidence.map((item) => (
            <div key={item} className="rounded-2xl border border-slate-200 bg-white px-4 py-4">
              <p className="text-sm leading-6 text-slate-700">{item}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-4">
        <div className="panel p-5">
          <p className="text-sm text-slate-500">总学习项</p>
          <p className="mt-3 text-3xl font-semibold text-slate-950">{visibleCards.length}</p>
          <p className="mt-2 text-sm text-slate-600">课程 {courses.length} 门，资料 {learningItems.length} 项。</p>
        </div>
        <div className="panel p-5">
          <p className="text-sm text-slate-500">进入排课</p>
          <p className="mt-3 text-3xl font-semibold text-slate-950">{scheduledCards.length}</p>
          <p className="mt-2 text-sm text-slate-600">会参与今日任务和周计划。</p>
        </div>
        <div className="panel p-5">
          <p className="text-sm text-slate-500">Reference</p>
          <p className="mt-3 text-3xl font-semibold text-slate-950">{referenceCards.length}</p>
          <p className="mt-2 text-sm text-slate-600">只作参考，不抢每日槽位。</p>
        </div>
        <div className="panel p-5">
          <p className="text-sm text-slate-500">未解锁</p>
          <p className="mt-3 text-3xl font-semibold text-slate-950">
            {visibleCards.filter((card) => getCardStatus(card) === "locked").length}
          </p>
          <p className="mt-2 text-sm text-slate-600">完成硬依赖后自动进入候选池。</p>
        </div>
      </section>

      <section className="panel p-6">
        <div className="flex flex-col gap-2">
          <p className="eyebrow">Today From Roadmap</p>
          <h2 className="section-title">今日系统推荐</h2>
          <p className="text-sm text-slate-600">这里同步今日任务页的推荐，让你从路线角度看今天为什么学这些。</p>
        </div>
        <div className="mt-5 grid gap-3 md:grid-cols-2 lg:grid-cols-3">
          {todaysRoadmapTasks.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-slate-300 px-4 py-5 text-sm text-slate-500">
              今天暂时没有可执行任务。
            </div>
          ) : (
            todaysRoadmapTasks.map((task) => (
              <Link
                key={task.taskId}
                to={task.sourceType === "learningItem" ? `/learning-items/${task.courseId}` : `/courses/${task.courseId}`}
                className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4 transition hover:border-slate-300 hover:bg-white"
              >
                <div className="flex items-center justify-between gap-3">
                  <p className="font-semibold text-slate-950">{task.courseName}</p>
                  <span className="rounded-full bg-white px-2.5 py-1 text-xs text-slate-600 ring-1 ring-slate-200">
                    {task.intensity === "heavy" ? "重槽" : "轻槽"}
                  </span>
                </div>
                <p className="mt-2 text-sm text-slate-600">
                  {task.sourceLabel ?? task.provider} · {task.actionLabel ?? "学习"} · {task.estimatedMinutes} 分钟
                </p>
                <p className="mt-2 text-sm text-slate-600">
                  {weeklyTaskIds.has(task.courseId)
                    ? `每周固定 · ${task.roadmapPhase === 99 ? "Routine" : `Phase ${task.roadmapPhase}`}`
                    : `Phase ${task.roadmapPhase}`}{" "}
                  ·{" "}
                  {(task.unitTitles?.length ? task.unitTitles : task.lectureTitles).slice(0, 2).join(" / ")}
                </p>
                <p className="mt-2 text-xs leading-5 text-slate-500">{task.whyNow}</p>
                {(task.referenceResources ?? []).length > 0 ? (
                  <p className="mt-3 text-xs font-medium text-teal-700">
                    附带 {task.referenceResources.length} 个 reference
                  </p>
                ) : null}
              </Link>
            ))
          )}
        </div>
      </section>

      {weeklyCards.length > 0 ? (
        <section className="panel p-6">
          <div className="flex flex-col gap-2">
            <p className="eyebrow">Weekly Routine</p>
            <h2 className="section-title">每周固定训练</h2>
            <p className="text-sm text-slate-600">
              这些学习动作按周目标占用固定训练块；有明确 Phase 归属的项目也会出现在对应阶段的项目列里。
            </p>
          </div>

          <div className="mt-5 grid gap-4 lg:grid-cols-2">
            {weeklyCards.map((card) => {
              const entry = weeklyRankingMap.get(card.id);
              const todayTask = todaysWeeklyTasks.find((task) => task.courseId === card.id);
              const linkedGoals = goalsByItemId.get(card.id) ?? [];
              const progressPct =
                card.totalUnits <= 0 ? 0 : Math.round((card.completedUnits / card.totalUnits) * 100);

              return (
                <article key={card.id} className="rounded-[28px] border border-slate-200 bg-slate-50/80 p-5">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="rounded-full bg-white px-3 py-1 text-xs font-medium text-slate-600 ring-1 ring-slate-200">
                          {typeLabels[card.type]}
                        </span>
                        <span className="rounded-full bg-white px-3 py-1 text-xs font-medium text-slate-600 ring-1 ring-slate-200">
                          重学习
                        </span>
                        <span className="rounded-full bg-white px-3 py-1 text-xs font-medium text-slate-600 ring-1 ring-slate-200">
                          {roadmapStatusLabels[card.roadmapStatus]}
                        </span>
                        <span className="rounded-full bg-white px-3 py-1 text-xs font-medium text-slate-600 ring-1 ring-slate-200">
                          {card.weeklyTargetBlocks ?? 0} 块/周
                        </span>
                        <span className="rounded-full bg-white px-3 py-1 text-xs font-medium text-slate-600 ring-1 ring-slate-200">
                          间隔 {card.weeklySpacingDays ?? 0} 天
                        </span>
                        {linkedGoals.length > 0 ? (
                          <span className="rounded-full bg-teal-50 px-3 py-1 text-xs font-medium text-teal-700 ring-1 ring-teal-100">
                            关联 {linkedGoals.length} 个目标
                          </span>
                        ) : null}
                      </div>
                      <h3 className="mt-3 text-lg font-semibold text-slate-950">{card.title}</h3>
                      <p className="mt-2 text-sm text-slate-600">
                        本周已排 {entry?.scheduledUnitsThisWeek ?? 0}/{card.weeklyTargetBlocks ?? 0} 块
                      </p>
                      <p className="mt-1 text-sm text-slate-600">
                        {card.completedUnits}/{card.totalUnits} units · {progressPct}% · 已记 {formatMinutes(card.progressMinutes)}
                      </p>
                      {todayTask ? (
                        <p className="mt-3 rounded-2xl bg-white px-4 py-3 text-sm text-slate-700">
                          今日：{(todayTask.unitTitles?.length ? todayTask.unitTitles : todayTask.lectureTitles).slice(0, 1).join(" / ")} · {todayTask.estimatedMinutes} 分钟
                        </p>
                      ) : (
                        <p className="mt-3 rounded-2xl bg-white px-4 py-3 text-sm text-slate-500">
                          今天没有抽到这个固定训练块。
                        </p>
                      )}
                    </div>

                    <Link
                      to={card.sourceType === "learningItem" ? `/learning-items/${card.id}` : `/courses/${card.id}`}
                      className="rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition hover:text-slate-950"
                    >
                      学习详情
                    </Link>
                  </div>
                </article>
              );
            })}
          </div>
        </section>
      ) : null}

      {phaseGroups.map((phase) => {
        const phaseCards = phaseRoadmapCards.filter((card) => card.roadmapPhase === phase);
        const phaseContentCards = phaseCards.filter((card) => !isReferenceCard(card));
        const phaseLearningCards = phaseContentCards.filter((card) => !isProjectStageCard(card));
        const phaseProjectCards = phaseContentCards.filter(isProjectStageCard);
        const phaseTasks = todaysTasksByPhase.get(phase) ?? [];
        const phaseReferences = referenceCards.filter(
          (card) => card.scheduleCadence !== "weekly" && card.roadmapPhase === phase,
        );
        const phasePlan = getPhasePlan(phase);
        const activeCount = phaseContentCards.filter(isActiveScheduledCard).length;

        return (
          <section key={phase} className="panel p-6">
            <div className="grid gap-5 lg:grid-cols-[minmax(0,1.35fr)_minmax(280px,0.65fr)]">
              <div>
                <p className="eyebrow">Phase {phase}</p>
                <h2 className="section-title">{phasePlan.title}</h2>
                <p className="mt-3 text-sm leading-6 text-slate-600">{phasePlan.objective}</p>
                <p className="mt-3 rounded-2xl bg-slate-50 px-4 py-3 text-sm leading-6 text-slate-700">
                  <span className="font-semibold text-slate-950">阶段验收：</span>
                  {phasePlan.outcome}
                </p>
                <div className="mt-4 flex flex-wrap gap-2">
                  <span className="rounded-full bg-white px-3 py-1 text-xs font-medium text-slate-600 ring-1 ring-slate-200">
                    课程/学习 {phaseLearningCards.length}
                  </span>
                  <span className="rounded-full bg-white px-3 py-1 text-xs font-medium text-teal-700 ring-1 ring-teal-100">
                    项目阶段 {phaseProjectCards.length}
                  </span>
                  <span className="rounded-full bg-white px-3 py-1 text-xs font-medium text-slate-600 ring-1 ring-slate-200">
                    排课中 {activeCount}
                  </span>
                  <span className="rounded-full bg-white px-3 py-1 text-xs font-medium text-slate-600 ring-1 ring-slate-200">
                    Reference {phaseReferences.length}
                  </span>
                </div>
              </div>

              <div className="rounded-2xl border border-slate-200 bg-white px-4 py-4">
                <p className="text-xs font-medium uppercase tracking-[0.16em] text-slate-500">
                  今日来自本阶段
                </p>
                {phaseTasks.length > 0 ? (
                  <div className="mt-3 space-y-2">
                    {phaseTasks.slice(0, 4).map((task) => (
                      <div key={task.taskId} className="rounded-xl bg-slate-50 px-3 py-2 text-sm">
                        <p className="font-medium text-slate-950">
                          {task.actionLabel ?? "学习"} · {task.courseName}
                        </p>
                        <p className="mt-1 text-xs text-slate-500">
                          {(task.unitTitles?.length ? task.unitTitles : task.lectureTitles)
                            .slice(0, 2)
                            .join(" / ")}{" "}
                          · {task.estimatedMinutes} 分钟
                        </p>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="mt-3 text-sm text-slate-500">
                    今天没有从这个阶段抽取学习动作。
                  </p>
                )}
              </div>
            </div>

            <div className="mt-6 grid gap-5 xl:grid-cols-2">
              <div className="rounded-[28px] border border-slate-200 bg-slate-50/70 p-4">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="eyebrow">Learning</p>
                    <h3 className="mt-1 text-lg font-semibold text-slate-950">课程 / 学习内容</h3>
                  </div>
                  <span className="rounded-full bg-white px-3 py-1 text-xs font-medium text-slate-600 ring-1 ring-slate-200">
                    {phaseLearningCards.length} 项
                  </span>
                </div>
                <div className="mt-4 space-y-3">
                  {phaseLearningCards.length > 0 ? (
                    phaseLearningCards.map((card) => renderRoadmapCard(card, "learning"))
                  ) : (
                    <p className="rounded-2xl border border-dashed border-slate-300 bg-white px-4 py-5 text-sm text-slate-500">
                      这个阶段没有单独的课程/学习内容。
                    </p>
                  )}
                </div>
              </div>

              <div className="rounded-[28px] border border-teal-100 bg-teal-50/50 p-4">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="eyebrow text-teal-700">Build</p>
                    <h3 className="mt-1 text-lg font-semibold text-slate-950">项目阶段</h3>
                  </div>
                  <span className="rounded-full bg-white px-3 py-1 text-xs font-medium text-teal-700 ring-1 ring-teal-100">
                    {phaseProjectCards.length} 项
                  </span>
                </div>
                <div className="mt-4 space-y-3">
                  {phaseProjectCards.length > 0 ? (
                    phaseProjectCards.map((card) => renderRoadmapCard(card, "project"))
                  ) : (
                    <p className="rounded-2xl border border-dashed border-teal-200 bg-white px-4 py-5 text-sm text-teal-700">
                      这个阶段还没有对应项目；先完成左侧课程或等待后续路线补充。
                    </p>
                  )}
                </div>
              </div>
            </div>

            {phaseReferences.length > 0 ? (
              <div className="mt-5 rounded-2xl border border-slate-200 bg-white px-4 py-4">
                <p className="text-xs font-medium uppercase tracking-[0.16em] text-slate-500">
                  Reference / 路线说明
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  {phaseReferences.map((reference) => (
                    <Link
                      key={reference.id}
                      to={getCardDetailPath(reference)}
                      className="rounded-full bg-slate-50 px-3 py-1 text-xs font-medium text-slate-700 ring-1 ring-slate-200 transition hover:bg-white hover:text-slate-950"
                    >
                      {reference.title}
                    </Link>
                  ))}
                </div>
              </div>
            ) : null}
          </section>
        );
      })}

      <LearningItemFormModal
        open={isModalOpen}
        initialItem={editingItem}
        dependencyOptions={dependencyOptions}
        onClose={closeModal}
      />
    </div>
  );
}
