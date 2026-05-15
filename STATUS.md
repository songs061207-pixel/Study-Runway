# STATUS.md

## 当前日期

2026-05-07

## 最近完成

- 今日任务页已从课程任务升级为 Roadmap 学习动作。
- 排课器已支持课程 lecture、书籍章节、资料页段、练习模块、项目 milestone 的统一调度。
- 已加入重/轻学习双跑道：
  - 工作日重学习 240 分钟 / 2 槽。
  - 工作日轻学习 60 分钟 / 1 槽。
  - 周末重学习 240 分钟 / 2 槽。
  - 周末轻学习 60 分钟 / 1 槽。
- 已把两门物理课归入 Phase 1 science-foundation：
  - `Mechanics: Kinematics and Dynamics`
  - `Electricity and Magnetism: Electrostatics`
- 已把 `/courses` 页面 UI 升级为“学习库”，统一显示课程、书籍、资料、练习和项目。
- 已新增 `/learning-items/:itemId` 学习项详情页，用于管理非课程资料的 unit、补记和完成状态。
- 已新增 `/goals` 项目驱动目标页，用季度、月度、周目标组织学习项和验收清单；目标不直接进入每日槽位。
- 已新增统一视图模型 `UnifiedStudyItem`。
- 已新增 deadline 校准器，按当前容量和剩余分钟倒推目标完成日。
- `AI/ML Roadmap Reference` 当前是 Phase 0 轻量 reference 资料，只用于路线校准，不进入每日学习槽。
- Dashboard、趋势页、周计划、长期计划、Roadmap 里的学习项链接已尽量指向正确详情页。
- Dashboard 已加入同步到 LifeOS 的入口，会把今日学习摘要推送到本地 LifeOS ingest endpoint。
- Dashboard 已新增 Exam Focus Panel，用现有 Roadmap 课程和长期计划检查高数、线代、大学物理是否能在 2026-06-15 前完成第一轮覆盖；面板可在用户确认后把匹配课程的现有 `deadline`、`deadlineMode`、`priority`、`roadmapStatus`、`scheduleMode` 调成期末手动目标，不改排课器、不新增存储实体。
- 已新增 `Code-to-Silicon Lab` 项目型学习项，作为当前底层能力主线；它用单个 project 的 milestone units 覆盖解释器、字节码 VM、编译器、单片机、CPU 模拟器、Digital/Logisim CPU 和 FPGA，不拆成多个维护对象。
- 已新增 `Spatial Intelligence Systems Track` reference 和 World Labs 方向的项目接力队列：`Graphics Foundations Lab`、`Spatial World Lab`、`Neural Rendering Lab`、`SLAM & State Estimation Lab`、`Spatial Agent Demo`。这些新项目默认 backlog，不进入每日排课；当前只有 `Code-to-Silicon Lab` 保持 active weekly project。
- Roadmap 页面已改成按 Phase 展示“课程 / 学习内容”和“项目阶段”双列，并在阶段头部显示目标与验收标准；有明确 Phase 归属的 weekly project 会同时显示在对应项目列和每周固定训练区。
- 学习项 seed 修复已改成即使 seed flag 存在，也会检查请求学习项是否真的在库里；缺失且未被用户删除/忽略的项目会被补回。
- 已新增 `Marble World Model Reference`，作为 Phase 3 reference 资料，用于查阅 World Labs Marble 的输入方式、编辑/扩展/组合、导出和 world model 原理，不进入每日学习槽。
- `Spatial World Lab` 已追加 Marble 项目切片：quickstart、输入比较、导出 pipeline、本地 viewer、失败分析和原理笔记；已有本地 `Spatial World Lab` 会只追加缺失 unit，不覆盖已有进度。

## 最新验证

已运行：

```powershell
npm run build
```

结果：通过。

构建提示：Vite 报主 chunk 超过 500KB，这是体积优化提醒，不影响当前运行。

## 已知注意点

- 当前项目目录不是 git repository，不能用 `git status` 或 `git diff` 跟踪变更。
- 项目根目录存在一些临时/备份文件，例如 `scheduleEngine.broken.backup.ts` 和 `__tmp_*` 文件。不要擅自删除，除非用户确认。
- 第一版不自动解析 PDF 内容，书籍/资料 unit 仍依赖预置模板或用户手动维护。
- deadline 校准会用 `study-runway:deadline-profile:school-auto-v6` 做指纹标记；`deadlineMode: "manual"` 的课程和学习项不会被自动 deadline 校准覆盖。
- 如果用户点击“按当前容量重算 deadline”，会按当前学习栈和容量重新覆盖生成目标完成日。
- 长期计划缓存版本在 `src/planner/usePlannerSnapshot.ts`，当前稳定缓存 key 是 `study-runway:stable-plan:v29`。
- 请求学习项 seed 版本当前是 `2026-05-07-marble-world-model-v1`；新增默认项目会通过 seed 机制补入，不会清空已有进度。
- seed flag 只作为“已尝试注入”的缓存提示，不能单独证明所有请求学习项都存在；当前代码会再次对比实际学习库内容。

## 关键文件

- `src/context/CourseContext.tsx`
- `src/scheduling/scheduleEngine.ts`
- `src/planner/usePlannerSnapshot.ts`
- `src/planner/deadlineCalibration.ts`
- `src/utils/unifiedStudyItems.ts`
- `src/utils/learningFactory.ts`
- `src/utils/goalStorage.ts`
- `src/pages/CoursesPage.tsx`
- `src/pages/LearningItemDetailPage.tsx`
- `src/pages/GoalsPage.tsx`
- `src/pages/RoadmapPage.tsx`
- `src/components/planner/PlannerSettingsPanel.tsx`
- `src/components/dashboard/ExamFocusPanel.tsx`
- `src/integrations/lifeos.ts`
