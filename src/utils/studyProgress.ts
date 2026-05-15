import type { LearningUnit, Lecture } from "../types";

type StudyProgressUnit = Pick<
  Lecture | LearningUnit,
  "completed" | "estimatedMinutes" | "progressMinutes" | "studySessions"
>;

export function getStudyUnitLoggedMinutes(unit: StudyProgressUnit) {
  const sessionMinutes = (unit.studySessions ?? []).reduce(
    (total, session) => total + Math.max(0, Math.round(session.minutes || 0)),
    0,
  );

  return Math.max(
    0,
    Math.round(Math.max(unit.progressMinutes ?? 0, sessionMinutes)),
  );
}

export function getStudyUnitProgressMinutes(unit: StudyProgressUnit) {
  if (unit.completed) {
    return unit.estimatedMinutes;
  }

  return Math.min(unit.estimatedMinutes, getStudyUnitLoggedMinutes(unit));
}

export function isStudyUnitAwaitingCompletion(unit: StudyProgressUnit) {
  return !unit.completed && getStudyUnitLoggedMinutes(unit) >= unit.estimatedMinutes;
}

export function getStudyUnitRemainingMinutes(unit: StudyProgressUnit) {
  if (unit.completed) {
    return 0;
  }

  const loggedMinutes = getStudyUnitLoggedMinutes(unit);
  if (loggedMinutes >= unit.estimatedMinutes) {
    return Math.max(1, unit.estimatedMinutes);
  }

  return Math.max(0, unit.estimatedMinutes - loggedMinutes);
}

export function sumStudyUnitRemainingMinutes(units: StudyProgressUnit[]) {
  return units.reduce((total, unit) => total + getStudyUnitRemainingMinutes(unit), 0);
}
