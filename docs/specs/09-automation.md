# 通用控件 Automation 规格

> 状态：AUTO-02 已实现并通过完整本地门禁与独立调用链复审（PASS，无 P0/P1）。本文冻结 FL Studio 风格“从控件创建 Automation，并在所属轨道直接编辑曲线”的增量合同；既有 AUTO-01 与旧工程保持兼容。

## 1. AUTO-02 用户合同

1. 每个具有稳定数值、枚举或布尔语义且能映射到 Track 音频图的控件都暴露同一 `Create automation` 动作。播放、打开、删除、排序、路由选择等命令型/结构型按钮不是参数，不显示伪 Automation 入口。
2. 首批绑定覆盖 Track volume/pan/reverb/delay、Track mute/solo，以及 Track 所有 Instrument/Effect instance 的 number/enum 参数。插件 bypass 会改变图拓扑，不冒充参数；只有插件将 bypass 声明为普通参数时才可自动化。Bus 尚无 Arrange Track lane，Bus 参数不错误挂靠到任意 Track。
3. 创建动作是一个 undo 事务：同 target 不重复创建；新 lane 启用，带当前值的 beat 0 `step` 点，并立即成为该 Track 当前可见 lane。重复动作只激活既有 lane，不改工程、不产生 undo/dirty。
4. ArrangeView 在对应 Track 内显示活动 lane 的标签、曲线与点。双击空白位置添加 snap 后的点；拖动点同时编辑 beat/value；删除、启停和精确表格编辑仍可由 AutomationPanel 完成。一次拖动只能形成一个 undo step。
5. number 参数支持 step/linear/exponential；enum/boolean 使用数值索引或 0/1 持久化并强制 step。UI、实时播放和离线导出使用相同的值转换和事件计划。
6. 删除 Track/plugin 后，失去 owner 的 lane 保留为 unavailable（避免静默数据丢失）但不调度；重新出现相同 instance ID/parameter 后恢复。未知但语法有效的动态 target 可往返；非法 target/range/value 仍原子拒绝工程加载。

## 2. Domain 与持久化合同

旧 target 原样有效：`volume | pan | reverb | delay | masterVolume`。新增 target：

```text
track.mute
track.solo
instrument:<pluginInstanceId>:<parameterId>
effect:<pluginInstanceId>:<parameterId>
```

`pluginInstanceId` 与 `parameterId` 不得包含 `:`，每段 1..128 字符。`AutomationLane` 追加可选元数据：

```ts
interface AutomationLane {
  id: string;
  target: AutomationTarget;
  enabled: boolean;
  points: AutomationPoint[];
  label?: string;                    // 1..160
  range?: { min: number; max: number }; // dynamic target 必需；finite，min < max
  valueType?: 'continuous' | 'discrete';
  values?: string[];                 // enum 的稳定 index→value 表；非空且唯一
}
```

- 旧 lane 缺元数据时按固定 target 值域恢复。
- dynamic target 必须带 range；`discrete` point 必须是范围内整数且 curve 为 `step`。
- number plugin 使用 definition 的 min/max；enum 使用 `0..values.length-1` 和定义时的 values 快照。
- 格式仍为向后兼容的 2.1 可选扩展；旧 reader 可保留未知字段，当前 reader 必须校验而非丢弃。

## 3. 实时/离线和生命周期

1. 固定 AudioParam target 继续使用 `generateAutomationSchedule`。
2. Plugin/boolean target 使用共享 `generateControlAutomationEvents`：离散 lane 只发 step 事件；连续 lane 以确定性、有限分辨率采样曲线，首/末点必达。Realtime 由 Transport 调度，offline 由 Offline context 调度；两者消费完全相同 `{time,value}` 计划。
3. 插件事件按 descriptor instance ID 找实例，将该实例当前 automation parameter map 与本事件合并后调用 `setParameters`，防止多参数 lane 相互覆盖。枚举索引按 lane `values` 转换为字符串。
4. resync/Track 删除必须 clear 所有 Transport schedule；插件实例仍由 AudioEngine/ExportModal 的既有 ownership 在替换、删除、成功或失败结束时 dispose。
5. target owner/parameter 不可用、值非有限或 converter 失败时跳过该 lane并保留工程；不得破坏其他 lane 或 effect chain。

## 4. 可访问性与失败语义

- 创建按钮 aria-label 为 `Create automation for <label> on <track>`；已有 lane 时为 `Show automation for ...`。
- 曲线区域有 `Automation curve for <label> on <track>`；每点为键盘可聚焦按钮并报告 beat/value。
- 无 Track owner（例如 Bus inspector）时不显示可执行入口；不得创建悬挂到随机 Track 的 lane。
- 边界拖动钳位 beat≥0、value 在 range 内；与同 lane 既有 beat 冲突时 no-op，保持前一有效状态。

## 5. 验收与追踪

| ID | 可观察证据 |
|---|---|
| AUTO-T02-01 | dynamic/legacy target 解析、range/discrete 校验、unknown round-trip 与 malformed rejection |
| AUTO-T02-02 | 从控件 ensure lane：beat 0 当前值、去重、激活、dirty/undo 单事务 |
| AUTO-T02-03 | Arrange 曲线 path、双击增点、点拖动钳位/冲突 no-op/单 undo |
| AUTO-T02-04 | Instrument number/enum 与 Track Effect 参数按 instance ID 调用 realtime `setParameters`；多参数不覆盖 |
| AUTO-T02-05 | Offline 消费同一 control event plan；未知 owner 跳过；成功/失败均 dispose |
| AUTO-E2E-02 | Chromium/Firefox/WebKit：Track slider 创建 lane→轨道曲线出现→增点/拖点→Inspector plugin 参数创建→播放/导出路径无错误→undo/redo |
| AUTO-T02-06 | 2.1 package save/load 保留 metadata；旧固定 lane 无迁移听感变化；全量 gates/budgets 通过 |

## 6. 本地交付证据（2026-08-20）

- AUTO-T02-01：`automationControl.test.ts` 覆盖 legacy/dynamic target、range/discrete/enum 校验及共享 control event plan。
- AUTO-T02-02：`automationWorkflow.test.ts` 覆盖 ensure beat-0 当前值、去重、单 undo 和 session-only active lane。
- AUTO-T02-04：`audioEngineAutomation.test.ts` 覆盖 Instrument 与 Track Effect descriptor instance ID、多个参数合并和 schedule clear。
- AUTO-T02-06：`projectStorage.test.ts` 20/20，覆盖 dynamic metadata 往返、缺失 range 原子拒绝与旧 lane 兼容。
- AUTO-E2E-02：Chromium/Firefox/WebKit 均通过 Volume 创建、双击增点、拖点单 undo/redo、Instrument Attack、Effect Drive 和真实 WAV offline download。
- 完整门禁：Vitest 50 files / 316 tests；Playwright 24/24；TypeScript no-emit、production build、`git diff --check` 通过。DAWApp 393.26/400 KiB、Tone 263.30/300 KiB、React 189.40/220 KiB、ExportModal 19.63/40 KiB。
- 独立审查：逐项核查 TrackHeader/Inspector/Mixer、ensure/曲线 undo、target persistence、AudioEngine/Export instance-ID 与 dispose 调用链，结论 **PASS，无 P0/P1**；记录 3 个不阻断 P2（浮点防御、descriptor 规范化时机、stale active lane fallback UX）。
