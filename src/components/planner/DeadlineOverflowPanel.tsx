import { Link } from "react-router-dom";
import { DeadlineOverflowCourse } from "../../types";
import { formatDateLong } from "../../utils/date";

interface DeadlineOverflowPanelProps {
  courses: DeadlineOverflowCourse[];
  title?: string;
  description?: string;
}

export function DeadlineOverflowPanel({
  courses,
  title = "手动目标日前未排完",
  description =
    "这里只显示手动锁定目标日的学习项。自动匹配工作量的系统目标日会由系统继续校准，不再当作硬失败提醒。",
}: DeadlineOverflowPanelProps) {
  if (courses.length === 0) {
    return null;
  }

  return (
    <section className="panel overflow-hidden border-rose-200/80 bg-rose-50/40">
      <div className="border-b border-rose-200/80 px-6 py-5">
        <p className="eyebrow text-rose-600">Deadline Alert</p>
        <h2 className="section-title mt-2 text-rose-900">{title}</h2>
        <p className="mt-2 max-w-3xl text-sm text-rose-800">{description}</p>
      </div>

      <div className="space-y-4 px-6 py-6">
        {courses.map((course) => (
          <article
            key={course.courseId}
            className="rounded-[24px] border border-rose-200 bg-white/90 p-4"
          >
            <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
              <div>
                <Link
                  to={
                    course.sourceType === "learningItem"
                      ? `/learning-items/${course.courseId}`
                      : `/courses/${course.courseId}#lectures`
                  }
                  className="text-lg font-semibold text-slate-950 transition hover:text-rose-700"
                >
                  {course.courseName}
                </Link>
                <p className="mt-2 text-sm text-slate-600">
                  手动目标日：{formatDateLong(course.deadline)}
                </p>
                <p className="mt-2 text-sm text-slate-700">
                  还差 {course.remainingUnits} 个 unit / {course.remainingStudyBlockCount} 个学习块 / {course.remainingMinutes} 分钟
                </p>
              </div>

              <div className="flex flex-wrap gap-2 text-xs">
                <span className="rounded-full bg-rose-50 px-3 py-1 font-medium text-rose-700 ring-1 ring-rose-200">
                  {course.isAlreadyOverdue
                    ? `已逾期 ${course.overdueDays} 天`
                    : "手动目标日前仍未排完"}
                </span>
              </div>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
