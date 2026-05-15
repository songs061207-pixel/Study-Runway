import { Course, LearningItem, StudyGoal, StudyGoalInput } from "../types";
import { addDays, getDateKey } from "./date";
import { buildStudyGoalFromInput, normalizeGoals } from "./goalFactory";

const GOAL_STORAGE_KEY = "study-runway:goals:v1";
const GOAL_SEED_FLAG_KEY = "study-runway:goals-seed:world-labs-focus-v4";

const LEGACY_PROJECT_GOAL_SEED_IDS = new Set([
  "goal-seed-nand2tetris-quarter",
  "goal-seed-nand2tetris-month",
  "goal-seed-spatial-quarter",
  "goal-seed-spatial-week",
  "goal-core-study-runway-quarter",
  "goal-core-study-runway-month-execution-loop",
  "goal-core-study-runway-month-rag-notion",
  "goal-core-study-runway-week-current",
  "goal-core-jarvis-month-parser",
  "goal-core-jarvis-month-tools",
  "goal-core-jarvis-month-memory",
  "goal-core-spatial-month-architecture",
  "goal-core-spatial-month-input",
  "goal-core-spatial-month-demo",
  "goal-core-robot-month-simulation",
  "goal-core-robot-month-robotics-bridge",
  "goal-core-robot-month-xr-safety",
]);

interface GoalStorageState {
  version: 1;
  updatedAt: string;
  goalOrder: string[];
  goalsById: Record<string, StudyGoal>;
}

interface DateRange {
  startDate: string;
  endDate: string;
}

function isGoalStorageState(value: unknown): value is GoalStorageState {
  if (!value || typeof value !== "object") {
    return false;
  }

  const candidate = value as GoalStorageState;
  return (
    candidate.version === 1 &&
    Array.isArray(candidate.goalOrder) &&
    typeof candidate.goalsById === "object" &&
    candidate.goalsById !== null
  );
}

function mapStateToGoals(state: GoalStorageState) {
  return state.goalOrder.map((goalId) => state.goalsById[goalId]).filter(Boolean);
}

function getStartOfWeek(date: Date) {
  const nextDate = new Date(date);
  const day = nextDate.getDay();
  const offset = day === 0 ? -6 : 1 - day;
  nextDate.setDate(nextDate.getDate() + offset);
  return nextDate;
}

function getQuarterRange(referenceDate: Date, quarterOffset = 0): DateRange {
  const year = referenceDate.getFullYear();
  const quarterIndex = Math.floor(referenceDate.getMonth() / 3) + quarterOffset;
  const startDate = new Date(year, quarterIndex * 3, 1);
  const endDate = new Date(year, quarterIndex * 3 + 3, 0);

  return {
    startDate: getDateKey(startDate),
    endDate: getDateKey(endDate),
  };
}

function getMonthRange(quarter: DateRange, monthOffset = 0): DateRange {
  const [year, month] = quarter.startDate.split("-").map(Number);
  const startDate = new Date(year, month - 1 + monthOffset, 1);
  const endDate = new Date(year, month + monthOffset, 0);

  return {
    startDate: getDateKey(startDate),
    endDate: getDateKey(endDate),
  };
}

function getCurrentWeekRange(referenceDate = new Date()): DateRange {
  const weekStart = getStartOfWeek(referenceDate);

  return {
    startDate: getDateKey(weekStart),
    endDate: getDateKey(addDays(weekStart, 6)),
  };
}

function findLearningItem(
  learningItems: LearningItem[],
  predicate: (item: LearningItem) => boolean,
) {
  return learningItems.find(predicate);
}

function findCourse(courses: Course[], predicate: (course: Course) => boolean) {
  return courses.find(predicate);
}

function getCourseLinkId(
  courses: Course[],
  canonicalId: string,
  matcher: (course: Course) => boolean,
) {
  return findCourse(courses, matcher)?.id ?? canonicalId;
}

function getLearningItemLinkId(
  learningItems: LearningItem[],
  fallbackId: string,
  matcher: (item: LearningItem) => boolean,
) {
  return findLearningItem(learningItems, matcher)?.id ?? fallbackId;
}

function uniqueIds(ids: Array<string | undefined>) {
  return Array.from(new Set(ids.filter((id): id is string => Boolean(id))));
}

function hasSeedFlag() {
  if (typeof window === "undefined") {
    return true;
  }

  return window.localStorage.getItem(GOAL_SEED_FLAG_KEY) === "1";
}

function markSeeded() {
  if (typeof window === "undefined") {
    return;
  }

  try {
    window.localStorage.setItem(GOAL_SEED_FLAG_KEY, "1");
  } catch (error) {
    console.warn("Unable to persist goal seed flag.", error);
  }
}

function createSeedGoal(input: StudyGoalInput, id: string, existing?: StudyGoal) {
  return {
    ...buildStudyGoalFromInput(input, existing),
    id,
  } satisfies StudyGoal;
}

function buildCoreProjectGoalSeeds(
  courses: Course[],
  learningItems: LearningItem[],
  existingGoalsById: Map<string, StudyGoal>,
) {
  const currentQuarter = getQuarterRange(new Date(), 0);
  const jarvisQuarter = getQuarterRange(new Date(), 1);
  const spatialQuarter = getQuarterRange(new Date(), 3);
  const roboticsQuarter = getQuarterRange(new Date(), 6);
  const currentWeek = getCurrentWeekRange();

  const cs109Id = getCourseLinkId(
    courses,
    "stanford-cs109",
    (course) =>
      course.canonicalId === "stanford-cs109" ||
      course.name.toLowerCase().includes("cs109"),
  );
  const cs229Id = getCourseLinkId(
    courses,
    "stanford-cs229",
    (course) =>
      course.canonicalId === "stanford-cs229" ||
      course.name.toLowerCase().includes("cs229"),
  );
  const cs231nId = getCourseLinkId(
    courses,
    "stanford-cs231n",
    (course) =>
      course.canonicalId === "stanford-cs231n" ||
      course.name.toLowerCase().includes("cs231n"),
  );
  const ntuMlId = getCourseLinkId(
    courses,
    "ntu-ml-2026-spring",
    (course) =>
      course.canonicalId === "ntu-ml-2026-spring" ||
      course.name.toLowerCase().includes("machine learning 2026"),
  );
  const specDrivenId = getCourseLinkId(
    courses,
    "deeplearning-spec-driven-development",
    (course) =>
      course.canonicalId === "deeplearning-spec-driven-development" ||
      course.name.toLowerCase().includes("spec-driven"),
  );
  const retrievalId = getCourseLinkId(
    courses,
    "deeplearning-advanced-retrieval-chroma",
    (course) =>
      course.canonicalId === "deeplearning-advanced-retrieval-chroma" ||
      course.name.toLowerCase().includes("retrieval"),
  );
  const ragAgentsId = getCourseLinkId(
    courses,
    "nvidia-building-rag-agents",
    (course) =>
      course.canonicalId === "nvidia-building-rag-agents" ||
      course.name.toLowerCase().includes("rag agents"),
  );
  const buildWithAndrewId = getCourseLinkId(
    courses,
    "deeplearning-build-with-andrew",
    (course) =>
      course.canonicalId === "deeplearning-build-with-andrew" ||
      course.name.toLowerCase().includes("build with andrew"),
  );
  const threeJsId = getCourseLinkId(
    courses,
    "threejs-journey",
    (course) =>
      course.canonicalId === "threejs-journey" ||
      course.name.toLowerCase().includes("three.js"),
  );
  const modernRoboticsId = getCourseLinkId(
    courses,
    "modern-robotics-coursera",
    (course) =>
      course.canonicalId === "modern-robotics-coursera" ||
      course.name.toLowerCase().includes("modern robotics"),
  );
  const cs234Id = getCourseLinkId(
    courses,
    "stanford-cs234",
    (course) =>
      course.canonicalId === "stanford-cs234" ||
      course.name.toLowerCase().includes("cs234"),
  );
  const roboticManipulationId = getCourseLinkId(
    courses,
    "mit-robotic-manipulation",
    (course) =>
      course.canonicalId === "mit-robotic-manipulation" ||
      course.name.toLowerCase().includes("robotic manipulation"),
  );
  const roadmapReferenceId = getLearningItemLinkId(
    learningItems,
    "resource-roadmap-ai-ml",
    (item) => item.id === "resource-roadmap-ai-ml",
  );
  const spatialTrackId = getLearningItemLinkId(
    learningItems,
    "resource-spatial-intelligence-systems-track",
    (item) => item.id === "resource-spatial-intelligence-systems-track",
  );
  const marbleReferenceId = getLearningItemLinkId(
    learningItems,
    "resource-marble-world-model-reference",
    (item) => item.id === "resource-marble-world-model-reference",
  );
  const codeToSiliconId = getLearningItemLinkId(
    learningItems,
    "resource-code-to-silicon-lab",
    (item) => item.id === "resource-code-to-silicon-lab",
  );
  const graphicsLabId = getLearningItemLinkId(
    learningItems,
    "resource-graphics-foundations-lab",
    (item) => item.id === "resource-graphics-foundations-lab",
  );
  const spatialWorldLabId = getLearningItemLinkId(
    learningItems,
    "resource-spatial-world-lab",
    (item) => item.id === "resource-spatial-world-lab",
  );
  const neuralRenderingLabId = getLearningItemLinkId(
    learningItems,
    "resource-neural-rendering-lab",
    (item) => item.id === "resource-neural-rendering-lab",
  );
  const slamLabId = getLearningItemLinkId(
    learningItems,
    "resource-slam-state-estimation-lab",
    (item) => item.id === "resource-slam-state-estimation-lab",
  );
  const spatialAgentDemoId = getLearningItemLinkId(
    learningItems,
    "resource-spatial-agent-demo",
    (item) => item.id === "resource-spatial-agent-demo",
  );
  const visionOSId = getLearningItemLinkId(
    learningItems,
    "resource-visionos-spatial-interface",
    (item) =>
      item.id === "resource-visionos-spatial-interface" ||
      item.title.toLowerCase().includes("visionos"),
  );
  const modernRoboticsBookId = getLearningItemLinkId(
    learningItems,
    "resource-modern-robotics-book",
    (item) => item.id === "resource-modern-robotics-book",
  );
  const spinningUpId = getLearningItemLinkId(
    learningItems,
    "resource-spinning-up-deep-rl",
    (item) => item.id === "resource-spinning-up-deep-rl",
  );

  const studyRunwayLinks = uniqueIds([
    cs109Id,
    specDrivenId,
    retrievalId,
    ragAgentsId,
    roadmapReferenceId,
  ]);
  const worldLabsTrackLinks = uniqueIds([
    spatialTrackId,
    graphicsLabId,
    spatialWorldLabId,
    marbleReferenceId,
    neuralRenderingLabId,
    slamLabId,
    spatialAgentDemoId,
    cs229Id,
    cs231nId,
    ntuMlId,
  ]);
  const worldLabsPhase2Links = uniqueIds([
    codeToSiliconId,
    graphicsLabId,
    threeJsId,
    cs109Id,
  ]);
  const worldLabsPhase3Links = uniqueIds([
    spatialWorldLabId,
    marbleReferenceId,
    cs229Id,
    cs231nId,
    ntuMlId,
  ]);
  const jarvisLinks = uniqueIds([
    buildWithAndrewId,
    specDrivenId,
    ragAgentsId,
    retrievalId,
    roadmapReferenceId,
  ]);
  const evaluationLinks = uniqueIds([specDrivenId, retrievalId, ragAgentsId, roadmapReferenceId]);
  const spatialLinks = uniqueIds([visionOSId, threeJsId]);
  const roboticsLinks = uniqueIds([
    modernRoboticsId,
    modernRoboticsBookId,
    cs234Id,
    roboticManipulationId,
    spinningUpId,
  ]);

  const seeds: Array<[StudyGoalInput, string]> = [
    [
      {
        title: "World Labs / 3D World Model 申请主线",
        level: "quarter",
        startDate: currentQuarter.startDate,
        endDate: currentQuarter.endDate,
        status: "active",
        roadmapRoute: "spatial-interface",
        roadmapYear: 1,
        roadmapPhase: 0,
        linkedItemIds: worldLabsTrackLinks,
        checklistText: [
          "目标画像收敛为 3D World Model Research Engineer / 3D Product Engineer",
          "Roadmap 只围绕 3D reconstruction、graphics、neural rendering、SLAM 和 product pipeline 产出证据",
          "Jarvis、机器人、RL、FPGA 和 BCI 暂时降为远期/集成层",
          "每个项目阶段都必须留下 GitHub、demo、技术写作或失败分析",
        ].join("\n"),
        outcome:
          "把 Study Runway 从兴趣全集收敛成 World Labs / Marble / 3D AI 团队可读的证据生产线。",
        order: 0,
      },
      "goal-core-world-labs-track",
    ],
    [
      {
        title: "Phase 2 Evidence: Graphics + Code-to-Silicon v1",
        level: "month",
        parentGoalId: "goal-core-world-labs-track",
        startDate: getMonthRange(currentQuarter, 1).startDate,
        endDate: getMonthRange(currentQuarter, 1).endDate,
        status: "planned",
        roadmapRoute: "spatial-interface",
        roadmapYear: 1,
        roadmapPhase: 2,
        linkedItemIds: worldLabsPhase2Links,
        checklistText: [
          "Code-to-Silicon 只做到解释器、VM、小编译器 v1，不继续扩展 FPGA 大工程",
          "Graphics Foundations Lab 完成渲染管线、camera/projection、shader/GPU pipeline 笔记",
          "Three.js viewer 基础能支撑后续点云/3DGS/Marble demo 展示",
        ].join("\n"),
        outcome:
          "把 Phase 2 从单纯底层兴趣改成 3D world model 前置工程能力。",
        order: 2,
      },
      "goal-core-world-labs-phase2-evidence",
    ],
    [
      {
        title: "Phase 3 Evidence: Spatial World v1",
        level: "quarter",
        parentGoalId: "goal-core-world-labs-track",
        startDate: jarvisQuarter.startDate,
        endDate: jarvisQuarter.endDate,
        status: "planned",
        roadmapRoute: "spatial-interface",
        roadmapYear: 2,
        roadmapPhase: 3,
        linkedItemIds: worldLabsPhase3Links,
        checklistText: [
          "完成 camera geometry playground",
          "用手机照片/视频跑通 COLMAP 或同类 SfM 重建",
          "做一个 Three.js 点云/相机位姿 viewer",
          "拆解 Marble 输入、导出、失败模式和 world model 原理",
          "写一篇 Spatial World v1 技术报告",
        ].join("\n"),
        outcome:
          "产出 World Labs 最相关的第一块硬作品：从真实输入到 3D 世界表示与 viewer 的完整链路。",
        order: 3,
      },
      "goal-core-world-labs-spatial-world-v1",
    ],
    [
      {
        title: "Embodied Personal Agent / 类 AGI 机器人路线",
        level: "quarter",
        startDate: currentQuarter.startDate,
        endDate: currentQuarter.endDate,
        status: "paused",
        roadmapRoute: "ai-agent",
        roadmapYear: 1,
        roadmapPhase: 0,
        linkedItemIds: uniqueIds([...jarvisLinks, ...spatialLinks, ...roboticsLinks]),
        checklistText: [
          "Jarvis 负责理解、记忆、工具调用和行动",
          "Study Runway 作为学习执行与进度接口，不再作为当前主项目",
          "Spatial Command Center 承载空间协作界面",
          "Robot Control Sandbox 承载仿真和机器人控制闭环",
          "每个阶段都用评估任务证明系统真的更可靠",
        ].join("\n"),
        outcome:
          "长期目标保留，但当前阶段不作为主线；等 3D world model 作品链跑通后再作为集成层回来。",
        order: 1,
      },
      "goal-core-embodied-agent-roadmap",
    ],
    [
      {
        title: "Study Runway Adapter / 学习执行接口",
        level: "quarter",
        startDate: currentQuarter.startDate,
        endDate: currentQuarter.endDate,
        status: "completed",
        roadmapRoute: "ai-agent",
        roadmapYear: 1,
        roadmapPhase: 0,
        linkedItemIds: studyRunwayLinks,
        checklistText: [
          "保留当前排课、目标、学习库和完成时间推算能力",
          "只在 Jarvis 需要读取、解释或写入学习状态时继续维护",
          "避免把 Study Runway 重新扩成当前主项目",
        ].join("\n"),
        outcome:
          "Study Runway 已经作为成熟执行底座存在，后续主要作为 Jarvis 的学习状态 adapter。",
        order: 8,
      },
      "goal-core-study-runway-adapter",
    ],
    [
      {
        title: "Jarvis Core / Personal OS v1",
        level: "quarter",
        startDate: currentQuarter.startDate,
        endDate: currentQuarter.endDate,
        status: "paused",
        roadmapRoute: "ai-agent",
        roadmapYear: 1,
        roadmapPhase: 1,
        linkedItemIds: jarvisLinks,
        checklistText: [
          "能读取 Study Runway 今日计划、学习压力和 Roadmap 状态",
          "能读取 Notion 战略层，只同步近期 milestone",
          "能把自然语言请求转成结构化行动",
          "能调用至少一个本地工具并保留执行日志",
          "能记住偏好、失败原因和下一步计划",
        ].join("\n"),
        outcome:
          "Jarvis 暂停为未来集成层；当前只在需要解释 Study Runway 状态时做维护，不再作为主项目。",
        order: 10,
      },
      "goal-core-jarvis-quarter",
    ],
    [
      {
        title: "Jarvis 读取 Study Runway 与 Notion",
        level: "month",
        parentGoalId: "goal-core-jarvis-quarter",
        startDate: getMonthRange(currentQuarter, 0).startDate,
        endDate: getMonthRange(currentQuarter, 0).endDate,
        status: "paused",
        roadmapRoute: "ai-agent",
        roadmapYear: 1,
        roadmapPhase: 1,
        linkedItemIds: uniqueIds([specDrivenId, ragAgentsId, roadmapReferenceId, ...studyRunwayLinks]),
        checklistText: [
          "定义 Jarvis 可以读取的 Study Runway 状态结构",
          "能回答今天为什么排这些学习动作",
          "能从 Notion 找到当前终极路线、当前主线和 backlog 边界",
          "能生成一段不改数据的学习状态复盘",
        ].join("\n"),
        outcome: "让 Jarvis 先成为 Study Runway 和 Notion 的解释层，而不是直接乱改数据。",
        order: 11,
      },
      "goal-core-jarvis-month-study-runway-notion",
    ],
    [
      {
        title: "Jarvis 结构化行动与工具调用",
        level: "month",
        parentGoalId: "goal-core-jarvis-quarter",
        startDate: getMonthRange(currentQuarter, 1).startDate,
        endDate: getMonthRange(currentQuarter, 1).endDate,
        status: "paused",
        roadmapRoute: "ai-agent",
        roadmapYear: 1,
        roadmapPhase: 1,
        linkedItemIds: jarvisLinks,
        checklistText: [
          "定义 5-8 个真实任务意图",
          "把自然语言请求转成可检查的结构化命令",
          "接入至少一个本地文件、学习记录或 Notion 操作工具",
          "加入权限确认、错误处理和执行 trace",
        ].join("\n"),
        outcome: "Jarvis 开始处理真实任务，而不是停留在对话层。",
        order: 12,
      },
      "goal-core-jarvis-month-actions-tools",
    ],
    [
      {
        title: "Jarvis 记忆与反馈循环",
        level: "month",
        parentGoalId: "goal-core-jarvis-quarter",
        startDate: getMonthRange(currentQuarter, 2).startDate,
        endDate: getMonthRange(currentQuarter, 2).endDate,
        status: "paused",
        roadmapRoute: "ai-agent",
        roadmapYear: 1,
        roadmapPhase: 1,
        linkedItemIds: uniqueIds([retrievalId, ragAgentsId, roadmapReferenceId]),
        checklistText: [
          "保存任务历史、偏好和失败原因",
          "让 Jarvis 在下一次规划时使用这些偏好",
          "设计一组固定问题检查记忆是否真的有用",
        ].join("\n"),
        outcome: "让 Jarvis 从反馈里改进下一次行动。",
        order: 13,
      },
      "goal-core-jarvis-month-memory-feedback",
    ],
    [
      {
        title: "本周 Jarvis 最小可用动作",
        level: "week",
        parentGoalId: "goal-core-jarvis-month-study-runway-notion",
        startDate: currentWeek.startDate,
        endDate: currentWeek.endDate,
        status: "paused",
        roadmapRoute: "ai-agent",
        roadmapYear: 1,
        roadmapPhase: 1,
        linkedItemIds: jarvisLinks,
        checklistText: [
          "选一个真实请求：查今日计划、解释压力或生成复盘",
          "明确输入、读取的数据、输出和失败边界",
          "记录这次动作作为后续评估样例",
        ].join("\n"),
        outcome: "用一个真实动作开始构建 Jarvis，而不是先堆抽象框架。",
        order: 14,
      },
      "goal-core-jarvis-week-current",
    ],
    [
      {
        title: "Agent Evaluation & Memory Lab",
        level: "quarter",
        startDate: currentQuarter.startDate,
        endDate: currentQuarter.endDate,
        status: "paused",
        roadmapRoute: "ai-agent",
        roadmapYear: 1,
        roadmapPhase: 1,
        linkedItemIds: evaluationLinks,
        checklistText: [
          "建立固定测试集：Study Runway、Notion、文件、记忆、安全边界",
          "每次 Jarvis 改版后能比较是否更可靠",
          "记录成功率、失败原因和需要人工确认的点",
          "评估结果反过来驱动 Jarvis 的下一轮目标",
        ].join("\n"),
        outcome:
          "这是 Jarvis 的训练场和体检表，用来判断它是否真的变聪明、变可靠、变有用。",
        order: 20,
      },
      "goal-core-agent-evaluation-quarter",
    ],
    [
      {
        title: "Study Runway / Notion Benchmark Set",
        level: "month",
        parentGoalId: "goal-core-agent-evaluation-quarter",
        startDate: getMonthRange(currentQuarter, 0).startDate,
        endDate: getMonthRange(currentQuarter, 0).endDate,
        status: "paused",
        roadmapRoute: "ai-agent",
        roadmapYear: 1,
        roadmapPhase: 1,
        linkedItemIds: evaluationLinks,
        checklistText: [
          "列出 10 个 Study Runway 查询/解释任务",
          "列出 10 个 Notion 战略层检索/判断任务",
          "为每个任务写出期望行为和禁止行为",
        ].join("\n"),
        outcome: "先让评估系统覆盖当前最真实的 Jarvis 使用场景。",
        order: 21,
      },
      "goal-core-agent-evaluation-month-benchmark",
    ],
    [
      {
        title: "Spatial Command Center / visionOS",
        level: "quarter",
        startDate: spatialQuarter.startDate,
        endDate: spatialQuarter.endDate,
        status: "planned",
        roadmapRoute: "spatial-interface",
        roadmapYear: 3,
        roadmapPhase: 4,
        linkedItemIds: spatialLinks,
        checklistText: [
          "把空间界面定义成 Jarvis 和未来机器人状态的控制台",
          "visionOS 为主平台，Three.js 作为低成本原型层",
          "展示任务状态、学习进度、agent 状态或仿真状态",
          "空间交互必须服务真实协作，不做独立炫技项目",
        ].join("\n"),
        outcome: "为 embodied personal agent 提供空间协作和控制界面。",
        order: 30,
      },
      "goal-core-spatial-cockpit-quarter",
    ],
    [
      {
        title: "Robot Control Sandbox / XR 控制机器人",
        level: "quarter",
        startDate: roboticsQuarter.startDate,
        endDate: roboticsQuarter.endDate,
        status: "planned",
        roadmapRoute: "robotics",
        roadmapYear: 3,
        roadmapPhase: 5,
        linkedItemIds: roboticsLinks,
        checklistText: [
          "先在仿真或低风险设备里做控制闭环",
          "Modern Robotics / ROS 2 / RL / Manipulation 都服务同一个 sandbox",
          "Jarvis 负责目标理解和行动计划，控制系统负责执行和安全边界",
          "最后再接 XR/空间界面和真实设备",
        ].join("\n"),
        outcome: "把机器人路线收敛成一个可验证的控制系统，而不是零散课程堆叠。",
        order: 40,
      },
      "goal-core-robot-control-quarter",
    ],
    [
      {
        title: "Natural Input / BCI 研究分支",
        level: "month",
        startDate: getMonthRange(spatialQuarter, 0).startDate,
        endDate: getMonthRange(spatialQuarter, 0).endDate,
        status: "planned",
        roadmapRoute: "bci",
        roadmapYear: 3,
        roadmapPhase: 5,
        linkedItemIds: [],
        checklistText: [
          "先跟踪语音、视觉、手势等低成本自然输入",
          "BCI/EMG 只作为研究分支，不抢当前主线",
          "只有能服务 Jarvis、Spatial 或 Robot 时才升级为项目目标",
        ].join("\n"),
        outcome: "把 BCI/Natural Input 放在正确位置：先研究，后集成，不抢主线。",
        order: 50,
      },
      "goal-core-natural-input-bci-branch",
    ],
  ];

  return seeds.map(([input, id]) => createSeedGoal(input, id, existingGoalsById.get(id)));
}

function archiveLegacySeedGoals(goals: StudyGoal[]) {
  const now = new Date().toISOString();

  return goals.map((goal) => {
    if (!LEGACY_PROJECT_GOAL_SEED_IDS.has(goal.id)) {
      return goal;
    }

    return {
      ...goal,
      status: "archived" as const,
      updatedAt: now,
    };
  });
}

export function ensureProjectGoalSeeds(
  goals: StudyGoal[],
  courses: Course[],
  learningItems: LearningItem[],
) {
  const normalizedGoals = normalizeGoals(goals);
  if (hasSeedFlag()) {
    return normalizedGoals;
  }

  const existingGoalsById = new Map(normalizedGoals.map((goal) => [goal.id, goal]));
  const archivedLegacyGoals = archiveLegacySeedGoals(normalizedGoals);
  const seeds = buildCoreProjectGoalSeeds(courses, learningItems, existingGoalsById);
  const seedIds = new Set(seeds.map((goal) => goal.id));
  const retainedGoals = archivedLegacyGoals.filter((goal) => !seedIds.has(goal.id));

  markSeeded();
  return normalizeGoals([...retainedGoals, ...seeds]);
}

export function loadGoalsFromStorage() {
  if (typeof window === "undefined") {
    return [];
  }

  try {
    const rawValue = window.localStorage.getItem(GOAL_STORAGE_KEY);
    if (!rawValue) {
      return [];
    }

    const parsedValue = JSON.parse(rawValue);
    if (!isGoalStorageState(parsedValue)) {
      return [];
    }

    return normalizeGoals(mapStateToGoals(parsedValue));
  } catch {
    return [];
  }
}

export function saveGoalsToStorage(goals: StudyGoal[]) {
  if (typeof window === "undefined") {
    return;
  }

  const normalizedGoals = normalizeGoals(goals);
  const payload: GoalStorageState = {
    version: 1,
    updatedAt: new Date().toISOString(),
    goalOrder: normalizedGoals.map((goal) => goal.id),
    goalsById: Object.fromEntries(normalizedGoals.map((goal) => [goal.id, goal])),
  };

  try {
    window.localStorage.setItem(GOAL_STORAGE_KEY, JSON.stringify(payload));
  } catch (error) {
    console.warn("Unable to persist goals to localStorage.", error);
  }
}
