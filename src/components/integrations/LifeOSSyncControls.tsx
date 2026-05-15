import { useMemo, useState } from "react";
import { buildStudyRunwayLifeOSSummary, syncStudyRunwaySummary } from "../../integrations/lifeos";
import { DashboardSummary, PlannerSnapshot } from "../../types";

interface LifeOSSyncControlsProps {
  snapshot: PlannerSnapshot;
  dashboardSummary: DashboardSummary;
  lastReplanAt?: string;
}

type SyncState = "idle" | "syncing" | "success" | "error";

const messageStyles: Record<SyncState, string> = {
  idle: "text-slate-500",
  syncing: "text-slate-500",
  success: "text-emerald-700",
  error: "text-rose-700",
};

function formatTime(value: string) {
  return new Intl.DateTimeFormat("zh-CN", {
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

export function LifeOSSyncControls({
  snapshot,
  dashboardSummary,
  lastReplanAt,
}: LifeOSSyncControlsProps) {
  const [syncState, setSyncState] = useState<SyncState>("idle");
  const [message, setMessage] = useState("把今日学习主线同步到 LifeOS。");

  const summary = useMemo(
    () =>
      buildStudyRunwayLifeOSSummary({
        snapshot,
        dashboardSummary,
        lastReplanAt,
      }),
    [dashboardSummary, lastReplanAt, snapshot],
  );

  async function handleSync() {
    setSyncState("syncing");
    setMessage("正在把最新学习摘要推送到 LifeOS...");

    try {
      const result = await syncStudyRunwaySummary(summary);
      const syncedAt = result.stored?.updated_at || new Date().toISOString();
      setSyncState("success");
      setMessage(`已同步到 LifeOS · ${formatTime(syncedAt)}`);
    } catch (error) {
      setSyncState("error");
      setMessage(
        error instanceof Error ? `同步失败：${error.message}` : "同步失败：未知错误",
      );
    }
  }

  return (
    <div className="flex flex-col gap-2 sm:items-end">
      <button
        type="button"
        onClick={handleSync}
        disabled={syncState === "syncing"}
        className="rounded-full border border-slate-200 px-5 py-3 text-sm font-medium text-slate-700 transition hover:border-slate-300 hover:text-slate-950 disabled:cursor-not-allowed disabled:opacity-70"
      >
        {syncState === "syncing" ? "同步中..." : "同步到 LifeOS"}
      </button>
      <p className={`text-xs ${messageStyles[syncState]}`}>{message}</p>
    </div>
  );
}
