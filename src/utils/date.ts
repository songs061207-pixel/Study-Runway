const MS_PER_DAY = 24 * 60 * 60 * 1000;

export function parseDateKey(value: string) {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(year, month - 1, day);
}

export function startOfDay(value: Date | string) {
  if (typeof value === "string") {
    return parseDateKey(value);
  }

  return new Date(value.getFullYear(), value.getMonth(), value.getDate());
}

export function getDateKey(value: Date | string = new Date()) {
  const date = typeof value === "string" ? parseDateKey(value) : value;
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const day = `${date.getDate()}`.padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function addDays(value: Date | string, days: number) {
  const date = startOfDay(value);
  date.setDate(date.getDate() + days);
  return date;
}

export function isWeekendDate(value: Date | string) {
  const date = typeof value === "string" ? parseDateKey(value) : value;
  const day = date.getDay();
  return day === 0 || day === 6;
}

export function differenceInCalendarDays(
  later: Date | string,
  earlier: Date | string = new Date(),
) {
  return Math.round(
    (startOfDay(later).getTime() - startOfDay(earlier).getTime()) / MS_PER_DAY,
  );
}

export function isDateWithinLastDays(
  dateKey: string,
  days: number,
  today: Date = new Date(),
) {
  const diff = differenceInCalendarDays(today, dateKey);
  return diff >= 0 && diff < days;
}

export function getRecentDateKeys(days: number, today: Date = new Date()) {
  return Array.from({ length: days }, (_, index) =>
    getDateKey(addDays(today, -(days - 1 - index))),
  );
}

export function formatDateShort(value: string) {
  return new Intl.DateTimeFormat("zh-CN", {
    month: "numeric",
    day: "numeric",
  }).format(parseDateKey(value));
}

export function formatDateLong(value: string) {
  return new Intl.DateTimeFormat("zh-CN", {
    year: "numeric",
    month: "long",
    day: "numeric",
  }).format(parseDateKey(value));
}

export function formatDaysLeft(daysLeft: number) {
  if (daysLeft < 0) {
    return `已逾期 ${Math.abs(daysLeft)} 天`;
  }

  if (daysLeft === 0) {
    return "今天截止";
  }

  return `剩余 ${daysLeft} 天`;
}
