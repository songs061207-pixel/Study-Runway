import {
  GoalLevel,
  GoalStatus,
  RoadmapRoute,
  RoadmapYear,
  StudyGoal,
  StudyGoalInput,
} from "../types";
import {
  normalizeRoadmapRoute,
  normalizeRoadmapYear,
} from "./roadmapMetadata";

export const GOAL_LEVELS: GoalLevel[] = ["quarter", "month", "week"];
export const GOAL_STATUSES: GoalStatus[] = [
  "planned",
  "active",
  "completed",
  "paused",
  "archived",
];

export const goalLevelLabels = {
  quarter: "季度目标",
  month: "月度里程碑",
  week: "周目标",
} satisfies Record<GoalLevel, string>;

export const goalStatusLabels = {
  planned: "计划中",
  active: "进行中",
  completed: "已完成",
  paused: "已暂停",
  archived: "历史归档",
} satisfies Record<GoalStatus, string>;

function createId(prefix: string) {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return `${prefix}-${crypto.randomUUID()}`;
  }

  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function normalizeGoalLevel(value?: string | null): GoalLevel {
  return GOAL_LEVELS.includes(value as GoalLevel) ? (value as GoalLevel) : "quarter";
}

export function normalizeGoalStatus(value?: string | null): GoalStatus {
  return GOAL_STATUSES.includes(value as GoalStatus) ? (value as GoalStatus) : "planned";
}

function normalizeDate(value?: string | null, fallback = "") {
  return value && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : fallback;
}

function normalizeOrder(value?: number | null) {
  if (!Number.isFinite(value ?? NaN)) {
    return 999;
  }

  return Math.max(0, Math.round(value ?? 999));
}

function normalizeLinkedItemIds(values?: string[] | null) {
  return Array.from(
    new Set((values ?? []).map((value) => value.trim()).filter(Boolean)),
  );
}

export function parseGoalChecklistText(input: string) {
  return input
    .split(/\r?\n/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function normalizeChecklist(
  existingChecklist: StudyGoal["checklist"] | undefined,
  checklistText: string,
) {
  const existingByTitle = new Map(
    (existingChecklist ?? []).map((item) => [item.title.trim(), item]),
  );

  return parseGoalChecklistText(checklistText).map((title) => {
    const existing = existingByTitle.get(title);
    return {
      id: existing?.id ?? createId("goal-check"),
      title,
      completed: Boolean(existing?.completed),
      completedAt: existing?.completed ? existing.completedAt : undefined,
    };
  });
}

export function getGoalChecklistText(goal: Pick<StudyGoal, "checklist">) {
  return goal.checklist.map((item) => item.title).join("\n");
}

export function buildStudyGoalFromInput(
  input: StudyGoalInput,
  existing?: StudyGoal,
): StudyGoal {
  const now = new Date().toISOString();
  const startDate = normalizeDate(input.startDate, existing?.startDate ?? "");
  const endDate = normalizeDate(input.endDate, existing?.endDate ?? startDate);

  return {
    id: existing?.id ?? createId("goal"),
    title: input.title.trim() || "未命名目标",
    level: normalizeGoalLevel(input.level),
    parentGoalId: input.parentGoalId?.trim() || undefined,
    startDate,
    endDate: endDate < startDate ? startDate : endDate,
    status: normalizeGoalStatus(input.status),
    roadmapRoute: normalizeRoadmapRoute(input.roadmapRoute),
    roadmapYear: normalizeRoadmapYear(input.roadmapYear, input.roadmapPhase),
    roadmapPhase:
      input.roadmapPhase == null || !Number.isFinite(input.roadmapPhase)
        ? undefined
        : Math.max(0, Math.round(input.roadmapPhase)),
    linkedItemIds: normalizeLinkedItemIds(input.linkedItemIds),
    checklist: normalizeChecklist(existing?.checklist, input.checklistText),
    outcome: input.outcome.trim(),
    order: normalizeOrder(input.order ?? existing?.order),
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
  };
}

export function makeStudyGoalInputFromGoal(goal: StudyGoal): StudyGoalInput {
  return {
    title: goal.title,
    level: goal.level,
    parentGoalId: goal.parentGoalId,
    startDate: goal.startDate,
    endDate: goal.endDate,
    status: normalizeGoalStatus(goal.status),
    roadmapRoute: normalizeRoadmapRoute(goal.roadmapRoute),
    roadmapYear: normalizeRoadmapYear(goal.roadmapYear, goal.roadmapPhase),
    roadmapPhase: goal.roadmapPhase,
    linkedItemIds: normalizeLinkedItemIds(goal.linkedItemIds),
    checklistText: getGoalChecklistText(goal),
    outcome: goal.outcome,
    order: normalizeOrder(goal.order),
  };
}

export function normalizeGoals(goals: StudyGoal[]) {
  const normalizedGoals = goals
    .filter((goal): goal is StudyGoal => Boolean(goal?.id))
    .map((goal) =>
      buildStudyGoalFromInput(
        {
          title: goal.title,
          level: goal.level,
          parentGoalId: goal.parentGoalId,
          startDate: goal.startDate,
          endDate: goal.endDate,
          status: goal.status,
          roadmapRoute: goal.roadmapRoute,
          roadmapYear: goal.roadmapYear,
          roadmapPhase: goal.roadmapPhase,
          linkedItemIds: goal.linkedItemIds,
          checklistText: getGoalChecklistText(goal),
          outcome: goal.outcome,
          order: goal.order,
        },
        goal,
      ),
    );
  const existingGoalIds = new Set(normalizedGoals.map((goal) => goal.id));

  return normalizedGoals
    .map((goal) => ({
      ...goal,
      parentGoalId:
        goal.parentGoalId && existingGoalIds.has(goal.parentGoalId)
          ? goal.parentGoalId
          : undefined,
    }))
    .sort((left, right) => {
      if (left.level !== right.level) {
        return GOAL_LEVELS.indexOf(left.level) - GOAL_LEVELS.indexOf(right.level);
      }
      if (left.startDate !== right.startDate) {
        return left.startDate.localeCompare(right.startDate);
      }
      if (left.order !== right.order) {
        return left.order - right.order;
      }
      return left.title.localeCompare(right.title);
    });
}

export function unlinkGoalItem(goals: StudyGoal[], itemId: string) {
  return normalizeGoals(
    goals.map((goal) => ({
      ...goal,
      linkedItemIds: goal.linkedItemIds.filter((linkedItemId) => linkedItemId !== itemId),
    })),
  );
}

