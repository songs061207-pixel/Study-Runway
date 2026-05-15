import { DeadlineMode, RoadmapScheduleMode, RoadmapStatus, ScheduleCadence } from "../types";
import { formatDateLong } from "./date";

interface ProjectedFinishLabelInput {
  scheduleMode: RoadmapScheduleMode;
  roadmapStatus?: RoadmapStatus;
  scheduleCadence: ScheduleCadence;
  deadlineMode: DeadlineMode;
  deadline: string;
  remainingMinutes: number;
}

export function formatProjectedFinishLabel(
  item: ProjectedFinishLabelInput,
  projectedFinishDate: string | undefined,
  isUnfinishedInPlan: boolean,
) {
  if (item.roadmapStatus === "archived") {
    return "历史归档";
  }
  if (item.roadmapStatus === "backlog") {
    return "待激活";
  }
  if (item.scheduleMode === "reference" || item.roadmapStatus === "reference") {
    return "仅参考";
  }
  if (item.scheduleCadence === "weekly") {
    return "每周固定";
  }
  if (item.remainingMinutes <= 0) {
    return "已完成";
  }
  if (isUnfinishedInPlan) {
    return projectedFinishDate
      ? `已排到 ${formatDateLong(projectedFinishDate)}`
      : "暂未完成推算";
  }
  if (projectedFinishDate) {
    return formatDateLong(projectedFinishDate);
  }

  return "等待排课";
}

export function formatSystemTargetLabel(item: ProjectedFinishLabelInput) {
  if (item.roadmapStatus === "archived") {
    return "历史归档";
  }
  if (item.roadmapStatus === "backlog") {
    return "待激活";
  }
  if (item.scheduleMode === "reference" || item.roadmapStatus === "reference") {
    return "不参与排课";
  }
  if (item.scheduleCadence === "weekly") {
    return "每周固定";
  }

  const prefix = item.deadlineMode === "manual" ? "锁定" : "自动";
  return `${prefix} ${formatDateLong(item.deadline)}`;
}

