# DuckDAW 浏览器原生 Plugin SDK 规格

> 状态：已实现并验证（2026-08-20）；格式：`.duckdaw` 2.1.0；目标发布：0.4.0。本文定义 DuckDAW 自有插件系统，不兼容也不依赖 VST/AU。

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

现有 Track `reverb/delay` 保留为 legacy 快捷处理和既有 automation target；它们不冒充通用插件槽。新通用 Track effects 位于 Channel 后、legacy Delay/Reverb 前。Bus effects 使用 `effectPlugins`；2.0 `effects` 只作为迁移/降级镜像。

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
| PLUG-T07 | UI 选择 instrument、添加/启停/删除 effect、修改参数写入 Store 并可 undo |
| PLUG-T08 | 2.1 package round-trip 保留已知和未知 descriptors；无效 descriptor 原子拒绝 |
| PLUG-T09 | 五种 instrument、五种 effect 均已注册并能创建/释放实例 |
| PLUG-T10 | Chromium/Firefox/WebKit 用户路径和 serious/critical axe 通过 |
| PLUG-T11 | unit、typecheck、build、bundle budgets、diff gates 全通过 |


### 5.1 交付证据（2026-08-20）

- `pluginSdk.test.ts`：registry、definition/descriptor/schema、参数规范化、legacy mapping 与 5+5 catalog。
- `pluginRuntime.test.ts`：共享 factory、unknown/kind mismatch、Instrument factory 抛错回退 synth、fallback 失败静音、Effect factory 抛错 bypass 且后续链继续。
- `audioEnginePlugin.test.ts`：可注入 registry 的真实 `syncTracks`/`syncRouting`、替换/删除/Bus rebuild dispose、MIDI `Tone.Part` 调度到 plugin `triggerAttackRelease`、5+5 factory 创建/触发/幂等释放。
- `pluginPersistence.test.ts` 与 `projectStorage.test.ts`：2.1 migration/round-trip、unknown descriptor 保留、无效嵌套参数与 Audio Track instrument 原子拒绝。
- `PLUG-E2E-01`：Mixer 乐器选择、Track effect 添加和参数编辑、undo/redo；Chromium/Firefox/WebKit 均通过。首轮 Chromium 实测发现并修复 `PolySynth(PluckSynth)` 不合法的浏览器崩溃。
- 质量门禁：完整 unit、TypeScript no-emit、production build、bundle size、三浏览器 E2E、`git diff --check`、high-level audit 均通过；DAWApp 395.88/400 KiB，`duckdaw-plugins` 9.85/40 KiB。
- 独立审查：首次发现第三方 factory 抛错降级缺口；补充失败路径实现和测试后复审结论为 **PASS，无 P0/P1**。
## 6. 非目标与后续扩展

本批不承诺运行时安装市场、签名包、AudioWorklet 沙箱、任意采样器资源包、插件参数 automation 或跨进程崩溃隔离。这些能力必须另立规格；不能从本 SDK 类型存在推断为已实现。
