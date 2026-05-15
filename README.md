# Study Runway

`Study Runway` 是一个本地学习进度执行系统，目标是把课程、书籍、资料、练习和项目统一成 Roadmap，并自动安排每天该推进哪些学习动作。

## 路由

- `/dashboard`: 总览，统一统计课程、书籍、资料、练习和项目。
- `/today`: 今日学习动作，按重学习槽和轻学习槽展示。
- `/goals`: 项目驱动目标，用季度、月度、周目标组织学习项和验收清单。
- `/roadmap`: Roadmap Phase 视图，按阶段并列展示课程/学习内容和对应项目阶段。
- `/weekly`: 最近两周学习动作表，可手动减压、挪动、重排。
- `/courses`: 学习库，统一管理课程和非课程学习项。
- `/courses/:courseId`: 课程详情，管理 lecture、补记课程学习时间。
- `/learning-items/:itemId`: 学习项详情，管理书籍/资料/练习/项目 unit。
- `/insights`: 趋势、风险、deadline 校准和排课设置。

## 运行

```powershell
npm install
npm run dev
```

构建验证：

```powershell
npm run build
```

当前构建通过。Vite 可能提示主 chunk 超过 500KB，这是体积优化提醒，不是编译错误。

## 数据存储

当前版本主要使用浏览器 `localStorage`，关键数据包括：

- 课程列表和 lecture 进度。
- LearningItem 列表和 unit 进度。
- 今日任务完成/跳过决策。
- 手动挪动任务。
- 排课设置。
- StudyGoal 目标、绑定学习项和验收清单。
- 稳定计划缓存。
- deadline 校准版本标记。

如果新线程要调试真实用户数据，优先从浏览器页面行为和 `localStorage` 读取状态，不要假设初始 seed 就是当前用户数据。

## 当前能力

- 课程 lecture 可勾选完成、补记新增分钟、记录理解评分和笔记。
- 书籍/资料/练习/项目 unit 可在学习项详情页勾选完成和补记新增分钟。
- 今日任务记录时间只推进进度，不自动勾选完成。
- Roadmap 原生调度器可混排课程、阅读、练习、项目。
- Roadmap 页面把每个 Phase 拆成目标说明、阶段验收、课程/学习内容列和项目阶段列，便于看清“这一阶段学什么、做什么”。
- `reference` 资料不会占用每日槽位，只作为参考资料挂到相关任务旁。
- `AI/ML Roadmap Reference` 当前作为 Phase 0 reference 资料，用于校准长期路线，不进入每日学习槽。
- 目标页可以把四年 Roadmap 拆成季度项目、月度 milestone 和周目标。
- Dashboard 可把今日学习摘要同步到本地 LifeOS ingest endpoint。
- Dashboard 有期末覆盖面板，用现有 Roadmap 课程和长期计划检查高数、线代、大学物理是否能在 2026-06-15 前完成第一轮覆盖；用户确认后可把匹配课程的现有目标日、目标模式和优先级调整为期末手动目标，但不改变排课规则。
- 学习库默认包含 `Code-to-Silicon Lab` 项目，用一个项目学习项承载解释器、字节码 VM、编译器、单片机、CPU 模拟器、Digital/Logisim CPU 和 FPGA milestones。
- World Labs / Spatial Intelligence 路线统一在 `Spatial Intelligence Systems Track` reference 下；执行项目按接力顺序放在 backlog，当前不抢课表。
- Marble 作为 World Labs 方向的工具入口放在 Phase 3：`Marble World Model Reference` 只作 reference，实际 quickstart、输入比较、导出 pipeline、viewer 和失败分析放进 `Spatial World Lab`。
- 支持按当前容量一次性或手动重算目标完成日。

## 关键 localStorage key

- `study-runway:state:v2`: 课程和 lecture。
- `study-runway:learning-items:v1`: 非课程学习项和 unit。
- `study-runway:goals:v1`: 项目驱动目标。
- `study-runway:planner:v5`: 排课设置、任务决策和手动挪动。
- `study-runway:stable-plan:v29`: 稳定计划缓存。
- `study-runway:deadline-profile:school-auto-v6`: deadline 校准标记。
