import type {
  RoadmapRoute,
  RoadmapScheduleMode,
  RoadmapStatus,
  RoadmapYear,
} from "../types";

export const ROADMAP_ROUTES: RoadmapRoute[] = [
  "foundation",
  "ai-agent",
  "spatial-interface",
  "robotics",
  "bci",
  "career",
];

export const ROADMAP_STATUSES: RoadmapStatus[] = [
  "active",
  "backlog",
  "reference",
  "archived",
];

export const roadmapRouteLabels = {
  foundation: "Foundation",
  "ai-agent": "AI Agent",
  "spatial-interface": "Spatial Interface",
  robotics: "Robotics",
  bci: "BCI",
  career: "Career",
} satisfies Record<RoadmapRoute, string>;

export const roadmapStatusLabels = {
  active: "主线执行",
  backlog: "待激活",
  reference: "Reference",
  archived: "历史归档",
} satisfies Record<RoadmapStatus, string>;

interface RoadmapLike {
  roadmapTrack?: string | null;
  roadmapPhase?: number | null;
  roadmapRoute?: string | null;
  roadmapYear?: number | null;
  roadmapStatus?: string | null;
  scheduleMode?: RoadmapScheduleMode | string | null;
}

function normalizeText(value?: string | null) {
  return value?.trim().toLowerCase() ?? "";
}

export function normalizeRoadmapRoute(value?: string | null): RoadmapRoute {
  return ROADMAP_ROUTES.includes(value as RoadmapRoute)
    ? (value as RoadmapRoute)
    : "foundation";
}

export function inferRoadmapRouteFromTrack(track?: string | null): RoadmapRoute {
  const normalizedTrack = normalizeText(track);

  if (
    normalizedTrack.includes("spatial") ||
    normalizedTrack.includes("visionos") ||
    normalizedTrack.includes("xr") ||
    normalizedTrack.includes("three")
  ) {
    return "spatial-interface";
  }

  if (
    normalizedTrack.includes("robot") ||
    normalizedTrack.includes("embodied") ||
    normalizedTrack.includes("rl-robotics")
  ) {
    return "robotics";
  }

  if (
    normalizedTrack.includes("bci") ||
    normalizedTrack.includes("brain") ||
    normalizedTrack.includes("neuro")
  ) {
    return "bci";
  }

  if (
    normalizedTrack.includes("career") ||
    normalizedTrack.includes("intern") ||
    normalizedTrack.includes("opportunity")
  ) {
    return "career";
  }

  if (
    normalizedTrack.includes("ai") ||
    normalizedTrack.includes("ml") ||
    normalizedTrack.includes("rag") ||
    normalizedTrack.includes("agent") ||
    normalizedTrack.includes("learning")
  ) {
    return "ai-agent";
  }

  return "foundation";
}

export function inferRoadmapYearFromPhase(phase?: number | null): RoadmapYear {
  const normalizedPhase =
    typeof phase === "number" && Number.isFinite(phase) ? Math.round(phase) : 99;

  if (normalizedPhase <= 2) {
    return 1;
  }
  if (normalizedPhase === 3) {
    return 2;
  }
  if (normalizedPhase <= 5) {
    return 3;
  }
  return 4;
}

export function normalizeRoadmapYear(
  value?: number | null,
  phase?: number | null,
): RoadmapYear {
  if (typeof value === "number" && Number.isFinite(value)) {
    const normalizedValue = Math.round(value);
    if (normalizedValue >= 1 && normalizedValue <= 4) {
      return normalizedValue as RoadmapYear;
    }
  }

  return inferRoadmapYearFromPhase(phase);
}

export function normalizeRoadmapStatus(
  value?: string | null,
  scheduleMode?: RoadmapScheduleMode | string | null,
  phase?: number | null,
): RoadmapStatus {
  if (value === "archived") {
    return "archived";
  }
  if (value === "reference") {
    return "reference";
  }
  if (scheduleMode === "reference") {
    return "reference";
  }
  if (value === "active" || value === "backlog") {
    return value;
  }

  return inferRoadmapYearFromPhase(phase) === 1 ? "active" : "backlog";
}

export function getRoadmapRoute(item: RoadmapLike): RoadmapRoute {
  return normalizeRoadmapRoute(
    item.roadmapRoute ?? inferRoadmapRouteFromTrack(item.roadmapTrack),
  );
}

export function getRoadmapYear(item: RoadmapLike): RoadmapYear {
  return normalizeRoadmapYear(item.roadmapYear, item.roadmapPhase);
}

export function getRoadmapStatus(item: RoadmapLike): RoadmapStatus {
  return normalizeRoadmapStatus(
    item.roadmapStatus,
    item.scheduleMode,
    item.roadmapPhase,
  );
}

export function isRoadmapActiveScheduled(item: RoadmapLike) {
  return getRoadmapStatus(item) === "active" && item.scheduleMode === "scheduled";
}

export function shouldShowInDefaultLibrary(item: RoadmapLike) {
  return getRoadmapStatus(item) !== "archived";
}

export function scheduleModeForRoadmapStatus(
  status: RoadmapStatus,
  scheduleMode?: RoadmapScheduleMode | string | null,
): RoadmapScheduleMode {
  if (status === "reference" || status === "archived") {
    return "reference";
  }

  return scheduleMode === "reference" ? "reference" : "scheduled";
}
