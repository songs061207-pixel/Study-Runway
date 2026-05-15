import { PriorityBreakdown } from "../../types";

interface PriorityBreakdownPreviewProps {
  breakdown: PriorityBreakdown;
  title?: string;
  className?: string;
}

export function PriorityBreakdownPreview({
  breakdown,
  title = "为什么这样排",
  className = "",
}: PriorityBreakdownPreviewProps) {
  const visibleItems = [...breakdown.items]
    .filter((item) => item.value > 0)
    .sort((left, right) => right.value - left.value)
    .slice(0, 3);

  if (visibleItems.length === 0) {
    return (
      <div className={`rounded-2xl border border-slate-200 bg-white/70 p-4 ${className}`.trim()}>
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
          {title}
        </p>
        <p className="mt-2 text-sm text-slate-600">{breakdown.explanation}</p>
      </div>
    );
  }

  return (
    <div className={`rounded-2xl border border-slate-200 bg-white/70 p-4 ${className}`.trim()}>
      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
        {title}
      </p>
      <p className="mt-2 text-sm text-slate-700">{breakdown.explanation}</p>
      <div className="mt-3 flex flex-wrap gap-2">
        {visibleItems.map((item) => {
          const isPenalty = item.value < 0;
          const toneClasses = isPenalty
            ? "border-rose-200 bg-rose-50 text-rose-700"
            : "border-slate-200 bg-slate-50 text-slate-600";
          const valueLabel = `${item.value > 0 ? "+" : ""}${item.value}`;

          return (
            <div
              key={item.key}
              className={`rounded-full border px-3 py-2 text-xs ${toneClasses}`}
              title={item.detail}
            >
              <span className="font-semibold text-slate-950">{item.label}</span>
              <span className="ml-2">{valueLabel}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
