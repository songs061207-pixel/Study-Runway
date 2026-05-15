import {
  CoursePaceStatus,
  PriorityBreakdown,
  PriorityBreakdownItem,
  RiskLevel,
  UserCapacitySettings,
} from "../types";

export interface PriorityScoringInput {
  daysLeft: number;
  remainingUnits: number;
  totalUnits: number;
  remainingMinutes: number;
  recentDailyPace: number;
  requiredDailyPace: number;
  daysSinceLastStudy: number;
  difficulty: number;
  riskLevel: RiskLevel;
  impossibleToFinish: boolean;
  rawMinutesUntilDeadline: number;
  paceStatus: CoursePaceStatus;
  scheduleDebtBlocks: number;
  isHoldback: boolean;
}

function round(value: number) {
  return Math.round(value * 100) / 100;
}

function buildExplanation(items: PriorityBreakdownItem[]) {
  const strongestItems = [...items]
    .filter((item) => item.value !== 0)
    .sort((left, right) => Math.abs(right.value) - Math.abs(left.value))
    .slice(0, 2)
    .map((item) =>
      item.value < 0 ? `${item.label}（暂时后置）` : item.label,
    );

  if (strongestItems.length === 0) {
    return "当前没有明显的调度压力，保持节奏即可。";
  }

  if (strongestItems.length === 1) {
    return `这门课当前排序的主要原因是：${strongestItems[0]}。`;
  }

  return `这门课当前排序的主要原因是：${strongestItems[0]} + ${strongestItems[1]}。`;
}

export function buildPriorityBreakdown(
  input: PriorityScoringInput,
  settings: UserCapacitySettings,
): PriorityBreakdown {
  const deadlinePressure = round(
    Math.min(
      34,
      input.daysLeft < 0
        ? 34
        : 18 / Math.max(input.daysLeft + 1, 1) + Math.min(input.requiredDailyPace * 7, 12),
    ),
  );
  const backlogPressure = round(
    Math.min(
      24,
      (input.remainingMinutes / Math.max(input.rawMinutesUntilDeadline, 90)) * 18 +
        (input.remainingUnits / Math.max(input.totalUnits, 1)) * 6,
    ),
  );
  const paceLagPressure = round(
    Math.min(
      22,
      Math.max(0, input.requiredDailyPace - input.recentDailyPace) * 10 +
        (input.recentDailyPace === 0 && input.requiredDailyPace > 0 ? 4 : 0),
    ),
  );
  const neglectPenalty = input.isHoldback
    ? 0
    : round(Math.min(14, Math.max(0, input.daysSinceLastStudy - 1) * 2));
  const difficultyModifier = round((input.difficulty - 3) * 2.5);
  const highRiskBoost = settings.prioritizeHighRisk
    ? input.riskLevel === "overdue"
      ? 8
      : input.riskLevel === "high"
        ? 5
        : 0
    : 0;
  const feasibilityPenalty = input.impossibleToFinish ? 10 : 0;
  const behindTargetBoost = round(
    Math.min(
      16,
      Math.max(0, input.scheduleDebtBlocks) * (input.paceStatus === "rescue" ? 6 : 4),
    ),
  );
  const aheadOfSchedulePenalty = round(
    -Math.min(
      18,
      (input.isHoldback && input.scheduleDebtBlocks <= 0 ? 6 : 0) +
        Math.max(0, -input.scheduleDebtBlocks) * (input.isHoldback ? 6 : 3),
    ),
  );

  const items: PriorityBreakdownItem[] = [
    {
      key: "deadlinePressure",
      label: "系统目标压力",
      value: deadlinePressure,
      detail:
        input.daysLeft < 0
          ? "已经超过目标日，建议重排或调整容量。"
          : `距离系统目标还剩 ${Math.max(input.daysLeft, 0)} 天。`,
    },
    {
      key: "backlogPressure",
      label: "剩余任务压力",
      value: backlogPressure,
      detail: `还剩 ${input.remainingUnits} 节，预计 ${input.remainingMinutes} 分钟。`,
    },
    {
      key: "paceLagPressure",
      label: "当前速度落后",
      value: paceLagPressure,
      detail: `近 7 天 ${round(input.recentDailyPace)} 小时/天，按时完成需要 ${round(input.requiredDailyPace)} 小时/天。`,
    },
    {
      key: "neglectPenalty",
      label: "冷落惩罚",
      value: neglectPenalty,
      detail: input.isHoldback
        ? "这门课当前处于远期后置阶段，普通冷落惩罚暂不生效。"
        : `已经 ${input.daysSinceLastStudy} 天没有推进。`,
    },
    {
      key: "difficultyModifier",
      label: "难度修正",
      value: difficultyModifier,
      detail: `课程难度权重为 ${input.difficulty} / 5。`,
    },
    {
      key: "highRiskBoost",
      label: "高风险优先",
      value: highRiskBoost,
      detail: settings.prioritizeHighRisk
        ? "已开启高风险课程优先。"
        : "当前未启用额外高风险加权。",
    },
    {
      key: "feasibilityPenalty",
      label: "手动目标惩罚",
      value: feasibilityPenalty,
      detail: input.impossibleToFinish
        ? "手动锁定目标日过紧，即使压满容量也很难完成。"
        : "当前没有手动目标不可完成压力。",
    },
    {
      key: "behindTargetBoost",
      label: "落后本周目标",
      value: behindTargetBoost,
      detail:
        input.scheduleDebtBlocks > 0
          ? `这门课本周还差 ${input.scheduleDebtBlocks} 个学习块。`
          : "这门课本周没有落后周目标。",
    },
    {
      key: "aheadOfSchedulePenalty",
      label: "超前节奏惩罚",
      value: aheadOfSchedulePenalty,
      detail: input.isHoldback
        ? "这门课截止还远，系统会主动压后，避免过早学完。"
        : input.scheduleDebtBlocks < 0
          ? `这门课本周已经超前 ${Math.abs(input.scheduleDebtBlocks)} 个学习块。`
          : "当前没有超前推进惩罚。",
    },
  ];

  const total = round(
    Math.max(
      0,
      deadlinePressure +
        backlogPressure +
        paceLagPressure +
        neglectPenalty +
        difficultyModifier +
        highRiskBoost +
        feasibilityPenalty +
        behindTargetBoost +
        aheadOfSchedulePenalty,
    ),
  );

  return {
    total,
    deadlinePressure,
    backlogPressure,
    paceLagPressure,
    neglectPenalty,
    difficultyModifier,
    highRiskBoost,
    feasibilityPenalty,
    behindTargetBoost,
    aheadOfSchedulePenalty,
    explanation: buildExplanation(items),
    items,
  };
}
