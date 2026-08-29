# DuckDAW 浏览器原生 Plugin SDK 规格

> 状态：核心、PLUG-UI-01、PLUG-INST-02、PLUG-UI-02 与 PLUG-EQ-02 已实现并验证（2026-08-24）；格式：`.duckdaw` 2.1.0；目标发布：0.4.0。本文定义 DuckDAW 自有插件系统，不兼容也不依赖 VST/AU。

## 1. 范围与安全边界

DuckDAW Plugin 是构建时静态注册的 TypeScript/JavaScript 模块，分为 `instrument` 与 `effect`。插件可以组合 Tone.js/Web Audio 节点，但只能经宿主提供的 descriptor、registry 和 runtime lifecycle 接入。

首版允许：应用源码或 npm 包静态 `import` 后注册；同源打包资源；纯 JSON 参数状态；实时与 Tone.Offline 共用同一 factory。

首版禁止：运行时 URL import、`eval`/`new Function`、VST/AU、未经用户授权的网络请求、直接访问 Store/DOM/AudioEngine 私有状态。未知远程代码不得因为工程文件被打开而执行。第三方依赖必须精确锁定并完成许可证、安全、bundle 和浏览器审查。

## 2. 稳定需求

### PLUG-SDK-01：统一身份、描述符与 registry

每个插件定义必须有稳定 `id`、SemVer `version`、`kind`、名称、参数 schema 和 factory。ID 匹配 `^[a-z][a-z0-9]*(?:[._-][a-z0-9]+)+$`，长度不超过 128；`duckdaw.*` 为内置保留前缀。Registry 必须拒绝无效定义和重复 ID，并能按 kind 稳定排序列出插件。

```ts
type PluginKind = 'instrument' | 'effect';
type PluginParameterValue = number | string;

type PluginParameterDefinition =
  | { id: string; name: string; type: 'number'; defaultValue: number;
      min: number; max: number; step: number; unit?: string }
  | { id: string; name: string; type: 'enum'; defaultValue: string;
      values: readonly string[] };

interface PluginInstanceDescriptor {
  id: string;                         // 工程内稳定实例 ID
  pluginId: string;                   // registry identity
  pluginVersion: string;              // 创建/保存时插件版本
  enabled: boolean;
  parameters: Record<string, PluginParameterValue>;
}

interface PluginDefinitionBase {
  id: string;
  version: string;
  kind: PluginKind;
  name: string;
  description: string;
  parameters: readonly PluginParameterDefinition[];
}
```

参数规范化必须填入缺失默认值、把有限 number 钳位到范围并按 step 量化、拒绝 NaN/Infinity/对象/数组；未知参数作为 JSON primitive 原样保留，以便前向兼容。Descriptor 规范化不得修改输入对象。

### PLUG-SDK-02：统一生命周期与类别接口

Instrument factory 返回支持 `connect`、`triggerAttackRelease`、`setParameters`、`dispose` 的实例；Effect factory 返回支持 `connect`、`setParameters`、`dispose` 的串行处理实例。`dispose` 必须幂等。宿主在轨道/Bus/插件删除、类型切换和图重建时释放实例。

同一个 definition factory 必须同时用于实时和 `Tone.Offline`；禁止为离线导出维护第二套插件类型 switch。相同 descriptor 参数在两条路径必须创建同类型 Tone/Web Audio 节点。插件不得依赖 wall clock、DOM 或实时专属 Transport 状态。

### PLUG-INST-01：乐器插件主路径

MIDI Track 有且仅有一个 `instrumentPlugin`。UI 可以从 registry 的 instrument 列表选择并编辑声明式参数；一次选择或参数修改形成一个 undo 事务。音符调度必须调用该实例的 `triggerAttackRelease`。

未知/不可用 instrument descriptor 必须原样保存在工程和 UI 中，运行时使用 `duckdaw.instrument.synth` 发声并显示 unavailable 状态；不得静默改写保存值。

首批内置乐器：

| ID | 用户名称 | 目的 |
|---|---|---|
| `duckdaw.instrument.synth` | Poly Synth | 方波通用合成器，兼容 legacy synth |
| `duckdaw.instrument.keys` | Soft Keys | 三角波柔和键盘，兼容 legacy piano |
| `duckdaw.instrument.bass` | Analog Bass | 锯齿低音，兼容 legacy bass |
| `duckdaw.instrument.drums` | Membrane Drums | 膜鼓，兼容 legacy drum |
| `duckdaw.instrument.pluck` | Pluck | 拨弦示例插件 |

### PLUG-INST-02：MIDI 乐器热切换连续性

已有 `Tone.Part`/调度对象的事件回调必须在执行时按 Track ID 解析当前 instrument instance，禁止捕获可在 descriptor 替换、参数重建、Undo/Redo 或图同步时被 dispose 的实例。乐器热切换不得要求 Clip 内容变化，不得重复创建 schedule 或重复 note。

宿主先成功创建、参数化并连接候选实例，再原子替换 runtime map 和释放旧实例；factory 失败继续遵循 PLUG-INST-01 的内置 synth fallback。Track 删除后仍存活的回调必须安全 no-op；卸载、替换和失败路径保持 dispose 幂等。实时/离线仍使用同一 registry factory，descriptor identity 与 `.duckdaw` 2.1.0 不变。

### PLUG-FX-01：效果器插件链

Track 与 Bus 均可持有有序 `effectPlugins[]`。宿主按数组顺序串联 enabled 实例；disabled 和未知 effect 必须无声染直通（bypass）且描述符保留。UI 支持按 registry 添加、启停、删除和编辑参数；每次操作是一个 undo 事务。

首批内置效果器：

| ID | 用户名称 | 关键参数 |
|---|---|---|
| `duckdaw.effect.reverb` | Reverb | decay, wet |
| `duckdaw.effect.delay` | Feedback Delay | delayTime, feedback, wet |
| `duckdaw.effect.limiter` | Limiter | threshold |
| `duckdaw.effect.distortion` | Distortion | distortion, wet |
| `duckdaw.effect.chorus` | Chorus | frequency, delayTime, depth, wet |
| `duckdaw.effect.parametric-eq` | Parametric EQ | 8 × enabled/frequency/gain/Q |

### PLUG-EQ-01：可视化频谱参数均衡器

- EQ descriptor 固定包含 8 个 band slot；每个 slot 使用有限 number 参数 `bandNEnabled` (`0|1`)、`bandNFrequency` (`20..20000 Hz`)、`bandNGain` (`-24..24 dB`) 和 `bandNQ` (`0.1..18`)。未启用 slot 的 gain 视为 `0 dB`，因此新增/删除点无需 schema 或格式变更。
- Factory 必须构造串行 peaking filter，并以旁路 FFT 分析输出而不产生第二条可听信号路径；`EffectPluginInstance.getFrequencyData?()` 是只读宿主能力，返回当前 dB bins 的副本或 `undefined`，不得暴露可变 AudioNode。
- Inspector 对该内置 ID 使用专用可视化编辑器而非 32 个通用 slider：对数 X 轴 `20..20000 Hz`，Y 轴 `-24..24 dB`；单击增加、拖拽、Q 编辑和删除都更新同一 descriptor。频谱读取只在 Inspector 挂载且页面可见时运行，并在卸载时取消 animation frame。
- 实时/离线仍调用同一个 definition factory；离线无需消费 FFT 数据，但必须释放 analyser 和全部 filters。Track/Bus 删除、插件 bypass/删除、参数替换、路由图重建均遵守 PLUG-SDK-02 dispose 规则。

### PLUG-EQ-02：紧凑名称与主题自适应

内置定义的用户名称为 `Parametric EQ`。该变化仅限 display metadata；stable ID `duckdaw.effect.parametric-eq`、版本、instance ID、8 个 band slot、32 个参数 ID/范围、legacy/unknown descriptor 往返全部保持不变，不增加 `shortName` schema。

Inspector 图必须从当前 Light/Dark/System 最终主题获取背景、网格、刻度、response、spectrum、selected/focus token。切换主题不得调用 plugin factory、重建滤波器、修改参数、dirty 或 undo。analyser 缺失/失败时仍保留主题正确的静态曲线。

### PLUG-UI-01：Track 选择、Mixer 链概览与右侧 Inspector

- MIDI Track 的乐器选择器必须位于 ArrangeView 左侧 TrackHeader；Audio Track 不显示乐器选择器。选择新乐器以一次 `updateTrack` 原子替换 descriptor，并可由一次 undo 撤销。
- 乐器和效果器的完整 number/enum 参数编辑只出现在应用右侧 `Plugin Inspector`；Inspector target 是 session UI state，不写入 `.duckdaw`、不设置 dirty、不开启 undo 事务。关闭 Inspector 不修改插件数据。
- TrackHeader 提供打开当前 instrument 详情的按钮；Mixer 的 Track/Bus 通道仅显示有序 effect chain 概览、添加、打开详情、enabled、删除、上移和下移，不在通道内展开参数。
- 每个 Track/Bus 可包含零到多个 effect instances，也允许同一 plugin definition 的多个实例；实例以 descriptor `id` 区分。
- 调序必须原子替换 `effectPlugins[]`，每次有效上移/下移是一个 undo 事务；首项上移和末项下移禁用且不产生事务。Realtime、offline 与持久化继续按该数组顺序工作。
- 添加 effect 后自动打开其 Inspector；移除当前 inspected effect 或删除 owner 后 Inspector 显示关闭状态，不得引用失效 descriptor。未知插件保留并显示 `Unavailable: <pluginId>`，不渲染未知参数控件。
现有 Track `reverb/delay` 保留为 legacy 快捷处理和既有 automation target；它们不冒充通用插件槽。新通用 Track effects 位于 Channel 后、legacy Delay/Reverb 前。Bus effects 使用 `effectPlugins`；2.0 `effects` 只作为迁移/降级镜像。

### PLUG-UI-02：Inspector 尺寸与工作区最大化

Inspector 默认宽 320px，可通过左侧可访问 separator 调整到 `280..min(720, viewportWidth-320)`，并保证主工作区至少 320px。Pointer capture 的 up/cancel、Escape、卸载都必须清理临时拖拽；键盘支持 Arrow 16px、Shift+Arrow 64px、Home/End，并暴露 orientation/value/min/max。

Maximize 仅覆盖应用工作区，不调用浏览器 Fullscreen API；Restore/Escape 恢复原宽与触发焦点。关闭后 maximized 复位，session 内重开保留正常宽度。target、width、maximized 均不进入 descriptor、package、recovery、dirty 或 undo，尺寸变化不得重建/释放插件实例。

### PLUG-FMT-01：2.1.0 持久化与迁移

2.1.0 在 Track 新增 `instrumentPlugin?`、`effectPlugins?`，在 Bus 新增 `effectPlugins?`。旧字段在 2.1 写出期间保留为兼容镜像：内置 instrument 映射回旧 `instrument`；reverb/delay/limiter Bus 插件映射回旧 `effects`，其他效果只存在于新链。

加载规则：

1. 有 2.1 descriptor 时优先使用并校验；
2. 缺少 `instrumentPlugin` 时从 legacy `instrument/env` 生成 descriptor；
3. 缺少 Bus `effectPlugins` 时从 2.0 `effects` 生成 descriptor；
4. 缺少 Track `effectPlugins` 时生成空数组；
5. descriptor/schema/registry 规范化失败时整个 load 失败，活动工程不替换；
6. 未注册但结构有效的 descriptor 允许加载并原样保存；
7. Audio Track 不得拥有有行为意义的 instrumentPlugin。

从 2.1 保存后由 2.0 客户端打开时，仅 legacy 镜像可用；2.0 客户端无法呈现的新插件不得被描述为向后功能等价。

### PLUG-DEV-01：第三方开发接入

开发者只需导出符合 `InstrumentPluginDefinition` 或 `EffectPluginDefinition` 的对象，并在应用组合根静态注册：

```ts
import { registerDuckDawPlugin } from '@/lib/pluginSdk';
import { myEffect } from '@vendor/my-duckdaw-effect';

registerDuckDawPlugin(myEffect);
```

Registry 注册发生在音频图创建前。注册失败必须抛出可诊断错误并阻止不完整插件进入列表。第三方插件不得要求 Store action 或私有 engine map。

## 3. 错误、回滚与资源规则

- 重复 ID、错误 kind、非法 SemVer、重复参数 ID和非法默认值：注册失败，无部分注册。
- 用户参数超范围：钳位；非有限 number/非法 enum：回退定义默认值。
- Effect factory 抛错：该实例 bypass，其他链继续；UI 标记 unavailable/error。
- Instrument factory 抛错：尝试内置 synth fallback；fallback 也失败则该轨静音并报告错误。
- 图重建先创建候选实例；失败不得破坏最后一个有效工程描述符。
- 所有成功创建的 Tone nodes 在替换/删除/导出结束时 dispose；失败路径也释放已创建的前序节点。

## 4. 性能与交付约束

- 不新增运行时依赖；SDK 核心使用现有 TypeScript/Tone。
- 不提高 DAWApp 400 KiB、Tone 300 KiB、React 220 KiB、ExportModal 40 KiB 冻结预算。
- Plugin SDK/runtime/built-in catalog 使用独立 `duckdaw-plugins` chunk，冻结预算 40 KiB；该分块是架构边界，不得用于隐藏超限依赖。
- Registry 查询和参数规范化为同步确定性操作；不得在音频回调中 fetch 或解析工程文件。
- 首版插件 UI 使用声明式 number/enum 控件，保持键盘可达和可访问名称。

## 5. 验收矩阵

| 测试 ID | 可观察验收 |
|---|---|
| PLUG-T01 | 注册、按 kind 列表、重复/非法 ID/版本/参数定义拒绝 |
| PLUG-T02 | 参数默认、钳位、step、enum fallback、未知 primitive 保留且不改输入 |
| PLUG-T03 | legacy 4 种 instrument 和 3 种 Bus effects 确定性迁移到 2.1 descriptor |
| PLUG-T04 | 未知 instrument 保留但 runtime fallback synth；未知 effect bypass |
| PLUG-T05 | realtime audioEngine 与 offline ExportModal 都经同一 registry factory 创建 instrument/effect |
| PLUG-T06 | 插件替换、轨道删除、Bus 图重建会 dispose；失败创建释放前序实例 |
| PLUG-T07 | TrackHeader 选择 instrument；右侧 Inspector 修改 instrument/effect 参数；Mixer 添加/打开/启停/删除 effect，写入 Store 并可 undo；Mixer 不内联完整参数 |
| PLUG-T08 | 2.1 package round-trip 保留已知和未知 descriptors；无效 descriptor 原子拒绝 |
| PLUG-T09 | 五种 instrument、六种 effect 均已注册并能创建/释放实例 |
| PLUG-T10 | Chromium/Firefox/WebKit 用户路径和 serious/critical axe 通过 |
| PLUG-T11 | unit、typecheck、build、bundle budgets、diff gates 全通过 |
| PLUG-T12 | 同一 Track/Bus 添加多个 effect instances；上/下移动保持 descriptor 顺序并以一次 undo/redo 恢复；realtime/offline/package 顺序一致 |
| PLUG-EQ-T01 | 8 个 band 参数默认/钳位；factory 建立 peaking filters，setParameters 更新且 dispose 幂等释放 filter/FFT |
| PLUG-EQ-T02 | Inspector 频谱 fallback、加点/拖点/Q/删除、8 点上限与每手势单 undo；Track/Bus descriptor 往返 |
| PLUG-EQ-T03 | realtime 与 offline 使用同一 EQ factory；关闭 Inspector、删除插件和 Bus 图重建不残留 RAF/analyser |
| PLUG-T13 | 同一 MIDI Part callback 在 instrument A→B 热切换后只触发当前 B，A dispose 一次且 schedule 不重复 |
| PLUG-T14 | 参数重建、播放中切换与 Undo/Redo 后既有 callback 始终命中当前实例，音符不漏发/重复 |
| PLUG-T15 | instrument factory fallback、Track 删除后的 callback no-op 与其他轨隔离，失败/删除资源幂等释放 |
| PLUG-UI-T02-01 | Inspector pointer/keyboard resize、viewport clamp、pointercancel/unmount cleanup，零 dirty/undo/package 副作用 |
| PLUG-UI-T02-02 | Maximize/Restore/Escape、触发焦点恢复、关闭重开保留宽度且不重建插件 |
| PLUG-EQ-T04 | `Parametric EQ` display metadata 改变但 plugin/instance/parameter IDs、版本和 package round-trip 不变 |
| PLUG-EQ-T05 | Light/Dark/System computed visual token 改变，切换前后参数、descriptor、factory/engine active 状态不变 |


### 5.1 交付证据（2026-08-20）

- `pluginSdk.test.ts`：registry、definition/descriptor/schema、参数规范化、legacy mapping 与 5 instruments + 6 effects catalog。
- `pluginRuntime.test.ts`：共享 factory、unknown/kind mismatch、Instrument factory 抛错回退 synth、fallback 失败静音、Effect factory 抛错 bypass 且后续链继续。
- `audioEnginePlugin.test.ts`：可注入 registry 的真实 `syncTracks`/`syncRouting`、替换/删除/Bus rebuild dispose、MIDI `Tone.Part` 调度到 plugin `triggerAttackRelease`、5 instruments + 6 effects factory 创建/触发/幂等释放。
- `pluginPersistence.test.ts` 与 `projectStorage.test.ts`：2.1 migration/round-trip、unknown descriptor 保留、无效嵌套参数与 Audio Track instrument 原子拒绝。
- `PLUG-E2E-01`：TrackHeader 选择乐器、右侧 Inspector 参数、Mixer Track 多 Effect 添加/打开/调序及 undo/redo；Chromium/Firefox/WebKit 均通过。
- `PLUG-EQ-01` 最终证据：`parametricEq.test.ts` 覆盖 8 band/32 number 参数和边界；`audioEnginePlugin.test.ts` 覆盖 filter factory、FFT 构造/连接/读取 fallback 与 dispose；`pluginPersistence.test.ts` 覆盖 Track/Bus 2.1 往返；`MIX-E2E-03` 三浏览器验证 Bus 挂载、键盘/指针点编辑、Solo→Bus meter 和 unsupported analyser fallback。
- 质量门禁：完整 unit、TypeScript no-emit、production build、bundle size、三浏览器 E2E、audit 与 `git diff --check` 均通过；Vitest 53 files/336 tests，Playwright 36/36；DAWApp 399.30/400 KiB，`duckdaw-plugins` 12.39/40 KiB。
- 独立审查：核心 SDK 首次复审发现第三方 factory 抛错降级缺口并修复；参数 EQ/路由/Solo 三轮调用链复审继续关闭 PRE gate、FFT fallback、Automation override 生命周期和持久化重复 Send；最终结论 **PASS，无 P0/P1**。
## 6. 非目标与后续扩展

本批不承诺运行时安装市场、签名包、AudioWorklet 沙箱、任意采样器资源包或跨进程崩溃隔离。插件参数 Automation 已转由 [`09-automation.md`](./09-automation.md) 的 AUTO-02 冻结；其完成状态不得仅由 Plugin SDK 类型存在推断。
