import { getCourseImportPreset } from "./importPresets";
import {
  CourseCatalogEntry,
  getSeedCourseCatalogEntries,
} from "../catalog/courseCatalog";
import { CourseInput } from "../types";
import { addDays, getDateKey } from "../utils/date";

export const REQUESTED_COURSE_BUNDLE_VERSION =
  "2026-04-29-ai-prompting-for-everyone-v1";

export function getRequestedCourseSourceUrls() {
  return getSeedCourseCatalogEntries().map((entry) => new URL(entry.sourceUrl).toString());
}

export function getRequestedCourseCanonicalIds() {
  return getSeedCourseCatalogEntries().map((entry) => entry.canonicalId);
}

export function buildRequestedCourseInputs(now: Date = new Date()): CourseInput[] {
  return getSeedCourseCatalogEntries().flatMap((entry: CourseCatalogEntry) => {
    const preset = getCourseImportPreset(new URL(entry.sourceUrl));
    if (!preset) {
      return [];
    }

    return [
      {
        canonicalId: entry.canonicalId,
        name: preset.name,
        provider: preset.provider,
        totalUnits: preset.lectureTitles.length,
        lectureMinutes:
          entry.lectureMinutes
            ? entry.lectureMinutes
            : preset.lectureMinutes ?? 60,
        deadline: getDateKey(addDays(now, entry.deadlineOffsetDays)),
        deadlineMode: "auto",
        color: preset.color,
        difficulty: entry.difficulty,
        intensity: entry.intensity ?? "heavy",
        roadmapTrack: preset.roadmapTrack,
        roadmapPhase: preset.roadmapPhase,
        roadmapOrder: preset.roadmapOrder,
        roadmapRoute: preset.roadmapRoute,
        roadmapYear: preset.roadmapYear,
        roadmapStatus: preset.roadmapStatus,
        scheduleMode: preset.scheduleMode,
        notes: `${preset.notes}\n\nImported for your current study stack. You can follow the system-generated plan directly.`,
        sourceUrl: entry.sourceUrl,
        lectureTitlesText: preset.lectureTitles.join("\n"),
      },
    ];
  });
}


