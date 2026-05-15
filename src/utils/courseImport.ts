import { getCourseImportPreset } from "../data/importPresets";
import { CourseImportPreview, CourseImportSource } from "../types";

const IMPORT_PROXY = "https://api.allorigins.win/raw?url=";
const PRIMARY_COURSE_ITEM_PATTERN =
  /\b(lecture|module|lesson|unit|session|chapter|class|part)\b/i;
const SECONDARY_COURSE_ITEM_PATTERN =
  /\b(week|lecture|module|lesson|unit|session|chapter|class|part)\b/i;
const STOP_TEXT = new Set([
  "home",
  "about",
  "overview",
  "course info",
  "resources",
  "calendar",
  "syllabus",
  "assignments",
  "accessibility",
  "download course",
  "communities",
  "login",
  "sign up",
  "edx",
]);
const DIRECT_FETCH_HOSTS = ["ocw.mit.edu"];
const FETCH_TIMEOUT_MS = 10000;

type LiveImportSource = Exclude<CourseImportSource, "preset">;

interface FetchStrategy {
  source: LiveImportSource;
  label: string;
  requestUrl: string;
}

function cleanText(value?: string | null) {
  return (value ?? "").replace(/\s+/g, " ").replace(/\u00a0/g, " ").trim();
}

function clipText(value: string, maxLength: number) {
  if (value.length <= maxLength) {
    return value;
  }

  return `${value.slice(0, maxLength).trim()}...`;
}

function normalizeUrl(rawUrl: string) {
  const trimmedValue = rawUrl.trim();
  if (!trimmedValue) {
    throw new Error("请先输入课程链接。");
  }

  try {
    return new URL(trimmedValue).toString();
  } catch {
    return new URL(`https://${trimmedValue}`).toString();
  }
}

function inferProvider(url: URL, title: string) {
  const hostname = url.hostname.toLowerCase();
  const normalizedTitle = title.toLowerCase();

  if (hostname.includes("harvard.edu") || normalizedTitle.includes("harvard")) {
    return "Harvard";
  }

  if (hostname.includes("stanford.edu") || normalizedTitle.includes("stanford")) {
    return "Stanford";
  }

  if (hostname.includes("mit.edu") || normalizedTitle.includes("mit")) {
    return "MIT";
  }

  return hostname.replace(/^www\./, "");
}

function suggestColor(provider: string, hostname: string) {
  const normalizedProvider = provider.toLowerCase();

  if (normalizedProvider.includes("harvard")) {
    return "#9f1239";
  }

  if (normalizedProvider.includes("stanford")) {
    return "#991b1b";
  }

  if (normalizedProvider.includes("mit") || hostname.includes("mit.edu")) {
    return "#2563eb";
  }

  return "#0f766e";
}

function pickMetaContent(document: Document, selectors: string[]) {
  for (const selector of selectors) {
    const value = cleanText(
      document.querySelector(selector)?.getAttribute("content") ??
        document.querySelector(selector)?.textContent,
    );
    if (value) {
      return value;
    }
  }

  return "";
}

function stripDecoratedTitle(rawTitle: string) {
  const cleanedTitle = cleanText(rawTitle)
    .replace(/\s+\|\s+MIT OpenCourseWare$/i, "")
    .replace(/\s+\|\s+Harvard.*$/i, "")
    .replace(/\s+\|\s+Stanford.*$/i, "");

  const segments = cleanedTitle
    .split("|")
    .map((segment) => cleanText(segment))
    .filter(Boolean);

  if (segments.length === 0) {
    return cleanedTitle;
  }

  const preferredSegment = segments.find(
    (segment) =>
      !/mit opencourseware|harvard|stanford|resources|course info/i.test(segment),
  );

  return preferredSegment ?? segments[0];
}

function dedupeTexts(values: string[]) {
  const seen = new Set<string>();

  return values.filter((value) => {
    const key = value.toLowerCase();
    if (seen.has(key)) {
      return false;
    }

    seen.add(key);
    return true;
  });
}

function selectLectureCandidates(values: string[], pattern: RegExp) {
  return dedupeTexts(
    values.filter((text) => {
      const normalizedText = text.toLowerCase();
      return (
        !STOP_TEXT.has(normalizedText) &&
        (pattern.test(text) || normalizedText === "final project")
      );
    }),
  );
}

function extractLectureTitles(
  document: Document,
  preset: ReturnType<typeof getCourseImportPreset>,
) {
  const rawValues = Array.from(
    document.querySelectorAll("main a, main h2, main h3, article a, article h2, article h3, li, a"),
  )
    .map((element) => cleanText(element.textContent))
    .filter((text) => text.length >= 4 && text.length <= 180);

  const primaryTitles = selectLectureCandidates(rawValues, PRIMARY_COURSE_ITEM_PATTERN);
  if (primaryTitles.length >= 4) {
    return {
      titles: primaryTitles.slice(0, 80),
      usedFallback: false,
    };
  }

  const secondaryTitles = selectLectureCandidates(
    rawValues,
    SECONDARY_COURSE_ITEM_PATTERN,
  );
  if (secondaryTitles.length >= 4) {
    return {
      titles: secondaryTitles.slice(0, 80),
      usedFallback: false,
    };
  }

  if (preset) {
    return {
      titles: preset.lectureTitles,
      usedFallback: true,
    };
  }

  return {
    titles: Array.from({ length: 12 }, (_, index) => `Module ${index + 1}`),
    usedFallback: true,
  };
}

function shouldUseCanonicalPresetTitles(
  preset: ReturnType<typeof getCourseImportPreset>,
  _extractedTitles: string[],
) {
  if (!preset?.preferCanonicalTitles) {
    return false;
  }

  return true;
}

function supportsDirectFetch(url: URL) {
  return DIRECT_FETCH_HOSTS.some((host) => url.hostname.includes(host));
}

function getFetchStrategies(normalizedUrl: string, url: URL): FetchStrategy[] {
  const directStrategy: FetchStrategy = {
    source: "direct",
    label: "课程页面直连",
    requestUrl: normalizedUrl,
  };
  const proxyStrategy: FetchStrategy = {
    source: "proxy",
    label: "跨域代理",
    requestUrl: `${IMPORT_PROXY}${encodeURIComponent(normalizedUrl)}`,
  };

  if (supportsDirectFetch(url)) {
    return [directStrategy, proxyStrategy];
  }

  return [proxyStrategy, directStrategy];
}

function unwrapResponseText(rawText: string, contentType: string | null) {
  const normalizedContentType = (contentType ?? "").toLowerCase();
  if (!normalizedContentType.includes("application/json")) {
    return rawText;
  }

  try {
    const parsed = JSON.parse(rawText) as Record<string, unknown>;
    if (typeof parsed.contents === "string") {
      return parsed.contents;
    }

    if (typeof parsed.error === "string") {
      throw new Error(cleanText(parsed.error));
    }
  } catch {
    return rawText;
  }

  return rawText;
}

function detectPayloadError(rawText: string, contentType: string | null) {
  const normalized = cleanText(rawText);
  if (!normalized) {
    return "返回内容为空。";
  }

  if (/^error code:\s*\d{3}$/i.test(normalized)) {
    return `抓取服务返回 ${normalized.toUpperCase()}。`;
  }

  if (
    normalized.length <= 240 &&
    /(cloudflare|error code|bad gateway|access denied|proxy error|upstream connect error)/i.test(
      normalized,
    )
  ) {
    return `抓取服务异常：${normalized}`;
  }

  if (
    (contentType ?? "").toLowerCase().includes("application/json") &&
    normalized.startsWith("{")
  ) {
    return "抓取服务返回了不可解析的 JSON。";
  }

  return null;
}

function formatAttemptError(error: unknown, strategy: FetchStrategy) {
  if (error instanceof DOMException && error.name === "AbortError") {
    return `${strategy.label}超时。`;
  }

  if (error instanceof Error) {
    const message = cleanText(error.message);
    if (/failed to fetch/i.test(message) && strategy.source === "direct") {
      return `${strategy.label}失败：浏览器拦截了跨域读取。`;
    }

    if (/failed to fetch/i.test(message) && strategy.source === "proxy") {
      return `${strategy.label}失败：代理未返回可用内容。`;
    }

    return `${strategy.label}失败：${message}`;
  }

  return `${strategy.label}失败。`;
}

async function fetchTextWithTimeout(requestUrl: string) {
  const controller = new AbortController();
  const timeoutId = globalThis.setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  try {
    return await fetch(requestUrl, {
      signal: controller.signal,
      headers: {
        Accept: "text/html,application/xhtml+xml,text/plain;q=0.9,*/*;q=0.8",
      },
    });
  } finally {
    globalThis.clearTimeout(timeoutId);
  }
}

async function fetchCourseMarkup(normalizedUrl: string, url: URL) {
  const attemptErrors: string[] = [];

  for (const strategy of getFetchStrategies(normalizedUrl, url)) {
    try {
      const response = await fetchTextWithTimeout(strategy.requestUrl);
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const contentType = response.headers.get("content-type");
      const rawText = await response.text();
      const payload = unwrapResponseText(rawText, contentType);
      const payloadError = detectPayloadError(payload, contentType);

      if (payloadError) {
        throw new Error(payloadError);
      }

      return {
        markup: payload,
        source: strategy.source,
        attemptErrors,
      };
    } catch (error) {
      attemptErrors.push(formatAttemptError(error, strategy));
    }
  }

  throw new Error(attemptErrors.join("；"));
}

function getSourceLabel(source: LiveImportSource) {
  return source === "direct" ? "课程页面直连" : "跨域代理";
}

function buildFallbackPreview(normalizedUrl: string, failureReason?: string) {
  const url = new URL(normalizedUrl);
  const preset = getCourseImportPreset(url);

  if (!preset) {
    throw new Error("抓取失败，请确认课程链接可公开访问。");
  }

  const firstWarning = failureReason
    ? `页面抓取失败（${failureReason}），已套用已知课程模板，请在保存前校正课程信息。`
    : "页面抓取失败，已套用已知课程模板，请在保存前校正课程信息。";

  return {
    normalizedUrl,
    name: preset.name,
    provider: preset.provider,
    totalUnits: preset.lectureTitles.length,
    lectureMinutes: preset.lectureMinutes,
    notes: preset.notes,
    lectureTitles: preset.lectureTitles,
    color: preset.color,
    difficulty: preset.difficulty,
    intensity: preset.intensity,
    roadmapTrack: preset.roadmapTrack,
    roadmapPhase: preset.roadmapPhase,
    roadmapOrder: preset.roadmapOrder,
    roadmapRoute: preset.roadmapRoute,
    roadmapYear: preset.roadmapYear,
    roadmapStatus: preset.roadmapStatus,
    scheduleMode: preset.scheduleMode,
    source: "preset",
    warnings: [firstWarning, "系统目标日会在保存后按当前容量自动校准；需要固定日期时可切换为手动锁定。"],
  } satisfies CourseImportPreview;
}

export async function importCourseFromUrl(rawUrl: string): Promise<CourseImportPreview> {
  const normalizedUrl = normalizeUrl(rawUrl);
  const url = new URL(normalizedUrl);
  const preset = getCourseImportPreset(url);

  try {
    const { markup, source, attemptErrors } = await fetchCourseMarkup(normalizedUrl, url);
    const document = new DOMParser().parseFromString(markup, "text/html");
    const extractedTitle = stripDecoratedTitle(
      pickMetaContent(document, [
        "meta[property='og:title']",
        "meta[name='twitter:title']",
      ]) ||
        cleanText(document.querySelector("h1")?.textContent) ||
        cleanText(document.title) ||
        preset?.name ||
        url.hostname,
    );
    const extractedDescription =
      pickMetaContent(document, [
        "meta[name='description']",
        "meta[property='og:description']",
      ]) || preset?.notes;
    const lectureResult = extractLectureTitles(document, preset);
    const provider = preset?.provider ?? inferProvider(url, extractedTitle);
    const warnings = ["系统目标日会在保存后按当前容量自动校准；需要固定日期时可切换为手动锁定。"];

    if (attemptErrors.length > 0) {
      warnings.push(
        `已改用 ${getSourceLabel(source)} 完成抓取；此前失败的尝试：${attemptErrors[0]}`,
      );
    }

    const lectureTitles = shouldUseCanonicalPresetTitles(preset, lectureResult.titles)
      ? preset!.lectureTitles
      : lectureResult.titles;

    if (preset?.preferCanonicalTitles && lectureTitles === preset.lectureTitles) {
      warnings.push("该课程已使用校验过的官方目录，避免把大章节误识别成一节。");
    } else if (lectureResult.usedFallback) {
      warnings.push("讲次列表未稳定识别，已使用模板或占位单元，请校正后保存。");
    }

    return {
      normalizedUrl,
      name: extractedTitle || preset?.name || "未命名课程",
      provider,
      totalUnits: lectureTitles.length,
      lectureMinutes: preset?.lectureMinutes,
      notes: clipText(
        cleanText(extractedDescription) ||
          `${provider} 课程链接已导入，请校正系统目标日和讲次清单。`,
        220,
      ),
      lectureTitles,
      color: preset?.color ?? suggestColor(provider, url.hostname),
      difficulty: preset?.difficulty,
      intensity: preset?.intensity,
      roadmapTrack: preset?.roadmapTrack,
      roadmapPhase: preset?.roadmapPhase,
      roadmapOrder: preset?.roadmapOrder,
      roadmapRoute: preset?.roadmapRoute,
      roadmapYear: preset?.roadmapYear,
      roadmapStatus: preset?.roadmapStatus,
      scheduleMode: preset?.scheduleMode,
      source,
      warnings,
    };
  } catch (error) {
    const failureReason =
      error instanceof Error ? cleanText(error.message) : "未知抓取错误";

    console.warn("Course import fallback triggered:", normalizedUrl, failureReason);
    return buildFallbackPreview(normalizedUrl, failureReason);
  }
}

