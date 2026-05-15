# AGENTS.md

## 项目定位

这是 `Study Runway`，一个本地运行的 Roadmap 学习进度执行系统。用户希望它不只是课程进度表，而是能把课程、书籍、纸质资料、论文、练习、项目 milestone 统一成学习库，并按依赖、Phase、难度、进度、重/轻学习容量自动生成每日学习动作。

## 技术栈

- React 18 + TypeScript
- Vite
- Tailwind CSS
- React Router
- Recharts
- 数据目前主要存储在浏览器 `localStorage`

## 常用命令

```powershell
npm run dev
npm run build
npm run preview
```

Windows 上也可以使用项目根目录里的：

```powershell
.\打开 Study Runway.cmd
.\关闭 Study Runway.cmd
```

## 工作规则

- 用户主要用中文沟通，回复和文案优先中文。
- 不要随意重置或删除用户数据。涉及 `localStorage` 迁移、清空、覆盖 deadline、删除资料时要谨慎。
- 手动补记学习时长是“新增一笔分钟数”，不是覆盖总时长。
- 今日任务记录学习时间不自动勾选 lecture/unit 完成；掌握或完成由用户手动确认。
- 课程详情页管理课程 lecture；学习资料详情页管理书籍、资料、练习、项目 unit。
- `/courses` 路由历史上叫课程库，现在 UI 语义是“学习库”，不要轻易改路由，避免破坏已有入口。
- 如果修改排课器，要同时考虑今日页、周计划、长期计划、Roadmap 和趋势页。
- 当前目录不是 git repository，不能依赖 `git diff/status` 做变更追踪。

## 架构入口

- `src/context/CourseContext.tsx`: 课程、学习项、任务决策、补记、deadline 校准的主要上下文。
- `src/scheduling/scheduleEngine.ts`: Roadmap 每日/周/长期排课核心。
- `src/planner/usePlannerSnapshot.ts`: 计划快照和稳定缓存。
- `src/planner/plannerStorage.ts`: 排课容量、任务决策、手动挪动的持久化和默认设置。
- `src/utils/learningFactory.ts`: LearningItem 与 Course 兼容适配。
- `src/utils/unifiedStudyItems.ts`: 统一学习库视图模型。
- `src/utils/goalStorage.ts`: 项目驱动目标、绑定学习项和验收清单的持久化。
- `src/planner/deadlineCalibration.ts`: 按当前容量倒推目标完成日。
- `src/pages/CoursesPage.tsx`: 学习库页面。
- `src/pages/LearningItemDetailPage.tsx`: 书籍/资料/练习/项目详情页。
- `src/pages/GoalsPage.tsx`: 项目驱动目标页面。
- `src/pages/RoadmapPage.tsx`: Roadmap Phase 视图。
- `src/components/dashboard/TodayPlanPanel.tsx`: 今日学习动作卡。
- `src/integrations/lifeos.ts`: Dashboard 同步到 LifeOS 的摘要构建和推送逻辑。
