# 新线程启动提示

你现在接手 `Study Runway` 项目，工作目录是：

```text
E:\DIY工具\课程进度跟踪工具
```

这是一个本地 React + TypeScript + Vite + Tailwind 应用。用户希望它成为一个 Roadmap 学习动作调度器：统一管理课程、书籍、资料、练习和项目，并根据 Phase、依赖、难度、进度、deadline 和重/轻学习容量自动安排每日任务。

请先阅读这些文件：

```text
AGENTS.md
README.md
STATUS.md
DECISIONS.md
TODO.md
```

然后再看代码入口：

```text
src/context/CourseContext.tsx
src/scheduling/scheduleEngine.ts
src/planner/usePlannerSnapshot.ts
src/utils/learningFactory.ts
src/utils/unifiedStudyItems.ts
src/planner/deadlineCalibration.ts
src/planner/plannerStorage.ts
src/pages/CoursesPage.tsx
src/pages/LearningItemDetailPage.tsx
src/pages/GoalsPage.tsx
src/components/dashboard/TodayPlanPanel.tsx
src/utils/goalStorage.ts
src/integrations/lifeos.ts
```

接手原则：

- 不要把系统退回“只排课程”的模型。
- 今日任务是学习动作，不等于自动完成 unit。
- 课程、书籍、资料、练习、项目都要尽量进入统一学习库和统一调度。
- `reference` 资料只挂载为参考资源，不单独占用每日槽位。
- 重/轻学习容量严格分开。
- 当前默认容量以 `src/planner/plannerStorage.ts` 为准：工作日和周末都是重学习 240 分钟 / 2 槽，轻学习 60 分钟 / 1 槽。
- `AI/ML Roadmap Reference` 当前是 Phase 0 的 reference 资料，不进入每日学习槽。
- `/goals` 只组织学习项和验收清单，不直接排进每日槽位。
- 用户更偏好“正常上课模式”，不要让远期课程和资料因为 deadline 远而长期空着。
- 修改后运行 `npm run build`。
