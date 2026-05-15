import { RiskLevel } from "../../types";
import { RISK_THEME } from "../../utils/courseMetrics";

export function RiskBadge({
  level,
  className = "",
}: {
  level: RiskLevel;
  className?: string;
}) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold ${RISK_THEME[level].badgeClassName} ${className}`.trim()}
    >
      {RISK_THEME[level].label}
    </span>
  );
}
