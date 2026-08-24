# DuckDAW 实现差距与交付计划

> 本文记录 2026-08-20 当前工作树。状态变化以代码、测试、类型检查、构建和独立审查为依据。

## 1. 能力状态矩阵

| 能力 | 需求 ID | 当前状态 | 主要证据 |
|---|---|---|---|
| 新建/保存/另存为 | FR-PROJ-01/02 | 已实现 | `projectLifecycle.test.ts`, `saveProject.test.ts` |
| ZIP/legacy 打开 | FR-PROJ-03 | 已实现 | `projectStorage.test.ts`, `dawStore.test.ts` |
| 最近项目 | FR-PROJ-04 | 已实现，平台受限 | `projectStorage.ts` |
| dirty/离页 | FR-PROJ-05 | 已实现 | `dawStore.test.ts`, `DAWApp.tsx` |
| 恢复快照 | FR-PROJ-06 | 已实现 | `recovery.test.ts`, `DAWApp.tsx` |
| 模板 | FR-PROJ-07 | 已实现 | `projectLifecycle.test.ts` |
| GitHub 同步 | FR-PROJ-08 | 已实现，授权/网络受限 | `SettingsModal.tsx`, `complianceContracts.test.ts` |
| 传输/拍号/网格/循环/标记 | FR-TRN-01~06 | 已实现 | `time.test.ts`, `complianceContracts.test.ts` |
| 多编排 | FR-ARR-01 | 已实现 | `editingInvariants.test.ts` |
| 轨道/片段 | FR-TRK-01/02, FR-CLIP-01~03 | 已实现 | `editingInvariants.test.ts`, `dawStore.ts` |
| 钢琴卷帘/量化/MIDI 录音 | FR-MIDI-01~03 | 已实现 | `midiInput.test.ts`, `PianoRoll.tsx`, `DAWApp.tsx` |
| 音频导入/录音 | FR-AUD-01/02 | 已实现 | `recorder.test.ts`, `ArrangeView.tsx` |
| 混音/资源生命周期 | FR-MIX-01~03 | 已实现 | `mixSettings.test.ts`, `audioEngine.test.ts` |
| 统一 Instrument/Effect Plugin SDK | PLUG-SDK-01/02, PLUG-INST-01, PLUG-FX-01, PLUG-FMT-01, PLUG-DEV-01, PLUG-UI-01 | 已实现；完整本地门禁与独立复审 PASS，无 P0/P1 | `08-plugin-sdk.md`；`pluginInspectorStore.test.ts`、`pluginUi.test.ts`、`PLUG-E2E-01` |
| 通用控件 Automation | AUTO-02 | 已实现；完整本地门禁与独立复审 PASS，无 P0/P1 | `09-automation.md`；AUTO-T02-01~06、AUTO-E2E-02 |
| 离线导出 | FR-EXP-01 | 已实现 | `exportPlan.test.ts`, `ExportModal.tsx` |
| 撤销/主题/反馈/快捷键 | FR-UI-01~04 | 已实现 | `editingInvariants.test.ts`, `complianceContracts.test.ts` |

## 2. 差距闭环

以下基线差距均已闭环：

| GAP | 原问题 | 完成实现与证据 |
|---|---|---|
| GAP-001 | 工程加载不完整 | `PersistedProjectState` 全字段原子往返；`projectStorage.test.ts`, `dawStore.test.ts` |
| GAP-002 | 保存静默遗漏音频 | Blob 失败使打包失败；`projectStorage.test.ts` |
| GAP-003 | 无恢复快照 | 独立 IDB 快照、2 秒防抖、恢复/丢弃/稍后；`recovery.test.ts` |
| GAP-004 | 新建/打开无保护 | dirty 确认、全状态/句柄/历史清理；`projectLifecycle.test.ts` |
| GAP-005 | 工程身份不稳定 | Save/Save As 保持 ID/createdAt，New/Template 生成新身份；存储/生命周期测试 |
| GAP-006 | 模板包含内容 | 结构模板、删除入口、新工程语义；`projectLifecycle.test.ts` |
| GAP-007 | Arrangement 无隔离 | `Clip.arrangementId`、迁移/隔离/复制/级联；`editingInvariants.test.ts` |
| GAP-008 | 撤销范围/快捷键不完整 | 全工程 partialize、Z/Shift+Z/Y、拖拽事务、加载清栈 |
| GAP-009 | Cut 后无法 Paste | 剪贴板 DTO + `pasteClips`，定位播放头并生成新 ID；编辑不变量测试 |
| GAP-010 | MIDI Record 仅状态 | Web MIDI 捕获、目标约束、Note On/Off、停止一次提交；`midiInput.test.ts` |
| GAP-011 | 非 4/4 错误 | 统一 quarter-beat 时间模块并覆盖 3/4、6/8、7/8；`time.test.ts` |
| GAP-012 | 录音元数据粗略 | Recorder 返回 URL/MIME/实际秒时长；`recorder.test.ts` |
| GAP-013 | GitHub token/冲突风险 | sessionStorage、风险说明/清除、编码、SHA 和 409 提示；合规契约测试 |
| GAP-014 | 资源释放/类型约束 | Tone 节点 dispose、Blob URL 所有权、跨类型拒绝；音频/编辑测试 |
| GAP-015 | 反馈/基础可访问性不统一 | Toast、业务 alert/console-only 清零、dialog/aria/button 语义；合规契约测试 |

## 3. 数据安全边界

工程加载在状态替换前执行：
1. 压缩包总大小、条目数量和 ZIP 路径检查；
2. manifest/project 解压大小限制；
3. 格式、semver 主版本、manifest/project ID/BPM 一致性；
4. Track/Clip/Arrangement/Marker/Note ID、数值范围和引用校验；
5. 音频资源名称、声明、存在性、单文件和总解压大小校验；
6. legacy JSON 复用同一项目不变量校验。

边界值定义于 `projectStorage.ts`；未来若调整必须同时更新格式规格和拒绝测试。

## 4. 测试追踪矩阵

| 测试 ID | 场景 | 覆盖需求 | 当前证据 |
|---|---|---|---|
| T-PKG-01 | ZIP 基础/全字段/音频往返 | FR-PROJ-02/03, FR-AUD-01 | `projectStorage.test.ts` |
| T-PKG-02 | 版本、身份、schema、引用、缺资源拒绝 | FR-PROJ-03 | `projectStorage.test.ts` |
| T-SAVE-01 | saved/downloaded/skipped/cancelled | FR-PROJ-02 | `saveProject.test.ts` |
| T-RECOVERY-01 | IDB 快照保存/恢复/清除 | FR-PROJ-06 | `recovery.test.ts` |
| T-NEW-01 | dirty 新建、重置、模板、删除 | FR-PROJ-01/05/07 | `projectLifecycle.test.ts` |
| T-TIME-01 | 3/4、6/8、7/8、秒/beat/Transport | FR-TRN-02/04, FR-MIX-03 | `time.test.ts` |
| T-EDIT-01 | 编排隔离/复制/删除、类型、Cut→Paste | FR-ARR-01, FR-CLIP-02/03 | `editingInvariants.test.ts` |
| T-UNDO-01 | 原子加载、dirty、marker undo | FR-UI-01 | `dawStore.test.ts`, `editingInvariants.test.ts` |
| T-MIDI-01 | Note On/Off、velocity 0、结束关闭 | FR-MIDI-03 | `midiInput.test.ts` |
| T-MIC-01 | MIME、实际时长、输入关闭 | FR-AUD-02 | `recorder.test.ts` |
| T-MIX-01 | 共享混音参数、节点 dispose | FR-MIX-02, FR-EXP-01 | `mixSettings.test.ts`, `audioEngine.test.ts` |
| PLUG-T01~T09 | registry、参数、迁移、未知插件、共享 factory、dispose、Store/UI、内置插件 | Plugin SDK | 已通过：`pluginSdk.test.ts`, `pluginRuntime.test.ts`, `audioEnginePlugin.test.ts`, `pluginPersistence.test.ts`, `projectStorage.test.ts` |
| PLUG-T10~T12 | 三浏览器/a11y、ordered multi-instance chain 与全质量门禁 | Plugin SDK | 已通过：Playwright Chromium/Firefox/WebKit 24/24；unit 316/316、typecheck、build、size、diff 均通过 |
| AUTO-T02-01~06 | dynamic target、ensure/undo、Track curve、plugin realtime/offline、package 往返 | AUTO-02 | 已通过：`automationControl.test.ts`, `automationWorkflow.test.ts`, `audioEngineAutomation.test.ts`, `projectStorage.test.ts` |
| AUTO-E2E-02 | 控件直建、曲线增点/拖点、Instrument/Effect、undo/redo、WAV offline | AUTO-02 | Chromium/Firefox/WebKit 3/3 通过；包含真实 download |
| T-EXPORT-01 | sample rate、full/selection、空工程 | FR-EXP-01 | `exportPlan.test.ts` |
| T-UI-01 | Grid/Marker/GitHub/Theme/Toast/A11y 静态契约 | FR-TRN-03/06, FR-PROJ-08, FR-UI-02/03 | `complianceContracts.test.ts` |

## 5. Definition of Done

本轮完成标准：
1. 33 条需求均有实现和自动化/源码契约证据；
2. 项目格式和迁移与 `04-project-format.md` 一致；
3. 正常、边界、取消和失败路径有明确结果；
4. `npm test`、`npm run lint`、`npm run build` 通过；
5. 无新增未释放 Tone 节点、MediaStream 或 Blob URL；
6. 功能规格、审计矩阵和测试追踪无过期现状；
7. 独立审查提出的候选缺口逐项回查源码，真实缺口修复，误报以精确代码证据关闭。

## 6. 下一代优化交付状态

[`07-next-generation-optimization.md`](./07-next-generation-optimization.md) 中的 Batch A–F 已按 SDD/TDD 完成候选实现。Batch E 的 Tempo/Automation、v2 格式、Bus/Send DAG、共享实时/离线 Mix Graph 与 export tail/normalize/limiter/stems 已由领域、Store、音频和集成测试覆盖；Batch F 的 GitHub baseline/409 事务、依赖治理、CI/CD、部署 metadata 和真实浏览器工作流已完成。

`0.3.0-rc.1` 本地候选证据：42 个 Vitest 文件、278 项测试通过；Chromium/Firefox/WebKit Playwright 组合矩阵 18/18 通过；TypeScript no-emit、生产构建、冻结 bundle budget、`npm audit`（0 vulnerabilities）和 `git diff --check` 通过；独立发布审查及 FFmpeg GPL notice 复审确认无未关闭 P0/P1。远端 CI、Netlify staging branch deploy、`daw-sit.msqt.fun` DNS/TLS/metadata/SPA/cache smoke 属于提交后的 staging 门禁，必须记录实际远端结果后才可声明预发部署完成。

历史资料仍按 `docs/specs/README.md` 的权威顺序处理，不覆盖本矩阵。
