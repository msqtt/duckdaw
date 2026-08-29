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
| 音频导入/录音 | FR-AUD-01/02, REC-PRO-05 | 已实现；完整本地门禁与独立复审 PASS，无 P0/P1 | `recorder.test.ts`, `audioRecording.test.ts`, `REC-E2E-05`, `DAWApp.tsx` |
| 混音/资源生命周期 | FR-MIX-01~03 | 已实现 | `mixSettings.test.ts`, `audioEngine.test.ts` |
| 可视化路由/聚合通道、确定性 Solo、频谱参数 EQ | MIX-ROUTE-03, MIX-SOLO-01, PLUG-EQ-01 | 已实现；格式保持 2.1.0；完整本地门禁与独立复审 PASS，无 P0/P1 | `routingGraph.test.ts`, `routingPatch.test.ts`, `routingStore.test.ts`, `audioEngineRouting.test.ts`, `audioEngineAutomation.test.ts`, `audioEnginePlugin.test.ts`, `parametricEq.test.ts`, `pluginPersistence.test.ts`, `MIX-E2E-03` |
| 统一 Instrument/Effect Plugin SDK | PLUG-SDK-01/02, PLUG-INST-01, PLUG-FX-01, PLUG-FMT-01, PLUG-DEV-01, PLUG-UI-01 | 已实现；完整本地门禁与独立复审 PASS，无 P0/P1 | `08-plugin-sdk.md`；`pluginInspectorStore.test.ts`、`pluginUi.test.ts`、`PLUG-E2E-01` |
| MIDI 乐器热切换连续性 | PLUG-INST-02 | **已实现**：Part 事件时动态解析当前实例；active Stop 释放 voice；独立复审无 P0/P1 | `PLUG-T13~15`, `PLUG-E2E-02` |
| Inspector/Route/Mixer 可调整工作区 | PLUG-UI-02, MIX-ROUTE-04, MIX-UI-01 | **已实现**：session-only resize/maximize/disclosure/zoom/Track widths | `PLUG-UI-T02-*`, `MIX-ROUTE-T04-*`, `MIX-UI-T01-*` |
| EQ compact name 与主题 | PLUG-EQ-02 | **已实现**：stable plugin/parameter identity，Light/Dark/System 只改视觉 | `PLUG-EQ-T04/05`, `PLUG-EQ-E2E-02` |
| Transport 真值与 idle Stop | FR-TRN-07 | **已实现**：显式状态机、idle no-op、真实 glyph、voice/录音清理 | `TRN-T07-01~04`, `TRN-E2E-07` |
| 统一 Project Center 与来源事务 | FR-PROJ-09 | **已实现**：New/Recent/Local/GitHub 集中入口、来源绑定/恢复/异步录音 ownership 隔离 | `PROJ-T09-01~07`, `PROJ-E2E-09` |
| 通用控件 Automation | AUTO-02 | 已实现；完整本地门禁与独立复审 PASS，无 P0/P1 | `09-automation.md`；AUTO-T02-01~06、AUTO-E2E-02 |
| 离线导出 | FR-EXP-01 | 已实现 | `exportPlan.test.ts`, `ExportModal.tsx` |
| 撤销/主题/反馈/快捷键 | FR-UI-01~04 | 已实现 | `editingInvariants.test.ts`, `complianceContracts.test.ts` |

## 2. 差距闭环

以下基线差距 GAP-001~022 均已闭环；GAP-016~022 通过真实调用链、失败/取消竞态测试、三浏览器门禁和独立复审后关闭：

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
| GAP-016 | MIDI 换 instrument 后既有 Part 调用已 dispose 实例 | 已关闭：事件时动态解析当前实例、删除 no-op、Stop `releaseAll`；`audioEnginePlugin.test.ts`, `PLUG-E2E-02` |
| GAP-017 | Plugin Inspector 固定宽且不可最大化 | 已关闭：可访问 pointer/keyboard resize + workspace Maximize/Restore；store/E2E |
| GAP-018 | Route 永久占据 Mixer 且无 expanded workspace | 已关闭：默认关闭、开关与 Expand/Restore，graph/zoom 保持；store/E2E |
| GAP-019 | Track strip 固定 128px，插件名可读性不足 | 已关闭：按 Track session width、删除清理；store/E2E |
| GAP-020 | 参数 EQ 名称过长且图形硬编码暗色 | 已关闭：`Parametric EQ` + class-driven theme tokens，stable schema；unit/E2E |
| GAP-021 | idle Stop 可产生瞬态且 Play/Pause glyph 不真实 | 已关闭：显式 transport state、idle no-op、voice/录音 cleanup、真实 glyph；unit/E2E |
| GAP-022 | Project 生命周期入口分散、来源绑定可能串线 | 已关闭：Project Center、verified source commit、recovery serialization、GitHub/MIDI/Mic ownership；lifecycle/recovery/E2E |

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
| REC-T05-01~04 | capture→beat→play、已播放不重启、失败/取消回滚、Store 不伪造播放 | REC-PRO-05 | 已通过：`audioRecording.test.ts` 5/5；`recorder.test.ts` 3/3 |
| REC-E2E-05 | Audio Track 录制时播放、停止录音后继续播放；Count-in 权限失败/取消回滚 | REC-PRO-05 | Chromium/Firefox/WebKit 9/9 通过；成功路径提交 Audio Clip，失败/取消 0 Clip |
| T-MIX-01 | 共享混音参数、节点 dispose | FR-MIX-02, FR-EXP-01 | `mixSettings.test.ts`, `audioEngine.test.ts` |
| MIX-ROUTE-T03 | OUT/PRE/POST→IN、DAG/重复/悬空拒绝、零提交、单 undo、持久化语义重复 Send 拒绝 | MIX-ROUTE-03 | `routingGraph.test.ts`, `routingPatch.test.ts`, `routingStore.test.ts` |
| MIX-SOLO-T01 | 宿主 gate、PRE Send、Bus、Automation override 保持与 lane 禁用/删除恢复、离线同语义 | MIX-SOLO-01 | `mixSettings.test.ts`, `audioEngineRouting.test.ts`, `audioEngineAutomation.test.ts`, `ExportModal.tsx` |
| PLUG-EQ-T01~03 | 8 band/32 参数、factory/filter/FFT fallback/dispose、Track/Bus 持久化与单手势编辑 | PLUG-EQ-01 | `parametricEq.test.ts`, `audioEnginePlugin.test.ts`, `pluginPersistence.test.ts` |
| MIX-E2E-03 | 可视化端口、Bus/EQ、键盘与 pointer、undo、Solo→Bus meter、unsupported analyser fallback | MIX-ROUTE-03, MIX-SOLO-01, PLUG-EQ-01 | Chromium/Firefox/WebKit 3/3；完整矩阵 36/36 |
| PLUG-T01~T09 | registry、参数、迁移、未知插件、共享 factory、dispose、Store/UI、内置插件 | Plugin SDK | 已通过：`pluginSdk.test.ts`, `pluginRuntime.test.ts`, `audioEnginePlugin.test.ts`, `pluginPersistence.test.ts`, `projectStorage.test.ts` |
| PLUG-T10~T12 | 三浏览器/a11y、ordered multi-instance chain 与全质量门禁 | Plugin SDK | 已通过：Playwright Chromium/Firefox/WebKit 24/24；unit 316/316、typecheck、build、size、diff 均通过 |
| PLUG-T13~T15 / PLUG-E2E-02 | 既有 MIDI Part 热切换当前 instrument、fallback/删除/释放与真实持续发声 | PLUG-INST-02 | 已通过：动态实例与 releaseAll 单测；三浏览器真实 Track→Bus meter |
| PLUG-UI-T02-01~02 / PLUG-E2E-03 | Inspector resize/maximize、cleanup、焦点与零持久副作用 | PLUG-UI-02 | 已通过：store 4/4；三浏览器 workspace 路径 |
| MIX-ROUTE-T04-01~02 / MIX-E2E-04 | Route 默认关闭、pending cancel、graph/zoom 保持与 expanded layout | MIX-ROUTE-04 | 已通过：Mixer UI store 与三浏览器 workspace 路径 |
| MIX-UI-T01-01~02 / MIX-E2E-05 | Track strip 独立宽度、删除清理、滚动/sticky Master | MIX-UI-01 | 已通过：store 与三浏览器 workspace 路径 |
| PLUG-EQ-T04~05 / PLUG-EQ-E2E-02 | compact display identity 与 Light/Dark/System 视觉/音频隔离 | PLUG-EQ-02 | 已通过：stable 32 参数与 computed SVG fill 主题切换 |
| TRN-T07-01~04 / TRN-E2E-07 | idle Stop no-op、状态机、voice cleanup 与 glyph | FR-TRN-07 | 已通过：controller/Store/AudioEngine 与三浏览器 glyph/time 路径 |
| PROJ-T09-01~07 / PROJ-E2E-09 | 统一 Project dirty/source/identity/baseline/迁移事务与 UI | FR-PROJ-09 | 已通过：IDB rollback、recovery queue、GitHub baseline、MIDI/Mic old-after-new ownership 与 Project Center |
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


REC-PRO-05 最终证据（2026-08-24）：目标录音/Count-in/Store 回归 53/53；全量 Vitest 51 files、322/322；TypeScript no-emit、production build、`git diff --check` 通过；bundle 为 DAWApp 394.38/400 KiB、Tone 263.30/300 KiB、React 189.40/220 KiB、ExportModal 19.63/40 KiB；完整 Playwright Chromium/Firefox/WebKit 33/33，其中 REC-E2E-05 9/9。首次独立调用链复审发现 Count-in 启动后权限失败未回滚 Transport 的 P1，修复为仅回滚本次 Count-in 启动的播放并恢复原播放头；二次复审 **PASS，无 P0/P1**，仅记录非阻断 P3。

Batch E2 最终证据：全量 Vitest 53 files、336/336；TypeScript no-emit、production build、`npm audit`（0 vulnerabilities）与 `git diff --check` 通过；bundle 为 DAWApp 399.30/400 KiB、Tone 267.40/300 KiB、React 189.40/220 KiB、ExportModal 19.93/40 KiB、daw-domain 10.73/40 KiB、duckdaw-plugins 12.39/40 KiB。`MIX-E2E-03` Chromium/Firefox/WebKit 3/3，CI 等价单 worker/2 retries 完整矩阵 36/36 且最终运行未发生实际 retry。三轮独立调用链复审依次关闭 PRE Send gate、FFT fallback、Automation 跨图保持、lane 禁用/删除 override 清理及持久化重复 Send，最终结论 **PASS，无 P0/P1**。远端 CI、staging 部署和 DNS/TLS 不属于本地实现完成证据，仍按发布门禁单独验证。

历史资料仍按 `docs/specs/README.md` 的权威顺序处理，不覆盖本矩阵。

Batch I 最终本地证据（2026-08-24）：全量 Vitest 55 files、353/353；TypeScript no-emit、production build、`npm audit`（0 vulnerabilities）、冻结 bundle budget 与 `git diff --check` 通过；DAWApp 约 351.19/400 KiB、Tone 267.44/300、React 189.40/220、ExportModal 20/40。Playwright Chromium/Firefox/WebKit 覆盖 21 条用户路径/浏览器，包括 MIDI 热切换真实 Bus meter、idle Stop/glyph、workspace、统一 Project Center、source rollback、recovery serialization、Project replacement 与 MIDI/Mic old-after-new ownership。多轮独立真实调用链审查关闭全部录音/来源/voice 生命周期竞态，最终结论 **PASS，无 P0/P1**。远端 CI、Netlify staging 和精确 SHA 仍须在 push 后记录。
