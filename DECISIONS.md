# DECISIONS.md

## 产品决策

- 系统核心不再是“课程排课器”，而是“Roadmap 学习动作调度器”。
- 学习库统一管理课程、书籍、资料、论文、练习和项目。
- 课程仍保留原详情页和 lecture 逻辑，避免推倒重写。
- 非课程学习项使用 `LearningItem + LearningUnit`，通过适配层参与排课。
- 每日任务记录学习时间只更新进度，不自动勾选 unit/lecture 完成。
- 完成状态代表用户确认掌握或完成，需要手动勾选。
- 补记时间按新增分钟累计，不覆盖总时长。

## 排课决策

- 默认使用 `scheduleFillMode: "school"` 正常上课模式。
- 远期 deadline 不再完全 holdback，只降低优先级。
- 每天优先填满重/轻槽位。
- 重学习和轻学习严格分开，不互相借容量。
- 工作日默认：
  - 重学习 240 分钟，2 槽。
  - 轻学习 60 分钟，1 槽。
- 周末默认：
  - 重学习 240 分钟，2 槽。
  - 轻学习 60 分钟，1 槽。
- 若不同学习项不足，允许同一学习项继续接后续 unit 补槽。
- 高风险只提高入选优先级，不自动吞掉同跑道其他槽位。
- `reference` 学习项不进入每日槽位，只作为参考资料挂载。

## Roadmap 决策

- Phase 0 是路线校准和轻量参考层，不暂停 Phase 1+ 主线，也不挤占重学习槽。
- `AI/ML Roadmap Reference` 当前定位为：
  - `scheduleMode: "reference"`
  - `intensity: "light"`
  - `roadmapPhase: 0`
  - `roadmapOrder: 5`
  - `roadmapStatus: "reference"`
  - 不进入每日学习槽，只作为路线校准资料。
- 两门物理课属于 Phase 1 的 `science-foundation`：
  - Mechanics 在前。
  - Electricity and Magnetism 在后。
- `Code-to-Silicon Lab` 是当前底层能力项目主线，但只作为一个 project 学习项维护；路线内的解释器、VM、编译器、单片机、CPU 模拟器、Digital/Logisim CPU、FPGA 都放在它的 milestone units 里，避免新增多个需要维护的项目实体。
- World Labs 方向采用“统一路线，不合并执行项目”的结构：`Spatial Intelligence Systems Track` 负责长期叙事和申请路径；`Code-to-Silicon Lab`、`Graphics Foundations Lab`、`Spatial World Lab`、`Neural Rendering Lab`、`SLAM & State Estimation Lab`、`Spatial Agent Demo` 按顺序接力。
- 同一时间只让一个 build project 进入 active weekly cadence；当前是 `Code-to-Silicon Lab`，每周 1 个重学习块。后续空间智能项目默认 backlog，完成当前切片后再手动激活。
- Roadmap 页面按 Phase 做双列视图：左侧是课程/书籍/练习等学习内容，右侧是项目阶段；阶段说明必须显示目标和验收结果，避免目标库堆积后看不清路线。
- `weekly` 不再等同于“无 Phase 归属”。算法周练这类 routine 留在每周固定训练区；`Code-to-Silicon Lab` 这类有 Phase 归属的 weekly project 也要显示在对应项目列。
- Marble 不新增独立重项目。它作为 Phase 3 reference 和 `Spatial World Lab` 的项目切片存在：reference 负责查阅工具/API/原理，项目 unit 负责 quickstart、输入比较、导出、viewer、失败分析和 principle note。

## Deadline 决策

- deadline 在本系统里更像“目标完成日”，不一定是外部硬截止日。
- 新增一次性 deadline 校准，基于当前容量和剩余分钟倒推。
- 校准顺序固定参考：
  - 硬依赖
  - Phase
  - Roadmap Order
  - Priority
  - 剩余量
- 自动校准使用 `study-runway:deadline-profile:school-auto-v6` 指纹标记，课程结构或容量变化后才会重新校准。
- `deadlineMode: "manual"` 的课程和学习项不参与自动 deadline 校准，适合期末、考试或外部硬目标。
- 用户手动改过的 deadline 不会被普通刷新偷偷覆盖。
- 只有点击“按当前容量重算 deadline”才会批量覆盖生成新的目标完成日。

## 技术决策

- `/courses` 路由保留，但 UI 命名为“学习库”。
- 新增 `/learning-items/:itemId` 管理非课程学习项。
- 新增 `/goals` 管理项目驱动目标；目标绑定学习项和验收清单，但不直接参与每日排课。
- `StudyTaskDecision` 和 `ManualTaskMove` 保留旧字段，同时兼容 `sourceType`、`itemId`、`unitIds`、`actionType`。
- `LearningItem` 通过 `learningItemToCourse` 适配到旧 Course 兼容层，降低一次性重构风险。
- 目标数据存储在 `study-runway:goals:v1`。
- Dashboard 支持把今日学习摘要同步到本地 LifeOS ingest endpoint。
- 稳定计划缓存升级到 `study-runway:stable-plan:v29`。
- 请求学习项 seed flag 不能单独作为“学习项已存在”的依据；初始化和修复时必须检查实际学习库，补回缺失且未被用户删除/忽略的请求项。
- 已存在的 preset 项目需要扩展 unit 时，优先做追加式修复，保留原 unit 进度、记录时间和完成状态。
