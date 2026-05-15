import { LearningItem } from "../types";
import {
  buildRequestedLearningItems,
  learningResourcePresets,
  REQUESTED_LEARNING_RESOURCE_BUNDLE_VERSION,
} from "../data/resourcePresets";
import { normalizeLearningItems } from "./learningFactory";
import { migrateLegacyRoadmapLearningItems } from "./roadmapMigration";

const LEARNING_STORAGE_KEY = "study-runway:learning-items:v1";
const REQUESTED_LEARNING_FLAG_KEY =
  `study-runway:learning-seed:${REQUESTED_LEARNING_RESOURCE_BUNDLE_VERSION}`;
const REQUESTED_LEARNING_DISMISSALS_KEY =
  "study-runway:requested-learning-dismissals:v1";
const PHASE_ZERO_ROADMAP_REFERENCE_ID = "resource-roadmap-ai-ml";
const CODE_COMPLETE_ID = "resource-code-complete";
const CLRS_ID = "resource-clrs";
const CODE_TO_SILICON_ID = "resource-code-to-silicon-lab";
const GRAPHICS_FOUNDATIONS_LAB_ID = "resource-graphics-foundations-lab";
const NAND2TETRIS_ID = "resource-nand2tetris";
const SPATIAL_WORLD_LAB_ID = "resource-spatial-world-lab";
const NEURAL_RENDERING_LAB_ID = "resource-neural-rendering-lab";
const SLAM_STATE_ESTIMATION_LAB_ID = "resource-slam-state-estimation-lab";
const SPATIAL_AGENT_DEMO_ID = "resource-spatial-agent-demo";
const VISIONOS_SPATIAL_INTERFACE_ID = "resource-visionos-spatial-interface";
const WEEKLY_ALGORITHM_PRACTICE_ID = "resource-weekly-algorithm-practice";
const WEEKLY_ALGORITHM_PRACTICE_SOURCE_URL = "study-runway://weekly-algorithm-practice";
const LEGACY_CODE_COMPLETE_PART_TITLES = [
  "Part I - Laying the Foundation",
  "Part II - Creating High-Quality Code",
  "Part III - Variables",
  "Part IV - Statements",
  "Part V - Code Improvements",
  "Part VI - System Considerations",
  "Part VII - Software Craftsmanship",
];
const CODE_COMPLETE_PART_START_INDEXES = [0, 4, 9, 13, 19, 26, 30];
const LEGACY_CLRS_PART_TITLE = "Part I - Foundations and role of algorithms";

interface LearningStorageState {
  version: 1;
  updatedAt: string;
  itemOrder: string[];
  itemsById: Record<string, LearningItem>;
}

function isLearningStorageState(value: unknown): value is LearningStorageState {
  if (!value || typeof value !== "object") {
    return false;
  }

  const candidate = value as LearningStorageState;
  return (
    candidate.version === 1 &&
    Array.isArray(candidate.itemOrder) &&
    typeof candidate.itemsById === "object" &&
    candidate.itemsById !== null
  );
}

function mapStateToItems(state: LearningStorageState) {
  return state.itemOrder
    .map((itemId) => state.itemsById[itemId])
    .filter(Boolean);
}

function normalizeSourceKey(item: Pick<LearningItem, "id" | "sourceUrl" | "title">) {
  return item.sourceUrl?.trim() || item.id || item.title.trim();
}

function loadRequestedLearningKeys() {
  const requestedItems = buildRequestedLearningItems();

  return new Set(
    requestedItems.flatMap((item) => [item.id, normalizeSourceKey(item)]).filter(Boolean),
  );
}

function repairPhaseZeroLearningItems(items: LearningItem[]) {
  return items.map((item) => {
    if (item.id !== PHASE_ZERO_ROADMAP_REFERENCE_ID) {
      return item;
    }

    return {
      ...item,
      intensity: "light" as const,
      roadmapPhase: 0,
      roadmapOrder: 5,
      roadmapRoute: "ai-agent" as const,
      roadmapYear: 1 as const,
      roadmapStatus: "reference" as const,
      scheduleMode: "reference" as const,
    };
  });
}

function repairKnownLearningItemRoadmapPlacements(items: LearningItem[]) {
  return items.map((item) => {
    if (item.id === GRAPHICS_FOUNDATIONS_LAB_ID) {
      return {
        ...item,
        priority: 5,
        roadmapTrack: "spatial-intelligence-graphics",
        roadmapPhase: 2,
        roadmapOrder: 30,
        roadmapRoute: "spatial-interface" as const,
        roadmapYear: 1 as const,
        roadmapStatus: "backlog" as const,
        scheduleMode: "scheduled" as const,
        notes:
          "World Labs 前置工程能力：渲染管线、shader、rasterization、geometry、GPU pipeline 和 viewer 基础。期末后优先级高于继续扩展 FPGA/CPU 大项目。",
      } satisfies LearningItem;
    }

    if (item.id === SPATIAL_WORLD_LAB_ID) {
      return {
        ...item,
        priority: 5,
        roadmapTrack: "spatial-intelligence-worlds",
        roadmapPhase: 3,
        roadmapOrder: 10,
        roadmapRoute: "spatial-interface" as const,
        roadmapYear: 2 as const,
        roadmapStatus: "backlog" as const,
        scheduleMode: "scheduled" as const,
        notes:
          "World Labs 申请证据链核心项目：从相机几何、COLMAP/SfM、点云 viewer 到 Marble 使用/原理拆解，再到可复现的 Spatial World v1 demo。等 Phase 2 graphics 基础稳定后切 active，每周 1 个重学习块。",
      } satisfies LearningItem;
    }

    if (item.id === NEURAL_RENDERING_LAB_ID) {
      return {
        ...item,
        priority: 5,
        roadmapTrack: "spatial-intelligence-neural-rendering",
        roadmapPhase: 4,
        roadmapOrder: 20,
        roadmapRoute: "spatial-interface" as const,
        roadmapYear: 3 as const,
        roadmapStatus: "backlog" as const,
        scheduleMode: "scheduled" as const,
        notes:
          "NeRF / 3DGS / novel view synthesis 项目。等 Spatial World Lab 的 camera geometry 与 COLMAP viewer 完成后再激活，用于补齐 world model 的 3D 表示证据。",
      } satisfies LearningItem;
    }

    if (item.id === SLAM_STATE_ESTIMATION_LAB_ID) {
      return {
        ...item,
        priority: 4,
        roadmapTrack: "spatial-intelligence-slam",
        roadmapPhase: 4,
        roadmapOrder: 40,
        roadmapRoute: "robotics" as const,
        roadmapYear: 3 as const,
        roadmapStatus: "backlog" as const,
        scheduleMode: "scheduled" as const,
        notes:
          "视觉里程计、pose graph、状态估计和 SLAM 失败模式实验。排在 Neural Rendering 之后，作为 3D world model 的动态相机与状态估计补强。",
      } satisfies LearningItem;
    }

    if (item.id === SPATIAL_AGENT_DEMO_ID) {
      return {
        ...item,
        priority: 5,
        roadmapTrack: "spatial-intelligence-agent",
        roadmapPhase: 5,
        roadmapOrder: 20,
        roadmapRoute: "spatial-interface" as const,
        roadmapYear: 4 as const,
        roadmapStatus: "backlog" as const,
        scheduleMode: "scheduled" as const,
      } satisfies LearningItem;
    }

    if (item.id === VISIONOS_SPATIAL_INTERFACE_ID) {
      return {
        ...item,
        priority: 3,
        roadmapTrack: "spatial-interface",
        roadmapPhase: 4,
        roadmapOrder: 50,
        roadmapRoute: "spatial-interface" as const,
        roadmapYear: 3 as const,
        roadmapStatus: "backlog" as const,
        scheduleMode: "scheduled" as const,
      } satisfies LearningItem;
    }

    if (item.id === NAND2TETRIS_ID) {
      return {
        ...item,
        priority: 2,
        roadmapTrack: "project-practice",
        roadmapPhase: 2,
        roadmapOrder: 90,
        roadmapRoute: "foundation" as const,
        roadmapYear: 1 as const,
        roadmapStatus: "backlog" as const,
        scheduleMode: "scheduled" as const,
        notes:
          "CS50 后的计算机系统项目补强。它保留为远期/可选补强，不再作为 World Labs 申请证据主线；需要系统项目验收时再激活。",
      } satisfies LearningItem;
    }

    if (
      item.id === "resource-modern-robotics-book" &&
      item.roadmapTrack === "robotics-foundation" &&
      Math.round(item.roadmapPhase ?? -1) === 3 &&
      Math.round(item.roadmapOrder ?? -1) === 31
    ) {
      return {
        ...item,
        roadmapPhase: 4,
        roadmapOrder: 6,
        roadmapRoute: "robotics" as const,
        roadmapYear: 3 as const,
      } satisfies LearningItem;
    }

    return item;
  });
}

function isWeeklyAlgorithmPracticeItem(item: LearningItem) {
  return (
    item.id === WEEKLY_ALGORITHM_PRACTICE_ID ||
    item.sourceUrl === WEEKLY_ALGORITHM_PRACTICE_SOURCE_URL ||
    item.title.trim() === "算法题周训练"
  );
}

function repairWeeklyAlgorithmPractice(items: LearningItem[]) {
  return items.map((item) => {
    if (!isWeeklyAlgorithmPracticeItem(item)) {
      return item;
    }

    const weeklyTargetBlocks =
      Number.isFinite(item.weeklyTargetBlocks) && (item.weeklyTargetBlocks ?? 0) > 0
        ? Math.min(14, Math.max(1, Math.round(item.weeklyTargetBlocks ?? 4)))
        : 4;
    const weeklySpacingDays =
      Number.isFinite(item.weeklySpacingDays) && item.weeklySpacingDays != null
        ? Math.min(6, Math.max(0, Math.round(item.weeklySpacingDays)))
        : 1;

    return {
      ...item,
      intensity: "heavy" as const,
      estimatedMinutes: 120,
      roadmapTrack: "weekly-routine",
      roadmapPhase: 99,
      roadmapOrder: 0,
      roadmapRoute: "foundation" as const,
      roadmapYear: 4 as const,
      roadmapStatus: "active" as const,
      scheduleMode: "scheduled" as const,
      scheduleCadence: "weekly" as const,
      deadlineMode: "auto" as const,
      weeklyTargetBlocks,
      weeklySpacingDays,
      sourceUrl: WEEKLY_ALGORITHM_PRACTICE_SOURCE_URL,
      units: item.units.map((unit) => ({
        ...unit,
        estimatedMinutes: 120,
      })),
    };
  });
}

function repairCodeToSiliconLab(items: LearningItem[]) {
  return items.map((item) => {
    if (item.id !== CODE_TO_SILICON_ID) {
      return item;
    }

    return {
      ...item,
      intensity: "heavy" as const,
      estimatedMinutes: 120,
      priority: 3,
      roadmapTrack: "systems",
      roadmapPhase: 2,
      roadmapOrder: 36,
      roadmapRoute: "foundation" as const,
      roadmapYear: 1 as const,
      roadmapStatus: "active" as const,
      scheduleMode: "scheduled" as const,
      scheduleCadence: "weekly" as const,
      weeklyTargetBlocks: 1,
      weeklySpacingDays: 0,
      sourceUrl: "study-runway://code-to-silicon-lab",
      notes:
        "当前只保留每周 1 块的底层能力切片：优先做到解释器、字节码 VM 和小编译器。Arduino、CPU 模拟器、Logisim/FPGA 暂时作为 optional later，不抢 World Labs 3D 作品主线。",
      units: item.units.map((unit) => ({
        ...unit,
        estimatedMinutes: 120,
      })),
    } satisfies LearningItem;
  });
}

function getPresetUnitTitles(itemId: string) {
  return learningResourcePresets.find((preset) => preset.id === itemId)?.unitTitles ?? [];
}

function hasAnyUnitProgress(item: LearningItem) {
  return item.units.some(
    (unit) =>
      unit.completed ||
      unit.progressMinutes > 0 ||
      (unit.studySessions ?? []).length > 0 ||
      (unit.actualMinutes ?? 0) > 0 ||
      (unit.notes ?? "").trim().length > 0,
  );
}

function buildBlankUnit(item: LearningItem, title: string, index: number) {
  return {
    id: `${item.id}:unit-${index + 1}`,
    order: index + 1,
    title,
    estimatedMinutes: item.estimatedMinutes,
    progressMinutes: 0,
    studySessions: [],
    actualMinutes: null,
    completed: false,
    notes: "",
  };
}

function repairCodeCompleteUnits(item: LearningItem) {
  if (item.id !== CODE_COMPLETE_ID) {
    return item;
  }

  const presetTitles = getPresetUnitTitles(CODE_COMPLETE_ID);
  const legacyPartTitleSet = new Set(LEGACY_CODE_COMPLETE_PART_TITLES);
  const hasLegacyPartUnits =
    item.units.length === LEGACY_CODE_COMPLETE_PART_TITLES.length &&
    item.units.every((unit) => legacyPartTitleSet.has(unit.title));

  if (!hasLegacyPartUnits || presetTitles.length === 0) {
    return item;
  }

  const migratedUnits = presetTitles.map((title, index) => {
    const legacyPartIndex = CODE_COMPLETE_PART_START_INDEXES.indexOf(index);
    const legacyUnit = legacyPartIndex >= 0 ? item.units[legacyPartIndex] : undefined;

    if (!legacyUnit) {
      return buildBlankUnit(item, title, index);
    }

    return {
      ...legacyUnit,
      order: index + 1,
      title,
      notes: [
        legacyUnit.notes,
        hasAnyUnitProgress({ ...item, units: [legacyUnit] })
          ? `由旧粗粒度单元“${legacyUnit.title}”迁移，原记录分钟数已保留在本章。`
          : "",
      ]
        .filter(Boolean)
        .join("\n"),
    };
  });

  return {
    ...item,
    updatedAt: new Date().toISOString(),
    units: migratedUnits,
  };
}

function repairClrsFirstUnit(item: LearningItem) {
  if (item.id !== CLRS_ID || item.units[0]?.title !== LEGACY_CLRS_PART_TITLE) {
    return item;
  }

  const firstPresetTitle = getPresetUnitTitles(CLRS_ID)[0];
  if (!firstPresetTitle) {
    return item;
  }

  return {
    ...item,
    updatedAt: new Date().toISOString(),
    units: item.units.map((unit, index) =>
      index === 0
        ? {
            ...unit,
            title: firstPresetTitle,
          }
        : unit,
    ),
  };
}

function repairSpatialWorldLabUnits(item: LearningItem) {
  if (item.id !== SPATIAL_WORLD_LAB_ID) {
    return item;
  }

  const presetTitles = getPresetUnitTitles(SPATIAL_WORLD_LAB_ID);
  if (presetTitles.length === 0) {
    return item;
  }

  const existingTitles = new Set(item.units.map((unit) => unit.title.trim()).filter(Boolean));
  const missingTitles = presetTitles.filter((title) => !existingTitles.has(title.trim()));
  if (missingTitles.length === 0) {
    return item;
  }

  const nextUnits = [
    ...item.units,
    ...missingTitles.map((title, index) =>
      buildBlankUnit(item, title, item.units.length + index),
    ),
  ];

  return {
    ...item,
    updatedAt: new Date().toISOString(),
    units: nextUnits,
  };
}

function repairRequestedLearningUnits(items: LearningItem[]) {
  return items.map((item) =>
    repairSpatialWorldLabUnits(repairClrsFirstUnit(repairCodeCompleteUnits(item))),
  );
}

function prepareLearningItems(items: LearningItem[]) {
  return normalizeLearningItems(
    migrateLegacyRoadmapLearningItems(
      repairWeeklyAlgorithmPractice(
        repairCodeToSiliconLab(
          repairRequestedLearningUnits(
            repairKnownLearningItemRoadmapPlacements(repairPhaseZeroLearningItems(items)),
          ),
        ),
      ),
    ),
  );
}

function prepareLearningItemsForStorage(items: LearningItem[]) {
  return normalizeLearningItems(items);
}

function loadDismissedRequestedLearningKeys() {
  if (typeof window === "undefined") {
    return new Set<string>();
  }

  try {
    const rawValue = window.localStorage.getItem(REQUESTED_LEARNING_DISMISSALS_KEY);
    if (!rawValue) {
      return new Set<string>();
    }

    const parsedValue = JSON.parse(rawValue);
    if (!Array.isArray(parsedValue)) {
      return new Set<string>();
    }

    return new Set(parsedValue.filter((value): value is string => typeof value === "string"));
  } catch {
    return new Set<string>();
  }
}

function saveDismissedRequestedLearningKeys(keys: Iterable<string>) {
  if (typeof window === "undefined") {
    return;
  }

  const normalizedKeys = [...new Set([...keys].map((key) => key.trim()).filter(Boolean))]
    .sort((left, right) => left.localeCompare(right));

  if (normalizedKeys.length === 0) {
    try {
      window.localStorage.removeItem(REQUESTED_LEARNING_DISMISSALS_KEY);
    } catch (error) {
      console.warn("Unable to clear requested learning dismissals.", error);
    }
    return;
  }

  try {
    window.localStorage.setItem(
      REQUESTED_LEARNING_DISMISSALS_KEY,
      JSON.stringify(normalizedKeys),
    );
  } catch (error) {
    console.warn("Unable to persist requested learning dismissals.", error);
  }
}

export function rememberDismissedRequestedLearningItem(item: LearningItem) {
  const sourceKey = normalizeSourceKey(item);
  if (!sourceKey) {
    return;
  }

  const dismissedKeys = loadDismissedRequestedLearningKeys();
  dismissedKeys.add(sourceKey);
  dismissedKeys.add(item.id);
  saveDismissedRequestedLearningKeys(dismissedKeys);
}

export function ensureRequestedLearningItems(items: LearningItem[]) {
  if (typeof window === "undefined") {
    return prepareLearningItems(items);
  }

  const normalizedItems = prepareLearningItems(items);
  const hasSeedFlag = window.localStorage.getItem(REQUESTED_LEARNING_FLAG_KEY) === "1";
  const existingKeys = new Set(
    normalizedItems.flatMap((item) => [item.id, normalizeSourceKey(item)]).filter(Boolean),
  );
  const dismissedKeys = loadDismissedRequestedLearningKeys();
  const requestedItems = buildRequestedLearningItems().filter((item) => {
    const sourceKey = normalizeSourceKey(item);
    return (
      !existingKeys.has(item.id) &&
      !existingKeys.has(sourceKey) &&
      !dismissedKeys.has(item.id) &&
      !dismissedKeys.has(sourceKey)
    );
  });

  if (hasSeedFlag && requestedItems.length === 0) {
    return normalizedItems;
  }

  try {
    window.localStorage.setItem(REQUESTED_LEARNING_FLAG_KEY, "1");
  } catch (error) {
    console.warn("Unable to persist requested learning seed flag.", error);
  }

  if (requestedItems.length === 0) {
    return normalizedItems;
  }

  return prepareLearningItems([...normalizedItems, ...requestedItems]);
}

export function loadLearningItemsFromStorage(): LearningItem[] {
  if (typeof window === "undefined") {
    return [];
  }

  try {
    const rawValue = window.localStorage.getItem(LEARNING_STORAGE_KEY);
    if (!rawValue) {
      return [];
    }

    const parsedValue = JSON.parse(rawValue);
    if (!isLearningStorageState(parsedValue)) {
      return [];
    }

    return prepareLearningItems(mapStateToItems(parsedValue));
  } catch {
    return [];
  }
}

export function saveLearningItemsToStorage(items: LearningItem[]) {
  if (typeof window === "undefined") {
    return;
  }

  const normalizedItems = prepareLearningItemsForStorage(items);
  const payload: LearningStorageState = {
    version: 1,
    updatedAt: new Date().toISOString(),
    itemOrder: normalizedItems.map((item) => item.id),
    itemsById: Object.fromEntries(normalizedItems.map((item) => [item.id, item])),
  };

  try {
    window.localStorage.setItem(LEARNING_STORAGE_KEY, JSON.stringify(payload));
  } catch (error) {
    console.warn("Unable to persist learning items to localStorage.", error);
    return;
  }

  const requestedItems = buildRequestedLearningItems();
  const requestedKeys = loadRequestedLearningKeys();
  const hasAllRequestedItems = requestedItems.every((item) => {
    const sourceKey = normalizeSourceKey(item);
    return normalizedItems.some(
      (currentItem) =>
        currentItem.id === item.id || normalizeSourceKey(currentItem) === sourceKey,
    );
  });

  if (hasAllRequestedItems && requestedKeys.size > 0) {
    try {
      window.localStorage.setItem(REQUESTED_LEARNING_FLAG_KEY, "1");
    } catch (error) {
      console.warn("Unable to persist requested learning seed flag.", error);
    }
  }
}



