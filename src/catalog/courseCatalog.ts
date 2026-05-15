import type { Course, CourseIntensity } from "../types";

export interface CourseCatalogEntry {
  canonicalId: string;
  sourceUrl: string;
  deadlineOffsetDays: number;
  difficulty: number;
  lectureMinutes?: number;
  intensity?: CourseIntensity;
  legacyIds?: string[];
  matchers?: string[];
}

function normalizeUrl(value?: string) {
  if (!value) {
    return "";
  }

  try {
    return new URL(value).toString().toLowerCase();
  } catch {
    return value.trim().toLowerCase();
  }
}

function normalizeSearchText(value?: string) {
  let decodedValue = value ?? "";
  try {
    decodedValue = decodeURIComponent(decodedValue);
  } catch {
    decodedValue = value ?? "";
  }

  return decodedValue
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function buildCourseSearchText(course: Course) {
  return normalizeSearchText(
    [
      course.id,
      course.canonicalId,
      course.name,
      course.provider,
      course.sourceUrl,
    ]
      .filter(Boolean)
      .join(" "),
  );
}

function isCatalogMatcherBoundary(value?: string) {
  return !value || !/[a-z0-9]/.test(value);
}

function includesCatalogMatcher(text: string, matcher?: string) {
  const normalizedMatcher = normalizeSearchText(matcher);
  if (!normalizedMatcher) {
    return false;
  }

  let matchIndex = text.indexOf(normalizedMatcher);
  while (matchIndex !== -1) {
    const before = text[matchIndex - 1];
    const after = text[matchIndex + normalizedMatcher.length];
    if (isCatalogMatcherBoundary(before) && isCatalogMatcherBoundary(after)) {
      return true;
    }

    matchIndex = text.indexOf(normalizedMatcher, matchIndex + 1);
  }

  return false;
}

export const COURSE_CATALOG: CourseCatalogEntry[] = [
  {
    canonicalId: "mit-8-01-1x",
    sourceUrl: "https://openlearninglibrary.mit.edu/courses/course-v1:MITx+8.01.1x+3T2018/about",
    deadlineOffsetDays: 71,
    difficulty: 4,
    lectureMinutes: 120,
    intensity: "heavy",
    legacyIds: ["course-mechanics"],
    matchers: [
      "mechanics: kinematics and dynamics",
      "classical mechanics",
      "8-01sc-classical-mechanics",
      "8.01.1x",
      "mitx+8.01.1x",
    ],
  },
  {
    canonicalId: "mit-18-06sc",
    sourceUrl: "https://openlearninglibrary.mit.edu/courses/course-v1:OCW+18.06SC+2T2019/about",
    deadlineOffsetDays: 84,
    difficulty: 4,
    lectureMinutes: 120,
    intensity: "heavy",
    legacyIds: ["course-linear-algebra"],
    matchers: ["linear algebra", "18-06sc-linear-algebra", "18.06sc", "ocw+18.06sc"],
  },
  {
    canonicalId: "harvard-cs50x",
    sourceUrl: "https://cs50.harvard.edu/x/",
    deadlineOffsetDays: 112,
    difficulty: 3,
    legacyIds: ["course-cs50x"],
    matchers: ["cs50x", "cs50.harvard.edu/x"],
  },
  {
    canonicalId: "stanford-cs231n",
    sourceUrl: "https://cs231n.stanford.edu/",
    deadlineOffsetDays: 84,
    difficulty: 5,
    legacyIds: ["course-cs231n"],
    matchers: ["cs231n", "cs231n.stanford.edu"],
  },
  {
    canonicalId: "mit-18-01-1x",
    sourceUrl: "https://openlearninglibrary.mit.edu/courses/course-v1:MITx+18.01.1x+2T2019/about",
    deadlineOffsetDays: 98,
    difficulty: 4,
    lectureMinutes: 120,
    intensity: "heavy",
    matchers: [
      "calculus 1a: differentiation",
      "18.01.1x",
      "mitx+18.01.1x",
    ],
  },
  {
    canonicalId: "mit-18-01-2x",
    sourceUrl: "https://openlearninglibrary.mit.edu/courses/course-v1:MITx+18.01.2x+3T2019/about",
    deadlineOffsetDays: 112,
    difficulty: 4,
    lectureMinutes: 120,
    intensity: "heavy",
    matchers: ["calculus 1b: integration", "18.01.2x", "mitx+18.01.2x"],
  },
  {
    canonicalId: "mit-18-01-3x",
    sourceUrl: "https://openlearninglibrary.mit.edu/courses/course-v1:MITx+18.01.3x+1T2020/about",
    deadlineOffsetDays: 126,
    difficulty: 4,
    lectureMinutes: 120,
    intensity: "heavy",
    matchers: ["calculus 1c", "coordinate systems and infinite series", "18.01.3x", "mitx+18.01.3x"],
  },
  {
    canonicalId: "mit-18-02-1x",
    sourceUrl: "https://mitxonline.mit.edu/courses/course-v1:MITxT+18.02.1x/",
    deadlineOffsetDays: 150,
    difficulty: 4,
    lectureMinutes: 120,
    intensity: "heavy",
    matchers: ["multivariable calculus 1", "18.02.1x", "mitxt+18.02.1x"],
  },
  {
    canonicalId: "mit-18-02-2x",
    sourceUrl: "https://mitxonline.mit.edu/courses/course-v1:MITxT+18.02.2x/",
    deadlineOffsetDays: 165,
    difficulty: 4,
    lectureMinutes: 120,
    intensity: "heavy",
    matchers: ["multivariable calculus 2", "18.02.2x", "mitxt+18.02.2x"],
  },
  {
    canonicalId: "mit-18-02-3x",
    sourceUrl: "https://mitxonline.mit.edu/courses/course-v1:MITxT+18.02.3x/",
    deadlineOffsetDays: 180,
    difficulty: 4,
    lectureMinutes: 120,
    intensity: "heavy",
    matchers: ["multivariable calculus 3", "18.02.3x", "mitxt+18.02.3x"],
  },
  {
    canonicalId: "mit-8-01-2x",
    sourceUrl: "https://openlearninglibrary.mit.edu/courses/course-v1:MITx+8.01.2x+3T2018/about",
    deadlineOffsetDays: 90,
    difficulty: 4,
    lectureMinutes: 120,
    intensity: "heavy",
    matchers: ["mechanics: momentum and energy", "8.01.2x", "mitx+8.01.2x"],
  },
  {
    canonicalId: "mit-8-01-3x",
    sourceUrl: "https://openlearninglibrary.mit.edu/courses/course-v1:MITx+8.01.3x+1T2019/about",
    deadlineOffsetDays: 105,
    difficulty: 4,
    lectureMinutes: 120,
    intensity: "heavy",
    matchers: ["mechanics: rotational dynamics", "8.01.3x", "mitx+8.01.3x"],
  },
  {
    canonicalId: "mit-8-01-4x",
    sourceUrl: "https://openlearninglibrary.mit.edu/courses/course-v1:MITx+8.01.4x+1T2019/about",
    deadlineOffsetDays: 120,
    difficulty: 4,
    lectureMinutes: 120,
    intensity: "heavy",
    matchers: ["mechanics: simple harmonic motion", "8.01.4x", "mitx+8.01.4x"],
  },
  {
    canonicalId: "mit-8-02-1x",
    sourceUrl: "https://openlearninglibrary.mit.edu/courses/course-v1:MITx+8.02.1x+1T2019/about",
    deadlineOffsetDays: 135,
    difficulty: 4,
    lectureMinutes: 120,
    intensity: "heavy",
    matchers: ["electricity and magnetism: electrostatics", "electrostatics", "8.02.1x", "mitx+8.02.1x"],
  },
  {
    canonicalId: "mit-8-02-2x",
    sourceUrl: "https://openlearninglibrary.mit.edu/courses/course-v1:MITx+8.02.2x+2T2018/about",
    deadlineOffsetDays: 150,
    difficulty: 4,
    lectureMinutes: 120,
    intensity: "heavy",
    matchers: ["electricity and magnetism: magnetic fields and forces", "magnetic fields and forces", "8.02.2x", "mitx+8.02.2x"],
  },
  {
    canonicalId: "mit-8-02-3x",
    sourceUrl: "https://openlearninglibrary.mit.edu/courses/course-v1:MITx+8.02.3x+1T2019/about",
    deadlineOffsetDays: 165,
    difficulty: 4,
    lectureMinutes: 120,
    intensity: "heavy",
    matchers: ["electricity and magnetism: maxwell", "maxwell's equations", "8.02.3x", "mitx+8.02.3x"],
  },
  {
    canonicalId: "usaco-guide",
    sourceUrl: "https://usaco.guide/general/using-this-guide",
    deadlineOffsetDays: 140,
    difficulty: 5,
    matchers: ["usaco guide", "usaco.guide"],
  },
  {
    canonicalId: "berkeley-science-of-happiness",
    sourceUrl: "https://learning.edx.org/course/course-v1:BerkeleyX+GG101x+3T2025/home?audit_mode=",
    deadlineOffsetDays: 70,
    difficulty: 2,
    lectureMinutes: 60,
    intensity: "light",
    matchers: ["science of happiness", "gg101x"],
  },
  {
    canonicalId: "deeplearning-ai-for-everyone",
    sourceUrl: "https://www.deeplearning.ai/courses/ai-for-everyone/",
    deadlineOffsetDays: 35,
    difficulty: 2,
    lectureMinutes: 15,
    intensity: "light",
    matchers: ["ai for everyone", "ai-for-everyone"],
  },
  {
    canonicalId: "deeplearning-ai-prompting-for-everyone",
    sourceUrl: "https://learn.deeplearning.ai/courses/ai-prompting-for-everyone/",
    deadlineOffsetDays: 21,
    difficulty: 1,
    lectureMinutes: 10,
    intensity: "light",
    matchers: [
      "ai prompting for everyone",
      "ai-prompting-for-everyone",
      "the ai novice and the ai power user",
    ],
  },
  {
    canonicalId: "deeplearning-build-with-andrew",
    sourceUrl: "https://learn.deeplearning.ai/courses/build-with-andrew/information",
    deadlineOffsetDays: 14,
    difficulty: 1,
    lectureMinutes: 10,
    intensity: "light",
    matchers: ["build with andrew", "build-with-andrew"],
  },
  {
    canonicalId: "threejs-journey",
    sourceUrl: "https://threejs-journey.com/",
    deadlineOffsetDays: 140,
    difficulty: 3,
    lectureMinutes: 80,
    intensity: "light",
    matchers: ["three.js journey", "threejs-journey.com"],
  },
  {
    canonicalId: "ntu-ml-2026-spring",
    sourceUrl: "https://speech.ee.ntu.edu.tw/~hylee/ml/2026-spring.php",
    deadlineOffsetDays: 55,
    difficulty: 5,
    lectureMinutes: 120,
    intensity: "heavy",
    matchers: ["machine learning 2026 spring", "ntu", "hylee/ml/2026-spring"],
  },
  {
    canonicalId: "ali-lifeos",
    sourceUrl: "https://lab.aliabdaal.com/c/lifeos",
    deadlineOffsetDays: 60,
    difficulty: 2,
    lectureMinutes: 30,
    intensity: "light",
    matchers: ["lifeos", "ali abdaal"],
  },
  {
    canonicalId: "deeplearning-spec-driven-development",
    sourceUrl: "https://learn.deeplearning.ai/courses/spec-driven-development-with-coding-agents/",
    deadlineOffsetDays: 35,
    difficulty: 2,
    intensity: "light",
    matchers: ["spec-driven development", "spec-driven-development-with-coding-agents"],
  },
  {
    canonicalId: "deeplearning-advanced-retrieval-chroma",
    sourceUrl: "https://www.deeplearning.ai/short-courses/advanced-retrieval-for-ai/",
    deadlineOffsetDays: 70,
    difficulty: 3,
    intensity: "light",
    matchers: ["advanced retrieval for ai", "advanced-retrieval-for-ai"],
  },
  {
    canonicalId: "nvidia-building-rag-agents",
    sourceUrl: "https://learn.nvidia.com/courses/course-detail?course_id=course-v1:DLI+S-FX-15+V1",
    deadlineOffsetDays: 100,
    difficulty: 4,
    intensity: "heavy",
    matchers: ["building rag agents", "dli+s-fx-15"],
  },
  {
    canonicalId: "stanford-cs146s-modern-software-developer",
    sourceUrl: "https://themodernsoftware.dev/",
    deadlineOffsetDays: 120,
    difficulty: 4,
    intensity: "heavy",
    matchers: ["cs146s", "modern software developer", "themodernsoftware.dev"],
  },
  {
    canonicalId: "stanford-cs109",
    sourceUrl: "https://web.stanford.edu/class/cs109/",
    deadlineOffsetDays: 140,
    difficulty: 4,
    lectureMinutes: 120,
    intensity: "heavy",
    matchers: ["cs109", "probability for computer scientists"],
  },
  {
    canonicalId: "stanford-cs229",
    sourceUrl: "https://cs229.stanford.edu/",
    deadlineOffsetDays: 170,
    difficulty: 5,
    lectureMinutes: 120,
    intensity: "heavy",
    matchers: ["cs229", "machine learning"],
  },
  {
    canonicalId: "modern-robotics-coursera",
    sourceUrl: "https://www.coursera.org/specializations/modernrobotics",
    deadlineOffsetDays: 190,
    difficulty: 5,
    lectureMinutes: 120,
    intensity: "heavy",
    matchers: ["modern robotics", "specializations/modernrobotics"],
  },
  {
    canonicalId: "stanford-cs234",
    sourceUrl: "https://web.stanford.edu/class/cs234/",
    deadlineOffsetDays: 160,
    difficulty: 5,
    lectureMinutes: 120,
    intensity: "heavy",
    matchers: ["cs234", "reinforcement learning"],
  },
  {
    canonicalId: "mit-robotic-manipulation",
    sourceUrl: "https://manipulation.csail.mit.edu/",
    deadlineOffsetDays: 210,
    difficulty: 5,
    lectureMinutes: 120,
    intensity: "heavy",
    matchers: ["robotic manipulation", "manipulation.csail.mit.edu"],
  },
];

export function getSeedCourseCatalogEntries() {
  return COURSE_CATALOG;
}

export function getCourseCatalogEntryByCanonicalId(canonicalId?: string) {
  if (!canonicalId) {
    return undefined;
  }

  return COURSE_CATALOG.find((entry) => entry.canonicalId === canonicalId);
}

export function getCourseCatalogEntryForSourceUrl(sourceUrl?: string) {
  const normalizedSourceUrl = normalizeUrl(sourceUrl);
  if (!normalizedSourceUrl) {
    return undefined;
  }

  const sourceSearchText = normalizeSearchText(normalizedSourceUrl);
  return COURSE_CATALOG.find((entry) => {
    if (normalizeUrl(entry.sourceUrl) === normalizedSourceUrl) {
      return true;
    }

    return (entry.matchers ?? []).some((matcher) =>
      includesCatalogMatcher(sourceSearchText, matcher),
    );
  });
}

export function getCourseCatalogEntryForCourse(course: Course) {
  const directMatch = getCourseCatalogEntryByCanonicalId(course.canonicalId) ??
    getCourseCatalogEntryForSourceUrl(course.sourceUrl);
  if (directMatch) {
    return directMatch;
  }

  const searchText = buildCourseSearchText(course);
  return COURSE_CATALOG.find((entry) => {
    if (entry.legacyIds?.includes(course.id)) {
      return true;
    }

    return (entry.matchers ?? []).some((matcher) =>
      includesCatalogMatcher(searchText, matcher),
    );
  });
}

export function getCanonicalCourseIdForSourceUrl(sourceUrl?: string) {
  return getCourseCatalogEntryForSourceUrl(sourceUrl)?.canonicalId;
}

