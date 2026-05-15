import { createContext, ReactNode, useContext, useEffect, useRef, useState } from "react";
import {
  Course,
  CourseInput,
  CourseSyllabusSyncResult,
  CourseTaskSuggestion,
  GoalStatus,
  Lecture,
  LearningItem,
  LearningItemInput,
  LearningUnit,
  ManualTaskMove,
  StudyGoal,
  StudyGoalInput,
  StudyTaskDecision,
  UserCapacitySettings,
} from "../types";
import {
  buildCourseFromInput,
  clampLectureMinutes,
  getCanonicalSyllabusPreview,
  normalizeCourses,
  syncCourseToCanonicalSyllabus,
} from "../utils/courseFactory";
import {
  buildLearningItemFromInput,
  normalizeLearningItems,
} from "../utils/learningFactory";
import { getDateKey } from "../utils/date";
import {
  buildStudyGoalFromInput,
  normalizeGoals,
  unlinkGoalItem as unlinkItemFromGoals,
} from "../utils/goalFactory";
import {
  ensureProjectGoalSeeds,
  loadGoalsFromStorage,
  saveGoalsToStorage,
} from "../utils/goalStorage";
import {
  ensureRequestedLearningItems,
  loadLearningItemsFromStorage,
  rememberDismissedRequestedLearningItem,
  saveLearningItemsToStorage,
} from "../utils/learningStorage";
import {
  ensureRequestedCourses,
  loadCoursesFromStorage,
  rememberDismissedRequestedCourse,
  rememberDismissedRequestedCourses,
  saveCoursesToStorage,
} from "../utils/storage";
import {
  DEFAULT_CAPACITY_SETTINGS,
  loadPlannerStateFromStorage,
  normalizePlannerSettings,
  savePlannerStateToStorage,
} from "../planner/plannerStorage";
import {
  buildDeadlineCalibrationFingerprint,
  calibrateStudyDeadlines,
  hasAppliedDeadlineCalibrationFingerprint,
  markDeadlineProfileApplied,
} from "../planner/deadlineCalibration";
import { MAX_STUDY_LOG_MINUTES, clampStudyMinutes } from "../utils/studyLimits";

interface CourseContextValue {
  courses: Course[];
  learningItems: LearningItem[];
  goals: StudyGoal[];
  plannerSettings: UserCapacitySettings;
  taskDecisions: StudyTaskDecision[];
  dayAdjustments: Record<string, number>;
  manualTaskMoves: ManualTaskMove[];
  lastReplanAt?: string;
  addCourse: (input: CourseInput) => void;
  updateCourse: (courseId: string, input: CourseInput) => void;
  deleteCourse: (courseId: string) => void;
  clearAllCourses: () => void;
  addLearningItem: (input: LearningItemInput) => void;
  updateLearningItem: (itemId: string, input: LearningItemInput) => void;
  deleteLearningItem: (itemId: string) => void;
  addGoal: (input: StudyGoalInput) => void;
  updateGoal: (goalId: string, input: StudyGoalInput) => void;
  deleteGoal: (goalId: string) => void;
  setGoalStatus: (goalId: string, status: GoalStatus) => void;
  toggleGoalChecklistItem: (goalId: string, checklistItemId: string) => void;
  linkGoalItem: (goalId: string, itemId: string) => void;
  unlinkGoalLinkedItem: (goalId: string, itemId: string) => void;
  toggleLearningUnitCompletion: (itemId: string, unitId: string) => void;
  logLearningUnitStudyTime: (itemId: string, unitId: string, minutes: number) => void;
  toggleLectureCompletion: (courseId: string, lectureId: string) => void;
  updateLecture: (courseId: string, lectureId: string, changes: Partial<Lecture>) => void;
  logLectureStudyTime: (courseId: string, lectureId: string, minutes: number) => void;
  updatePlannerSettings: (changes: Partial<UserCapacitySettings>) => void;
  recalibrateStudyDeadlines: () => number;
  setDayAdjustment: (date: string, level: number) => void;
  resetPlanAdjustments: () => void;
  touchReplan: () => void;
  moveStudyTask: (task: CourseTaskSuggestion, targetDate: string) => void;
  recordStudyTaskTime: (task: CourseTaskSuggestion, actualMinutes?: number) => void;
  skipStudyTask: (task: CourseTaskSuggestion) => void;
  syncCourseSyllabus: (courseId: string) => CourseSyllabusSyncResult;
}

const CourseContext = createContext<CourseContextValue | undefined>(undefined);

function upsertTaskDecision(
  currentDecisions: StudyTaskDecision[],
  nextDecision: StudyTaskDecision,
) {
  const filteredDecisions = currentDecisions.filter(
    (decision) => decision.taskId !== nextDecision.taskId,
  );

  return [...filteredDecisions, nextDecision].sort((left, right) =>
    left.date.localeCompare(right.date),
  );
}

function buildSegmentKey(segment: CourseTaskSuggestion["segments"][number]) {
  return `${segment.lectureId}:${segment.startMinute ?? 0}:${segment.endMinute ?? segment.minutes}`;
}

function getLoggedLectureMinutes(lecture: Lecture) {
  const sessionMinutes = (lecture.studySessions ?? []).reduce(
    (total, session) => total + Math.max(0, Math.round(session.minutes || 0)),
    0,
  );

  return Math.max(
    0,
    Math.round(Math.max(lecture.progressMinutes ?? 0, sessionMinutes)),
  );
}

function getRecordedLectureActualMinutes(lecture: Lecture) {
  const sessionMinutes = (lecture.studySessions ?? []).reduce(
    (total, session) => total + Math.max(0, Math.round(session.minutes || 0)),
    0,
  );
  const legacyMinutes =
    typeof lecture.actualMinutes === "number"
      ? Math.max(0, Math.round(lecture.actualMinutes || 0))
      : 0;

  return Math.max(sessionMinutes, legacyMinutes);
}

function addStudyMinutesToLecture(
  lecture: Lecture,
  minutes: number,
  dateKey: string,
) {
  const safeMinutes = Math.max(0, Math.round(minutes));
  if (safeMinutes <= 0) {
    return lecture;
  }

  const studySessions = [
    ...(lecture.studySessions ?? []),
    { date: dateKey, minutes: safeMinutes },
  ];

  return {
    ...lecture,
    progressMinutes: getLoggedLectureMinutes(lecture) + safeMinutes,
    studySessions,
    completed: lecture.completed,
    completedAt: lecture.completed ? lecture.completedAt || dateKey : undefined,
    actualMinutes: getRecordedLectureActualMinutes(lecture) + safeMinutes || null,
  };
}

function getLoggedLearningUnitMinutes(unit: LearningUnit) {
  const sessionMinutes = (unit.studySessions ?? []).reduce(
    (total, session) => total + Math.max(0, Math.round(session.minutes || 0)),
    0,
  );

  return Math.max(
    0,
    Math.round(Math.max(unit.progressMinutes ?? 0, sessionMinutes)),
  );
}

function getRecordedLearningUnitActualMinutes(unit: LearningUnit) {
  const sessionMinutes = (unit.studySessions ?? []).reduce(
    (total, session) => total + Math.max(0, Math.round(session.minutes || 0)),
    0,
  );
  const legacyMinutes =
    typeof unit.actualMinutes === "number"
      ? Math.max(0, Math.round(unit.actualMinutes || 0))
      : 0;

  return Math.max(sessionMinutes, legacyMinutes);
}

function addStudyMinutesToLearningUnit(
  unit: LearningUnit,
  minutes: number,
  dateKey: string,
) {
  const safeMinutes = Math.max(0, Math.round(minutes));
  if (safeMinutes <= 0) {
    return unit;
  }

  const studySessions = [
    ...(unit.studySessions ?? []),
    { date: dateKey, minutes: safeMinutes },
  ];

  return {
    ...unit,
    progressMinutes: getLoggedLearningUnitMinutes(unit) + safeMinutes,
    studySessions,
    completed: unit.completed,
    completedAt: unit.completed ? unit.completedAt || dateKey : undefined,
    actualMinutes: getRecordedLearningUnitActualMinutes(unit) + safeMinutes || null,
  };
}

function clampRecordedTaskMinutes(
  recordedMinutes: number | undefined,
  fallbackMinutes: number,
) {
  return clampStudyMinutes(recordedMinutes, fallbackMinutes, MAX_STUDY_LOG_MINUTES);
}

function buildTaskMinuteAllocations(
  course: Course,
  task: CourseTaskSuggestion,
  recordedMinutes: number,
) {
  const allocations = new Map<string, number>();
  const safeRecordedMinutes = clampRecordedTaskMinutes(recordedMinutes, task.estimatedMinutes);
  const orderedSegments = task.segments.filter(
    (segment) => segment.lectureId && Math.round(segment.minutes || 0) > 0,
  );

  function addAllocation(lectureId: string | undefined, minutes: number) {
    const safeLectureId = lectureId?.trim();
    const safeMinutes = Math.max(0, Math.round(minutes));
    if (!safeLectureId || safeMinutes <= 0) {
      return;
    }

    allocations.set(safeLectureId, (allocations.get(safeLectureId) ?? 0) + safeMinutes);
  }

  if (orderedSegments.length === 0) {
    const fallbackLectureId = task.lectureIds[0] ?? course.lectures[0]?.id;
    addAllocation(fallbackLectureId, safeRecordedMinutes);
    return allocations;
  }

  let remainingMinutes = safeRecordedMinutes;

  orderedSegments.forEach((segment) => {
    if (remainingMinutes <= 0) {
      return;
    }

    const plannedMinutes = Math.max(0, Math.round(segment.minutes || 0));
    const nextMinutes = Math.min(plannedMinutes, remainingMinutes);
    addAllocation(segment.lectureId, nextMinutes);
    remainingMinutes -= nextMinutes;
  });

  if (remainingMinutes <= 0) {
    return allocations;
  }

  const lastSegmentLectureId = orderedSegments[orderedSegments.length - 1]?.lectureId;
  const lastLectureIndex = course.lectures.findIndex(
    (lecture) => lecture.id === lastSegmentLectureId,
  );
  const overflowLectures =
    lastLectureIndex >= 0 ? course.lectures.slice(lastLectureIndex + 1) : [];

  overflowLectures.forEach((lecture) => {
    if (remainingMinutes <= 0) {
      return;
    }

    const loggedMinutes = getLoggedLectureMinutes(lecture);
    const estimatedRemainingMinutes = Math.max(1, lecture.estimatedMinutes - loggedMinutes);
    const nextMinutes = Math.min(estimatedRemainingMinutes, remainingMinutes);
    addAllocation(lecture.id, nextMinutes);
    remainingMinutes -= nextMinutes;
  });

  if (remainingMinutes > 0) {
    addAllocation(lastSegmentLectureId ?? task.lectureIds[0] ?? course.lectures[0]?.id, remainingMinutes);
  }

  return allocations;
}

function buildLearningItemTaskMinuteAllocations(
  item: LearningItem,
  task: CourseTaskSuggestion,
  recordedMinutes: number,
) {
  const allocations = new Map<string, number>();
  const safeRecordedMinutes = clampRecordedTaskMinutes(recordedMinutes, task.estimatedMinutes);
  const orderedSegments = task.segments.filter(
    (segment) => segment.lectureId && Math.round(segment.minutes || 0) > 0,
  );

  function addAllocation(unitId: string | undefined, minutes: number) {
    const safeUnitId = unitId?.trim();
    const safeMinutes = Math.max(0, Math.round(minutes));
    if (!safeUnitId || safeMinutes <= 0) {
      return;
    }

    allocations.set(safeUnitId, (allocations.get(safeUnitId) ?? 0) + safeMinutes);
  }

  if (orderedSegments.length === 0) {
    const fallbackUnitId = task.lectureIds[0] ?? item.units[0]?.id;
    addAllocation(fallbackUnitId, safeRecordedMinutes);
    return allocations;
  }

  let remainingMinutes = safeRecordedMinutes;

  orderedSegments.forEach((segment) => {
    if (remainingMinutes <= 0) {
      return;
    }

    const plannedMinutes = Math.max(0, Math.round(segment.minutes || 0));
    const nextMinutes = Math.min(plannedMinutes, remainingMinutes);
    addAllocation(segment.lectureId, nextMinutes);
    remainingMinutes -= nextMinutes;
  });

  if (remainingMinutes <= 0) {
    return allocations;
  }

  const lastSegmentUnitId = orderedSegments[orderedSegments.length - 1]?.lectureId;
  const lastUnitIndex = item.units.findIndex((unit) => unit.id === lastSegmentUnitId);
  const overflowUnits = lastUnitIndex >= 0 ? item.units.slice(lastUnitIndex + 1) : [];

  overflowUnits.forEach((unit) => {
    if (remainingMinutes <= 0) {
      return;
    }

    const loggedMinutes = getLoggedLearningUnitMinutes(unit);
    const estimatedRemainingMinutes = Math.max(1, unit.estimatedMinutes - loggedMinutes);
    const nextMinutes = Math.min(estimatedRemainingMinutes, remainingMinutes);
    addAllocation(unit.id, nextMinutes);
    remainingMinutes -= nextMinutes;
  });

  if (remainingMinutes > 0) {
    addAllocation(lastSegmentUnitId ?? task.lectureIds[0] ?? item.units[0]?.id, remainingMinutes);
  }

  return allocations;
}

function taskMoveOverlapsTask(taskMove: ManualTaskMove, task: CourseTaskSuggestion) {
  const movedSegmentKeys = new Set((taskMove.segments ?? []).map(buildSegmentKey));
  const taskSegmentKeys = new Set((task.segments ?? []).map(buildSegmentKey));

  for (const key of movedSegmentKeys) {
    if (taskSegmentKeys.has(key)) {
      return true;
    }
  }

  return false;
}

export function CourseProvider({ children }: { children: ReactNode }) {
  const plannerState = loadPlannerStateFromStorage();
  const initialStudyStateRef = useRef<{
    courses: Course[];
    learningItems: LearningItem[];
    goals: StudyGoal[];
  } | null>(null);

  if (initialStudyStateRef.current === null) {
    const initialCourses = ensureRequestedCourses(loadCoursesFromStorage());
    const initialLearningItems = ensureRequestedLearningItems(loadLearningItemsFromStorage());
    initialStudyStateRef.current = {
      courses: initialCourses,
      learningItems: initialLearningItems,
      goals: ensureProjectGoalSeeds(
        loadGoalsFromStorage(),
        initialCourses,
        initialLearningItems,
      ),
    };
  }

  const [courses, setCoursesState] = useState<Course[]>(() =>
    initialStudyStateRef.current?.courses ?? [],
  );
  const [learningItems, setLearningItemsState] = useState<LearningItem[]>(() =>
    initialStudyStateRef.current?.learningItems ?? [],
  );
  const [goals, setGoalsState] = useState<StudyGoal[]>(() =>
    initialStudyStateRef.current?.goals ?? [],
  );
  const [plannerSettings, setPlannerSettings] = useState<UserCapacitySettings>(
    plannerState.settings ?? DEFAULT_CAPACITY_SETTINGS,
  );
  const [taskDecisions, setTaskDecisions] = useState<StudyTaskDecision[]>(
    plannerState.taskDecisions ?? [],
  );
  const [dayAdjustments, setDayAdjustments] = useState<Record<string, number>>(
    plannerState.dayAdjustments ?? {},
  );
  const [manualTaskMoves, setManualTaskMoves] = useState<ManualTaskMove[]>(
    plannerState.manualTaskMoves ?? [],
  );
  const [lastReplanAt, setLastReplanAt] = useState<string | undefined>(
    plannerState.lastReplanAt,
  );
  const coursesRef = useRef(courses);
  const learningItemsRef = useRef(learningItems);
  const goalsRef = useRef(goals);

  function commitCourses(
    nextCoursesOrUpdater: Course[] | ((currentCourses: Course[]) => Course[]),
  ) {
    const nextCourses =
      typeof nextCoursesOrUpdater === "function"
        ? nextCoursesOrUpdater(coursesRef.current)
        : nextCoursesOrUpdater;
    coursesRef.current = nextCourses;
    saveCoursesToStorage(nextCourses);
    setCoursesState(nextCourses);
  }

  function commitLearningItems(
    nextItemsOrUpdater: LearningItem[] | ((currentItems: LearningItem[]) => LearningItem[]),
  ) {
    const nextItems =
      typeof nextItemsOrUpdater === "function"
        ? nextItemsOrUpdater(learningItemsRef.current)
        : nextItemsOrUpdater;
    learningItemsRef.current = nextItems;
    saveLearningItemsToStorage(nextItems);
    setLearningItemsState(nextItems);
  }

  function commitGoals(
    nextGoalsOrUpdater: StudyGoal[] | ((currentGoals: StudyGoal[]) => StudyGoal[]),
  ) {
    const nextGoals =
      typeof nextGoalsOrUpdater === "function"
        ? nextGoalsOrUpdater(goalsRef.current)
        : nextGoalsOrUpdater;
    const normalizedGoals = normalizeGoals(nextGoals);
    goalsRef.current = normalizedGoals;
    saveGoalsToStorage(normalizedGoals);
    setGoalsState(normalizedGoals);
  }

  function stampReplan() {
    setLastReplanAt(new Date().toISOString());
  }

  useEffect(() => {
    commitCourses((currentCourses) => ensureRequestedCourses(currentCourses));
  }, []);

  useEffect(() => {
    commitLearningItems((currentItems) => ensureRequestedLearningItems(currentItems));
  }, []);

  useEffect(() => {
    commitGoals((currentGoals) =>
      ensureProjectGoalSeeds(currentGoals, coursesRef.current, learningItemsRef.current),
    );
  }, [courses, learningItems]);

  useEffect(() => {
    const currentCourses = coursesRef.current;
    const currentLearningItems = learningItemsRef.current;
    const calibrationFingerprint = buildDeadlineCalibrationFingerprint(
      currentCourses,
      currentLearningItems,
      plannerSettings,
    );

    if (hasAppliedDeadlineCalibrationFingerprint(calibrationFingerprint)) {
      return;
    }

    const result = calibrateStudyDeadlines(
      currentCourses,
      currentLearningItems,
      plannerSettings,
    );
    markDeadlineProfileApplied(calibrationFingerprint);
    if (result.changedCount <= 0) {
      return;
    }

    commitCourses(normalizeCourses(result.courses));
    commitLearningItems(normalizeLearningItems(result.learningItems));
    stampReplan();
  }, [courses, learningItems, plannerSettings]);



  useEffect(() => {
    savePlannerStateToStorage({
      settings: plannerSettings,
      taskDecisions,
      dayAdjustments,
      manualTaskMoves,
      lastReplanAt,
    });
  }, [plannerSettings, taskDecisions, dayAdjustments, manualTaskMoves, lastReplanAt]);

  function addCourse(input: CourseInput) {
    commitCourses((currentCourses) => [...currentCourses, buildCourseFromInput(input)]);
    stampReplan();
  }

  function updateCourse(courseId: string, input: CourseInput) {
    commitCourses((currentCourses) =>
      currentCourses.map((course) =>
        course.id === courseId ? buildCourseFromInput(input, course) : course,
      ),
    );
    stampReplan();
  }

  function deleteCourse(courseId: string) {
    const deletedCourse = coursesRef.current.find((course) => course.id === courseId);
    if (deletedCourse) {
      rememberDismissedRequestedCourse(deletedCourse);
    }

    commitCourses((currentCourses) =>
      currentCourses.filter((course) => course.id !== courseId),
    );
    setTaskDecisions((currentDecisions) =>
      currentDecisions.filter((decision) => decision.courseId !== courseId),
    );
    setManualTaskMoves((currentMoves) =>
      currentMoves.filter((taskMove) => taskMove.courseId !== courseId),
    );
    commitGoals((currentGoals) => unlinkItemFromGoals(currentGoals, courseId));
    stampReplan();
  }

  function clearAllCourses() {
    rememberDismissedRequestedCourses(coursesRef.current);
    commitCourses([]);
    setTaskDecisions([]);
    setDayAdjustments({});
    setManualTaskMoves([]);
    stampReplan();
  }

  function addLearningItem(input: LearningItemInput) {
    commitLearningItems((currentItems) => [
      ...currentItems,
      buildLearningItemFromInput(input),
    ]);
    stampReplan();
  }

  function updateLearningItem(itemId: string, input: LearningItemInput) {
    commitLearningItems((currentItems) =>
      normalizeLearningItems(
        currentItems.map((item) =>
          item.id === itemId ? buildLearningItemFromInput(input, item) : item,
        ),
      ),
    );
    stampReplan();
  }

  function deleteLearningItem(itemId: string) {
    const deletedItem = learningItemsRef.current.find((item) => item.id === itemId);
    if (deletedItem) {
      rememberDismissedRequestedLearningItem(deletedItem);
    }

    commitLearningItems((currentItems) =>
      currentItems.filter((item) => item.id !== itemId),
    );
    setTaskDecisions((currentDecisions) =>
      currentDecisions.filter((decision) => decision.courseId !== itemId),
    );
    setManualTaskMoves((currentMoves) =>
      currentMoves.filter((taskMove) => taskMove.courseId !== itemId),
    );
    commitGoals((currentGoals) => unlinkItemFromGoals(currentGoals, itemId));
    stampReplan();
  }

  function addGoal(input: StudyGoalInput) {
    commitGoals((currentGoals) => [...currentGoals, buildStudyGoalFromInput(input)]);
  }

  function updateGoal(goalId: string, input: StudyGoalInput) {
    commitGoals((currentGoals) =>
      currentGoals.map((goal) =>
        goal.id === goalId ? buildStudyGoalFromInput(input, goal) : goal,
      ),
    );
  }

  function deleteGoal(goalId: string) {
    commitGoals((currentGoals) => currentGoals.filter((goal) => goal.id !== goalId));
  }

  function setGoalStatus(goalId: string, status: GoalStatus) {
    commitGoals((currentGoals) =>
      currentGoals.map((goal) =>
        goal.id === goalId
          ? {
              ...goal,
              status,
              updatedAt: new Date().toISOString(),
            }
          : goal,
      ),
    );
  }

  function toggleGoalChecklistItem(goalId: string, checklistItemId: string) {
    const todayKey = getDateKey(new Date());
    commitGoals((currentGoals) =>
      currentGoals.map((goal) => {
        if (goal.id !== goalId) {
          return goal;
        }

        return {
          ...goal,
          updatedAt: new Date().toISOString(),
          checklist: goal.checklist.map((item) => {
            if (item.id !== checklistItemId) {
              return item;
            }

            const completed = !item.completed;
            return {
              ...item,
              completed,
              completedAt: completed ? item.completedAt || todayKey : undefined,
            };
          }),
        };
      }),
    );
  }

  function linkGoalItem(goalId: string, itemId: string) {
    const safeItemId = itemId.trim();
    if (!safeItemId) {
      return;
    }

    commitGoals((currentGoals) =>
      currentGoals.map((goal) =>
        goal.id === goalId && !goal.linkedItemIds.includes(safeItemId)
          ? {
              ...goal,
              linkedItemIds: [...goal.linkedItemIds, safeItemId],
              updatedAt: new Date().toISOString(),
            }
          : goal,
      ),
    );
  }

  function unlinkGoalLinkedItem(goalId: string, itemId: string) {
    commitGoals((currentGoals) =>
      currentGoals.map((goal) =>
        goal.id === goalId
          ? {
              ...goal,
              linkedItemIds: goal.linkedItemIds.filter((linkedItemId) => linkedItemId !== itemId),
              updatedAt: new Date().toISOString(),
            }
          : goal,
      ),
    );
  }

  function toggleLearningUnitCompletion(itemId: string, unitId: string) {
    const todayKey = getDateKey(new Date());
    commitLearningItems((currentItems) =>
      normalizeLearningItems(
        currentItems.map((item) => {
          if (item.id !== itemId) {
            return item;
          }

          return {
            ...item,
            updatedAt: new Date().toISOString(),
            units: item.units.map((unit) => {
              if (unit.id !== unitId) {
                return unit;
              }

              const completed = !unit.completed;
              const loggedMinutes = getLoggedLearningUnitMinutes(unit);
              return {
                ...unit,
                progressMinutes: completed
                  ? Math.max(unit.estimatedMinutes, loggedMinutes)
                  : loggedMinutes,
                studySessions: unit.studySessions ?? [],
                completed,
                completedAt: completed ? unit.completedAt || todayKey : undefined,
                actualMinutes: unit.actualMinutes ?? null,
              };
            }),
          };
        }),
      ),
    );
    stampReplan();
  }

  function logLearningUnitStudyTime(itemId: string, unitId: string, minutes: number) {
    const safeMinutes = Number.isFinite(minutes)
      ? clampStudyMinutes(minutes, 0, MAX_STUDY_LOG_MINUTES)
      : 0;

    if (safeMinutes <= 0) {
      return;
    }

    const todayKey = getDateKey(new Date());
    commitLearningItems((currentItems) =>
      normalizeLearningItems(
        currentItems.map((item) => {
          if (item.id !== itemId) {
            return item;
          }

          return {
            ...item,
            updatedAt: new Date().toISOString(),
            units: item.units.map((unit) =>
              unit.id === unitId
                ? addStudyMinutesToLearningUnit(unit, safeMinutes, todayKey)
                : unit,
            ),
          };
        }),
      ),
    );
    stampReplan();
  }

  function toggleLectureCompletion(courseId: string, lectureId: string) {
    const todayKey = getDateKey(new Date());
    commitCourses((currentCourses) =>
      normalizeCourses(
        currentCourses.map((course) => {
          if (course.id !== courseId) {
            return course;
          }

          return {
            ...course,
            updatedAt: new Date().toISOString(),
            lectures: course.lectures.map((lecture) => {
              if (lecture.id !== lectureId) {
                return lecture;
              }

              const completed = !lecture.completed;
              const loggedMinutes = getLoggedLectureMinutes(lecture);
              return {
                ...lecture,
                progressMinutes: completed
                  ? Math.max(lecture.estimatedMinutes, loggedMinutes)
                  : loggedMinutes,
                studySessions: lecture.studySessions ?? [],
                completed,
                completedAt: completed ? lecture.completedAt || todayKey : undefined,
                actualMinutes: lecture.actualMinutes ?? null,
              };
            }),
          };
        }),
      ),
    );
    stampReplan();
  }

  function updateLecture(courseId: string, lectureId: string, changes: Partial<Lecture>) {
    commitCourses((currentCourses) =>
      normalizeCourses(
        currentCourses.map((course) => {
          if (course.id !== courseId) {
            return course;
          }

          return {
            ...course,
            updatedAt: new Date().toISOString(),
            lectures: course.lectures.map((lecture) => {
              if (lecture.id !== lectureId) {
                return lecture;
              }

              const nextLecture: Lecture = {
                ...lecture,
                ...changes,
                estimatedMinutes: clampLectureMinutes(
                  changes.estimatedMinutes ?? lecture.estimatedMinutes,
                ),
              };

              if (nextLecture.completed && !nextLecture.completedAt) {
                nextLecture.completedAt = getDateKey(new Date());
              }

              if (!nextLecture.completed) {
                nextLecture.completedAt = undefined;
                nextLecture.progressMinutes = getLoggedLectureMinutes(nextLecture);
              } else {
                nextLecture.progressMinutes = Math.max(
                  nextLecture.estimatedMinutes,
                  getLoggedLectureMinutes(nextLecture),
                );
              }

              return nextLecture;
            }),
          };
        }),
      ),
    );
    stampReplan();
  }

  function logLectureStudyTime(courseId: string, lectureId: string, minutes: number) {
    const safeMinutes = Number.isFinite(minutes)
      ? clampStudyMinutes(minutes, 0, MAX_STUDY_LOG_MINUTES)
      : 0;

    if (safeMinutes <= 0) {
      return;
    }

    const todayKey = getDateKey(new Date());
    commitCourses((currentCourses) =>
      normalizeCourses(
        currentCourses.map((course) => {
          if (course.id !== courseId) {
            return course;
          }

          return {
            ...course,
            updatedAt: new Date().toISOString(),
            lectures: course.lectures.map((lecture) =>
              lecture.id === lectureId
                ? addStudyMinutesToLecture(lecture, safeMinutes, todayKey)
                : lecture,
            ),
          };
        }),
      ),
    );
    stampReplan();
  }

  function updatePlannerSettings(changes: Partial<UserCapacitySettings>) {
    setPlannerSettings((currentSettings) =>
      normalizePlannerSettings({
        ...currentSettings,
        ...changes,
      }),
    );
    stampReplan();
  }

  function recalibrateStudyDeadlines() {
    const currentCourses = coursesRef.current;
    const currentLearningItems = learningItemsRef.current;
    const result = calibrateStudyDeadlines(
      currentCourses,
      currentLearningItems,
      plannerSettings,
    );
    markDeadlineProfileApplied(
      buildDeadlineCalibrationFingerprint(
        currentCourses,
        currentLearningItems,
        plannerSettings,
      ),
    );

    if (result.changedCount > 0) {
      commitCourses(normalizeCourses(result.courses));
      commitLearningItems(normalizeLearningItems(result.learningItems));
    }

    stampReplan();
    return result.changedCount;
  }

  function setDayAdjustment(date: string, level: number) {
    setDayAdjustments((currentAdjustments) => ({
      ...currentAdjustments,
      [date]: Math.min(1, Math.max(-1, Math.round(level))),
    }));
    stampReplan();
  }

  function resetPlanAdjustments() {
    setDayAdjustments({});
    setManualTaskMoves([]);
    stampReplan();
  }

  function touchReplan() {
    stampReplan();
  }

  function moveStudyTask(task: CourseTaskSuggestion, targetDate: string) {
    if (task.date === targetDate) {
      return;
    }

    setManualTaskMoves((currentMoves) => {
      const nextMoves = currentMoves.filter(
        (taskMove) => !taskMoveOverlapsTask(taskMove, task),
      );

      nextMoves.push({
        id: `move:${task.courseId}:${targetDate}:${Date.now()}`,
        courseId: task.courseId,
        itemId: task.itemId,
        sourceType: task.sourceType,
        unitIds: task.unitIds,
        actionType: task.actionType,
        sourceDate: task.date,
        targetDate,
        lectureIds: task.lectureIds,
        lectureTitles: task.lectureTitles,
        studyBlockCount: task.studyBlockCount,
        slotCount: task.slotCount,
        estimatedMinutes: task.estimatedMinutes,
        segments: task.segments,
        createdAt: new Date().toISOString(),
      });

      return nextMoves;
    });
    stampReplan();
  }

  function recordStudyTaskTime(task: CourseTaskSuggestion, actualMinutes?: number) {
    const todayKey = getDateKey(new Date());
    const recordedMinutes = clampRecordedTaskMinutes(actualMinutes, task.estimatedMinutes);

    if (task.sourceType === "learningItem") {
      commitLearningItems((currentItems) =>
        normalizeLearningItems(
          currentItems.map((item) => {
            if (item.id !== task.courseId) {
              return item;
            }

            const minuteAllocations = buildLearningItemTaskMinuteAllocations(
              item,
              task,
              recordedMinutes,
            );

            return {
              ...item,
              updatedAt: new Date().toISOString(),
              units: item.units.map((unit) => {
                const allocatedMinutes = minuteAllocations.get(unit.id) ?? 0;
                if (allocatedMinutes <= 0) {
                  return unit;
                }

                return addStudyMinutesToLearningUnit(unit, allocatedMinutes, todayKey);
              }),
            };
          }),
        ),
      );
    } else {
      commitCourses((currentCourses) =>
        normalizeCourses(
          currentCourses.map((course) => {
            if (course.id !== task.courseId) {
              return course;
            }

            const minuteAllocations = buildTaskMinuteAllocations(course, task, recordedMinutes);

            return {
              ...course,
              updatedAt: new Date().toISOString(),
              lectures: course.lectures.map((lecture) => {
                const allocatedMinutes = minuteAllocations.get(lecture.id) ?? 0;
                if (allocatedMinutes <= 0) {
                  return lecture;
                }

                return addStudyMinutesToLecture(lecture, allocatedMinutes, todayKey);
              }),
            };
          }),
        ),
      );
    }

    setTaskDecisions((currentDecisions) => {
      const existingDecision = currentDecisions.find(
        (decision) => decision.taskId === task.taskId,
      );
      const existingActualMinutes =
        existingDecision?.status === "completed"
          ? existingDecision.actualMinutes ?? existingDecision.estimatedMinutes ?? 0
          : 0;

      return upsertTaskDecision(currentDecisions, {
        taskId: task.taskId,
        courseId: task.courseId,
        itemId: task.itemId,
        sourceType: task.sourceType,
        unitIds: task.unitIds,
        actionType: task.actionType,
        date: task.date,
        status: "completed",
        decidedAt: new Date().toISOString(),
        unitCount: task.studyBlockCount,
        estimatedMinutes: task.estimatedMinutes,
        actualMinutes: existingActualMinutes + recordedMinutes,
      });
    });
    setManualTaskMoves((currentMoves) =>
      currentMoves.filter((taskMove) => !taskMoveOverlapsTask(taskMove, task)),
    );
  }

  function skipStudyTask(task: CourseTaskSuggestion) {
    setTaskDecisions((currentDecisions) =>
      upsertTaskDecision(currentDecisions, {
        taskId: task.taskId,
        courseId: task.courseId,
        itemId: task.itemId,
        sourceType: task.sourceType,
        unitIds: task.unitIds,
        actionType: task.actionType,
        date: task.date,
        status: "skipped",
        decidedAt: new Date().toISOString(),
        unitCount: task.studyBlockCount,
        estimatedMinutes: task.estimatedMinutes,
      }),
    );
    stampReplan();
  }

  function syncCourseSyllabus(courseId: string): CourseSyllabusSyncResult {
    const currentCourse = coursesRef.current.find((course) => course.id === courseId);
    if (!currentCourse) {
      return {
        status: "unsupported",
        message: "没有找到这门课程，无法同步目录。",
      };
    }

    const preview = getCanonicalSyllabusPreview(currentCourse);
    if (!preview) {
      return {
        status: "unsupported",
        message: "这门课程暂时没有可用的官方目录模板。",
      };
    }

    if (!preview.hasChanges) {
      return {
        status: "unchanged",
        preview,
        message: "这门课的目录已经和官方校验版本一致。",
      };
    }

    const syncedCourse = syncCourseToCanonicalSyllabus(currentCourse);
    if (!syncedCourse) {
      return {
        status: "unsupported",
        preview,
        message: "同步失败，请稍后再试。",
      };
    }

    commitCourses((currentCourses) =>
      normalizeCourses(
        currentCourses.map((course) =>
          course.id === courseId ? syncedCourse : course,
        ),
      ),
    );
    setManualTaskMoves((currentMoves) =>
      currentMoves.filter((taskMove) => taskMove.courseId !== courseId),
    );
    stampReplan();

    return {
      status: "synced",
      preview,
      message: `已同步到官方校验目录：${preview.currentUnits} 节 -> ${preview.canonicalUnits} 节，保留 ${preview.preservedCompletedUnits} 节已完成进度。`,
    };
  }

  return (
    <CourseContext.Provider
      value={{
        courses,
        learningItems,
        goals,
        plannerSettings,
        taskDecisions,
        dayAdjustments,
        manualTaskMoves,
        lastReplanAt,
        addCourse,
        updateCourse,
        deleteCourse,
        clearAllCourses,
        addLearningItem,
        updateLearningItem,
        deleteLearningItem,
        addGoal,
        updateGoal,
        deleteGoal,
        setGoalStatus,
        toggleGoalChecklistItem,
        linkGoalItem,
        unlinkGoalLinkedItem,
        toggleLearningUnitCompletion,
        logLearningUnitStudyTime,
        toggleLectureCompletion,
        updateLecture,
        logLectureStudyTime,
        updatePlannerSettings,
        recalibrateStudyDeadlines,
        setDayAdjustment,
        resetPlanAdjustments,
        touchReplan,
        moveStudyTask,
        recordStudyTaskTime,
        skipStudyTask,
        syncCourseSyllabus,
      }}
    >
      {children}
    </CourseContext.Provider>
  );
}

export function useCourseContext() {
  const context = useContext(CourseContext);

  if (!context) {
    throw new Error("useCourseContext must be used inside CourseProvider.");
  }

  return context;
}





