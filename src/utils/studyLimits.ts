export const MIN_STUDY_MINUTES = 1;
export const MAX_STUDY_UNIT_MINUTES = 720;
export const MAX_STUDY_LOG_MINUTES = 720;

export function clampStudyMinutes(
  value: number | undefined,
  fallbackMinutes: number,
  maxMinutes = MAX_STUDY_LOG_MINUTES,
) {
  const rawMinutes = Number.isFinite(value) ? Number(value) : fallbackMinutes;

  return Math.min(
    maxMinutes,
    Math.max(MIN_STUDY_MINUTES, Math.round(rawMinutes || fallbackMinutes || 1)),
  );
}
