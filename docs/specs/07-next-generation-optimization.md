# DuckDAW 下一代优化计划（SDD / TDD）

> 状态：执行中。基线提交：`1b8526d`。开发分支：`feat/duckdaw-next`。本文件把交互、功能完整性、性能、测试和发布建议转换为有稳定 ID 的交付契约；不得以仅有 UI、状态位或占位字段宣称完成。

## 1. 目标与范围

本计划在保持现有 33 条 FR 全部通过的前提下，交付以下完整增量：

1. 大工程下的增量恢复、增量音频调度、资源缓存、渲染虚拟化和按需加载；
2. 应用内确认/输入/冲突决策、快捷键帮助、空状态、操作公告和完整焦点管理；
3. 非破坏性音频 Split/Trim/Offset/Fade/Gain/Reverse 与统一波形交互；
4. SMF 导入导出、Velocity Lane、Transpose/Humanize/Legato；
5. 设备选择、Count-in/Pre-roll、输入电平、Overdub 和 Takes；
6. Automation、Tempo Track、Bus/Send、Limiter、Tail、Normalize 和 Stems；
7. GitHub 基准 SHA、冲突决策、本地备份和可选 OAuth 迁移边界；
8. Playwright 浏览器矩阵、CI/CD、依赖治理、bundle/performance budget 和自动发布。

不在本计划中：第三方 VST/AU 插件加载、多人实时协作、云端托管工程数据库。它们需要独立安全模型。

## 2. 全局交付原则

### 2.1 SDD

每个批次开始前必须冻结：需求 ID、用户行为、领域 API、数据不变量、格式版本、迁移、失败反馈、性能阈值和测试 ID。发现设计冲突时先改本文件，不先改实现。

### 2.2 TDD

每个行为按以下顺序完成：

1. 新增失败测试并记录红灯输出；
2. 实现最小领域行为；
3. 定向测试转绿；
4. 补边界、取消、权限和资源释放测试；
5. 运行全量 test/lint/build；
6. 更新追踪矩阵和状态。

### 2.3 兼容性

- v1.1 文件必须始终可加载；
- v1.2 新字段均可选，缺失时迁移为安全默认值；
- v2.0 引入 Tempo 积分和 Bus 图，加载 v1.x 时生成恒速 Tempo 和 Master Bus；
- 旧版本不得静默丢弃已理解的新字段；未来主版本继续拒绝；
- 任一迁移失败必须保留当前工程状态。

## 3. 非功能预算

| ID | 指标 | 验收阈值 |
|---|---|---|
| NFR-PERF-01 | 500 clips 时间轴编辑 | pointer preview 帧率目标 ≥55 FPS，commit p95 <50 ms |
| NFR-PERF-02 | 100 clips 单项调度更新 | 不 dispose 未变化节点；同步 p95 <10 ms |
| NFR-PERF-03 | MIDI-only 自动恢复 | 不重复写音频 Blob；JSON 快照目标 <200 KB、主线程 p95 <50 ms |
| NFR-PERF-04 | 资源缓存 | 相同资源只解码一次；释放后可回收；默认缓存预算 256 MiB |
| NFR-PERF-05 | 初始加载 | Export/FFmpeg、Mixer、Piano Roll 按需加载；初始 gzip 预算在基线基础上下降且 CI 锁定 |
| NFR-AUDIO-01 | 实时/离线一致 | 共享参数/时间计划；确定性场景差值目标低于 -60 dBFS |
| NFR-AUDIO-02 | 导出削波 | Limiter 开启时 peak 不超过配置 ceiling（默认 -1 dBFS） |
| NFR-A11Y-01 | 键盘与语义 | 关键流程无键盘陷阱；自动 axe 严重/高等级问题为 0 |
| NFR-REL-01 | 生命周期 | 20 次加载/删除循环后无增长中的 Tone 节点、MediaStream、Blob URL 所有权 |
| NFR-CI-01 | 门禁 | test、typecheck、build、E2E、audit、bundle budget 任一失败阻止部署 |

阈值需以自动化 benchmark 或浏览器性能记录验证；CI 环境抖动使用中位数/p95 和合理容差，禁止脆弱的单次绝对时间断言。

## 4. 格式演进

### 4.1 v1.2.0：非破坏性编辑、Takes 与 Automation

```ts
interface AudioEditParamsV1_2 {
  sourceOffsetSeconds: number;   // >= 0
  gainDb: number;                // -60..24
  fadeInBeats: number;           // >= 0
  fadeOutBeats: number;          // >= 0
  fadeInCurve: 'linear' | 'exponential' | 'sCurve' | 'logarithmic';
  fadeOutCurve: 'linear' | 'exponential' | 'sCurve' | 'logarithmic';
  reversed: boolean;
}

interface TakeV1_2 {
  id: string;
  name: string;
  type: 'midi' | 'audio';
  notes?: NoteV1_1[];
  resourceId?: string;
  mimeType?: string;
  duration: number;
  createdAt: string;
}

interface AutomationPointV1_2 {
  id: string;
  beat: number;
  value: number;
  curve: 'step' | 'linear' | 'exponential';
}

interface AutomationLaneV1_2 {
  id: string;
  target: 'volume' | 'pan' | 'reverb' | 'delay' | 'masterVolume';
  enabled: boolean;
  points: AutomationPointV1_2[];
}
```

`Clip` 增加可选 `audioEdit/takes/activeTakeId`；`Track` 增加可选 `automationLanes`。v1.1→v1.2 迁移仅填默认值，不改变听感。

不变量：
- MIDI Clip 不得有 `audioEdit`；
- `sourceOffsetSeconds + audibleDurationSeconds <= sourceDurationSeconds`；
- `fadeInBeats + fadeOutBeats <= clip.duration`；
- Take 类型必须与 Clip/Track 一致；活动 Take 必须存在；
- Automation beat 非负、ID 唯一、按 beat 稳定排序，指数曲线不得跨越非法值域。

### 4.2 v2.0.0：Tempo 与 Bus 路由

```ts
interface TempoPointV2 {
  id: string;
  beat: number;
  bpm: number;                   // 20..300
  curve: 'step' | 'linear';
}

interface BusV2 {
  id: string;
  name: string;
  volume: number;
  pan: number;
  isMuted: boolean;
  effects: EffectDescriptorV2[];
  outputBusId: string | null;    // null = destination
}

interface SendV2 {
  id: string;
  sourceTrackId?: string;
  sourceBusId?: string;
  targetBusId: string;
  gain: number;
  preFader: boolean;
}
```

v1.x→v2：现有 BPM 生成 beat 0 的 step TempoPoint；生成唯一 Master Bus；所有轨道输出到 Master。Bus/Send 图必须为 DAG，拒绝环、悬空引用和重复 ID。

## 5. 领域 API 契约

### 5.1 恢复与资产

- `saveRecoveryMetadata(state): Promise<RecoveryMetadata>`：仅写项目 JSON/资源引用；
- `putRecoveryAsset(blob, mime): Promise<ResourceId>`：内容寻址并去重；
- `restoreIncrementalRecovery(): Promise<PersistedProjectState | null>`；
- `clearIncrementalRecovery({ retainSharedAssets? }): Promise<void>`；
- 资源写入失败不得替换最后一个可恢复快照。

### 5.2 AudioEngine 与缓存

- `syncClipsDiff(previous, next)` 按 clip ID 和调度签名 create/update/dispose；
- `AudioBufferCache.acquire(resourceKey)` / `release(resourceKey)`；
- 调度签名包含时间、内容、source offset、gain/fade/reverse、活动 take 和 tempo revision；
- Track mix 参数变化不得重建无关 Clip Player/Part。

### 5.3 非破坏性编辑

- `splitClipAtBeat(id, beat)`；
- `trimClipStart(id, newStartBeat)` / `trimClipEnd(id, newEndBeat)`；
- `setClipGain(id, gainDb)`；
- `setClipFade(id, edge, beats, curve)`；
- `toggleClipReverse(id)`；
- `computeClipPlaybackPlan(clip, tempoMap)` 为实时/离线共享纯函数。

所有一次用户动作形成一个 undo step；共享同一 Blob URL 的 split 片段使用引用所有权，不提前 revoke。

### 5.4 MIDI 与录音

- `importSmf(bytes, options)` / `exportSmf(project, options)`；
- `transformNotes(ids, { transpose, humanize, legato })`；
- `enumerateMidiInputs()` / `selectMidiInput(id)`；
- `enumerateAudioInputs()` / `selectAudioInput(id)`；
- `startRecording({ countInBars, preRollBars, mode })`；
- `startAudioRecordingWithPlayback({ startCapture, getCurrentBeat, isPlaybackActive, startPlayback })`：成功顺序固定为 capture active → sample beat → 必要时 start Transport；已播放时不重启，capture 失败时不启动播放；
- `commitTake(recording)` / `setActiveTake(clipId, takeId)`。

**REC-PRO-05** 冻结 Audio Track accompaniment recording：录音状态本身不得伪造 `isPlaying`；从停止状态开始录音时，在采集真正 active 后启动 Transport，其他 Track 继续按实时图播放；已播放时不得中断/重启 Transport，且起点按授权完成后的当前 beat 对齐。停止录音不停止播放，全局 Stop 除外。Count-in 取消、权限失败、无效目标不得延迟启动采集或创建 Clip；所有输入资源按 FR-AUD-02 释放。该增量不新增持久字段、不改变 package 版本，也不承诺输入直通监听。

随机 Humanize 必须接受可注入 RNG/seed，测试和重复导出可确定。

### 5.5 Automation、Tempo、Bus 和导出

- `addAutomationLane/updateAutomationPoints/evaluateAutomationAtBeat`；
- `setTempoPoints`、`beatsToSecondsWithTempoMap`、`secondsToBeatsWithTempoMap`；
- `addBus/addSend/validateRoutingGraph`；
- `createRenderPlan({ range, includeTail, tailSeconds, normalize, limiter, stems })`；
- `renderMaster` 与 `renderStems` 复用相同 Track/Bus/Automation 图。

导出合同冻结如下：

- **EXPORT-02**：完整工程或 Loop Selection 的内容长度必须按 Tempo Map 的绝对 beat 积分差计算；`includeTail` 默认开启，`tailSeconds` 默认 `2`、允许 `0..30` 秒，tail 仅延长离线渲染终点，不移动内容、Automation 或源素材 offset。关闭 tail 时输出严格止于选择/内容终点。
- **EXPORT-03**：Master 后处理顺序固定为 `render -> normalize -> limiter -> encode`。Normalize 以绝对 sample peak 缩放到目标 ceiling，不对全静音或非有限样本产生增益；Limiter 默认开启、ceiling 默认 `-1 dBFS`，允许 `-24..0 dBFS`，输出 sample peak 不得超过 ceiling。所有声道使用同一增益，禁止破坏立体声像。关闭两者时不得改变浮点样本。
- **EXPORT-04**：Stems 以当前活动编排中的 Track 为单位，文件名经确定性安全化并包含稳定 Track ID；每个 stem 都通过与 Master 相同的 Track/Bus/Send/Automation/Tempo 图，以 solo-source 方式离线渲染。线性图且 Normalize/Limiter 关闭时，stems 的 sample-wise sum 与一次 Master 渲染差值目标低于 `-60 dBFS`；共享非线性效果或 Master 后处理开启时不宣称可加和，但渲染参数和图必须一致。
- WAV 编码固定为 interleaved PCM16，并对每个 sample 钳位；MP3/OGG 转码与临时文件必须在成功或失败后删除。每个 `Blob URL` 在触发下载后释放；多 stem 使用一个 ZIP 下载，失败不得留下半套下载。
- 支持 `44100/48000/96000 Hz`；非法 region、空工程、非法 tail/ceiling、无有效 stem、非有限 PCM 必须在下载前拒绝。取消/关闭在渲染中禁用，完成或失败必须停止进度 timer 并释放本次渲染拥有的临时资源。

### 5.6 UI 决策

- `requestDecision<T>(descriptor): Promise<T>` 统一 confirm、三选项恢复和冲突决策；
- `announce(message, politeness)` 统一屏幕阅读器公告；
- Modal 打开时保存触发元素，Tab 循环，Esc 按策略关闭，结束后恢复焦点；
- 冲突“覆盖远端”必须二次明确确认并携带最后观测 SHA；“保留两份”写新路径；“拉取远端”先创建本地恢复快照。

### 5.7 GitHub Sync 冲突合同

- Baseline SHA 按规范化后的 `owner/repo + path` 持久化在本机非凭据存储中；Token 仍仅允许 `sessionStorage`。仅在远端加载成功、普通保存成功、另存副本成功或强制覆盖成功后提交对应 baseline；失败、取消或远端包校验失败不得推进 baseline。
- 已有 baseline 的普通保存必须把该 SHA 放入 GitHub Contents `PUT` body；成功后从响应 `content.sha` 更新 baseline。无 baseline 且路径不存在时允许无 SHA 创建；无 baseline 但路径已存在时直接进入冲突决策，禁止静默覆盖。
- HTTP `409` 表示 baseline 已过期：先读取并冻结最新远端内容和 SHA，再显示四路决策。非 `409` 的 `401/403/404/422/5xx` 保留本地 dirty/recovery/baseline 并报告 GitHub message。
- **取消**：不发出后续写请求，不改 path、baseline、dirty、工程或恢复快照。
- **保留两份**：要求新的 `.duckdaw` path，以无 SHA `PUT` 创建；成功后切换当前 path、写入新 path baseline、清 dirty/恢复快照。目标已存在或写入失败时原 path/baseline/dirty 保持不变。
- **拉取远端**：必须先成功写本地 recovery，再校验冻结的远端包并原子替换工程；替换成功后才更新 baseline。Recovery 或加载失败时当前工程及 baseline 不变，并保留上一个有效 recovery。
- **覆盖远端**：在二次危险确认中显示冻结的最后观测 SHA；确认后先成功写 recovery，再使用完全相同 SHA 发 `PUT`。若再次 `409`，不得自动重试或改用更新 SHA；本地 dirty/baseline 保持，要求用户重新决策。

### 5.8 浏览器、CI/CD 与发布合同

- **E2E-01**：同一套 Playwright 用例必须在 Chromium、Firefox、WebKit 运行，覆盖空工程新建、MIDI Track/Clip 编辑、`.duckdaw` 下载保存、增加未保存修改、从下载包重载并恢复保存时 Track/Clip 状态。
- **E2E-02**：浏览器用例必须覆盖一次 Undo/Redo、Audio Clip Reverse 后 Undo、Piano Roll note 选择与 Transpose 后音高变化，以及 dirty 编辑 2 秒增量 recovery、页面重载后的 Restore 决策和工程恢复。单元测试不能替代这些浏览器调用链。
- **E2E-03**：每个 browser project 都以 init script 显式移除 File System Access、Web MIDI 和 `getUserMedia`，断言保存降级为下载且 Settings 显示 MIDI/Mic unsupported 状态；测试不得依赖测试机真实设备或权限。
- Playwright 默认在本地启动 production preview；`PLAYWRIGHT_BASE_URL` 存在时改测已部署 URL且不得启动本地 server。失败保留 trace、screenshot、video 和 HTML report，成功不保留大体积产物。
- **CI-01**：pull request 及 `main/staging` push 必须以 `npm ci` 复现锁文件，执行 unit/integration、TypeScript、build、bundle gate、`npm audit`，并行执行 Chromium/Firefox/WebKit E2E；任一失败阻止后续环境操作。
- **CI-02**：`staging` 只允许 Netlify branch deploy；`netlify.toml` 固定 `npm run build`、`dist`、Node 22、SPA `/* -> /index.html 200` 和静态资源缓存。`daw-sit.msqt.fun` smoke 必须验证 HTTPS、SPA deep link、页面 metadata 中 exact commit、`context=staging`、`branch=staging`，并运行三浏览器 smoke；禁止把预发 hostname 指向 production deploy。
- 构建把 commit/context/branch 写入 `html[data-duckdaw-*]` 和同名 `<meta>`。本地值为 `local`；Netlify staging context 必须注入 `DUCKDAW_DEPLOY_ENV=staging`。
- **DEP-01**：所有 package 版本及安全 overrides 使用精确版本；删除前全库证明无引用；禁止 `audit fix --force`；CI 的 high/critical audit 必须为零，候选审查记录完整 audit 结果和 Playwright Apache-2.0 许可。
- **RELEASE-01**：候选版本使用 `0.3.0-rc.1`；CHANGELOG 记录 Batch E–F、迁移和已知浏览器边界。Release workflow 仅允许手动输入已验证 tag/commit，在 exact commit 全门禁和生产 metadata smoke 通过后创建 GitHub Release；workflow 本身不修改 DNS、不绕过 branch protection、不自动把 staging 推进生产。

## 6. 需求批次

### Batch A：性能与稳定性（格式保持 1.1）

| ID | 需求 | 核心测试 |
|---|---|---|
| PERF-01 | 增量 Recovery JSON/Blob 分离与资源去重 | `incrementalRecovery.test.ts` |
| PERF-02 | Clip diff 不重建未变化节点 | `audioEngineDiff.test.ts` |
| PERF-03 | AudioBuffer 引用计数/LRU 与失败重试 | `audioBufferCache.test.ts` |
| PERF-04 | Store selector 和派生活动编排缓存 | render-count contract |
| PERF-05 | 时间轴/Piano Roll viewport 裁剪 | 500 clips DOM/计算窗口测试 |
| PERF-06 | Export/Mixer/Piano Roll lazy load | build manifest/bundle test |
| PERF-07 | FFmpeg core 同源/self-hosted，离线可用 | URL/config test |
| PERF-08 | perf marks、基准和泄漏计数器 | benchmark + lifecycle test |

### Batch B：交互与可访问性（格式保持 1.1）

| ID | 需求 | 核心测试 |
|---|---|---|
| UX-01 | DecisionModal 替代 confirm/prompt | focus/choice test |
| UX-02 | Recovery 三选项 | restore/discard/later test |
| UX-03 | GitHub 冲突覆盖/保留两份/拉取/取消 | mocked API integration |
| UX-04 | 快捷键帮助与命令可发现性 | shortcut registry test |
| UX-05 | 空工程 CTA、首次引导和状态栏 | component test |
| UX-06 | aria-live、进度、禁用原因和键盘滑杆 | axe/keyboard test |

### Batch C：基础音频编辑（格式升级 1.2）

| ID | 需求 | 核心测试 |
|---|---|---|
| AUD-EDIT-01 | Audio/MIDI Split 与共享资源所有权 | `audioEditing.test.ts` |
| AUD-EDIT-02 | Trim/Source Offset | playback-plan test |
| AUD-EDIT-03 | Fade 曲线和约束 | curve boundary test |
| AUD-EDIT-04 | Clip Gain | realtime/offline plan test |
| AUD-EDIT-05 | Reverse 与波形镜像 | cache/reverse test |
| AUD-EDIT-06 | v1.1→v1.2 迁移与往返 | format migration test |

### Batch D：MIDI 与专业录音（格式 1.2）

| ID | 需求 | 核心测试 |
|---|---|---|
| MIDI-IO-01 | SMF Type 0/1 导入 | fixture parsing test |
| MIDI-IO-02 | SMF 导出再导入音符误差 ≤1 tick | roundtrip test |
| MIDI-EDIT-01 | Velocity Lane | pointer transaction test |
| MIDI-EDIT-02 | Transpose/Humanize/Legato | seeded transform test |
| REC-PRO-01 | MIDI/Audio 设备选择和平台降级 | browser API mock test |
| REC-PRO-02 | 1/2/4 bar Count-in 与 Pre-roll | fake transport test |
| REC-PRO-03 | 输入电平与 clipping 公告 | meter test |
| REC-PRO-04 | Overdub/Takes 与一次 undo | recording transaction test |
| REC-PRO-05 | Audio Track 边播放边录制、起点对齐、停止后继续播放 | `audioRecording.test.ts` + `REC-E2E-05` |

### Batch E：Automation、Tempo、混音与导出（格式 1.2→2.0）

| ID | 需求 | 核心测试 |
|---|---|---|
| AUTO-01 | Volume/Pan/Reverb/Delay Automation | evaluator/ramp test |
| AUTO-02 | 任意稳定 Track/Instrument/Effect 参数控件直接创建 Automation，并在所属 Track 编辑曲线；详见 `09-automation.md` | target/store/curve/realtime-offline/E2E |
| TEMPO-01 | Step/Linear Tempo Map 和双向积分 | property/fixture test |
| MIX-ROUTE-01 | Bus/Group/Send DAG | cycle/reference test |
| MIX-ROUTE-02 | 实时/离线共用图构建 | graph snapshot test |
| EXPORT-02 | 可配置 effect tail | impulse duration test |
| EXPORT-03 | Master limiter/normalize | peak/RMS test |
| EXPORT-04 | Stems 和 master 一致性 | stems sum difference test |
| FORMAT-02 | v1.x→v2.0 迁移 | semantic roundtrip test |

### Batch E2：可视化混音与参数 EQ（格式保持 2.1）

状态：**已实现并验证**。全量 Vitest 53 files/336 tests、三浏览器 Playwright 36/36、typecheck/build/bundle/audit/diff 全部通过；最终独立复审 **PASS，无 P0/P1**。

| ID | 需求 | 核心测试 |
|---|---|---|
| MIX-ROUTE-03 | 节点/连线图显示 Track、Bus、Destination；OUT/PRE/POST→IN 创建 Output/Send；Bus 是完整可挂插件聚合通道 | `routingPatch.test.ts`, `routingStore.test.ts`, `MIX-E2E-03` |
| MIX-SOLO-01 | 宿主集中计算 Solo audibility，禁止 Tone 全局 Solo 静音 Bus；实时/Automation/离线一致 | `mixSettings.test.ts`, `audioEngineRouting.test.ts`, `audioEngineAutomation.test.ts` |
| PLUG-EQ-01 | 最多 8 点可视化 parametric EQ、实时 FFT、共享 factory、持久化和完整释放 | `parametricEq.test.ts`, `audioEnginePlugin.test.ts`, `pluginPersistence.test.ts`, `MIX-E2E-03` |

边界合同：连接候选必须先经 `validateRoutingGraph`，非法/环/重复连接零提交；有效连接和 EQ 单手势各一个 undo step。频谱 API 缺失时只隐藏动态 spectrum，不 bypass EQ。格式保持 `2.1.0`，EQ 仅使用现有 number descriptor，旧/未知 descriptor 往返规则不变。浏览器验收覆盖 pointer 与键盘端口连接、Bus 新建/聚合/挂 EQ、点增删拖拽、undo/redo、Solo 经 Bus 发声及 unsupported analyser fallback。

### Batch F：GitHub、E2E、CI/CD 与发布

| ID | 需求 | 核心测试/门禁 |
|---|---|---|
| SYNC-02 | 基准 SHA、冲突备份和四种决策 | API contract integration |
| E2E-01 | 新建→编辑→保存→重载 | Chromium/Firefox/WebKit |
| E2E-02 | Undo、音频编辑、MIDI transform、恢复 | browser E2E |
| E2E-03 | FSA/Web MIDI/Mic 不支持降级 | per-browser matrix |
| CI-01 | test/typecheck/build/E2E/audit/bundle | PR workflow |
| CI-02 | 双环境：`main`→Netlify production→Cloudflare DNS `daw.msqt.fun`；`staging`→Netlify branch deploy→`daw-sit.msqt.fun`，独立 smoke URL | branch deploy workflow |
| DEP-01 | 删除确认无引用依赖、精确升级漏洞 | `npm ls`/audit/build |
| RELEASE-01 | 版本、CHANGELOG、tag、GitHub Release | release workflow |

## 7. 风险与 Spike

1. **SMF 库**：先比较 `@tonejs/midi` 与 `midi-file` 的 Type-1、tempo、包体积；新增依赖必须固定精确版本。
2. **动态 Tempo**：验证 Tone Offline ramp；若不一致，统一使用纯函数将 beat 预转换为秒。
3. **Reverse**：优先使用解码缓存中的反向副本，不修改原始 AudioBuffer；预算纳入 LRU。
4. **FFmpeg**：WASM 大文件可能 OOM；Stems 顺序编码，WAV 不经过 FFmpeg；资源同源部署。
5. **Bus 环**：所有路由修改先对候选图拓扑排序，失败不提交 Store。
6. **Cloudflare DNS / Netlify 环境隔离**：保留现有生产链路 `main`→`duckdaw.netlify.app`→`daw.msqt.fun`；预发使用 `staging` 分支、Netlify branch deploy 和 `daw-sit.msqt.fun`。必须在 Netlify 侧把自定义预发域名绑定到 staging context，Cloudflare CNAME 单独指向分支部署；禁止预发域名回落到 production deployment。DNS、TLS、SPA fallback、缓存头和响应中的部署 commit 由 smoke test 覆盖。
7. **依赖漏洞**：禁止 `npm audit fix --force`；逐项验证 breaking change。

## 8. 完成与发布标准

每条需求完成必须满足：

- 规格、迁移和错误语义已冻结；
- 新测试先红后绿，正常/边界/失败/释放路径齐全；
- 全量 unit/integration/E2E、typecheck、build 通过；
- 性能与 bundle 未超过预算；
- 格式文档、追踪矩阵、CHANGELOG 同步；
- 独立审查无 P0/P1；
- 精确暂存，不提交本机 `.kiro/`、凭据或构建产物；
- 合并/推送后验证远端提交、CI、Netlify `main` 生产部署、`staging` 分支部署、Cloudflare DNS/TLS 和 Release。

## 9. 追踪状态

| Batch | 状态 | 格式 | 发布版本 |
|---|---|---|---|
| A 性能与稳定性 | 已实现：增量 recovery、clip diff、256 MiB decode cache、Arrange/Piano 二维裁剪、selector、lazy/vendor chunks、同源 FFmpeg、User Timing 与 size gate | 1.1.0 | 0.2.0-alpha.1 |
| B 交互与可访问性 | 已实现：统一 DecisionHost、恢复三选项、GitHub 409 四路决策与恢复快照、快捷键注册表/帮助、空状态 CTA、Toast/导出进度 ARIA、Mixer/时间轴滑杆语义、ConfirmModal 焦点管理 | 1.1.0 | 0.2.0-alpha.2 |
| C 基础音频编辑 | 已实现：v1.2 audioEdit migration/validation；Audio/MIDI Split；Audio Trim/Offset、Gain、Fade、Reverse；共享 Blob 所有权；实时/离线共用 playback plan；菜单、快捷键和波形反馈 | 1.2.0 | 0.2.0-beta.1 |
| D MIDI 与专业录音 | 已实现：SMF Type 0/1 import/export 实际按钮（Settings），导入写入 tracks/clips、导出当前 MIDI 下载；Velocity Lane pointer-drag 编辑（pause/resume 单 undo）；Transpose/Humanize/Legato toolbar 按钮接入 transformNotesInClip；MIDI/Audio 设备枚举 select 传 exact deviceId 给 connectMidiInputs/getUserMedia（unsupported 可见降级）；0/1/2/4 bar count-in 用户可配置并实际延迟录音启动（aria-live 倒计时）；REC-PRO-05 Audio Track 在 MediaRecorder active 后从当前 beat 边播放边录制，已播放不重启，停止录音继续播放，Count-in 失败/取消恢复原播放状态和播放头；InputMeter 挂载接收 MIDI noteOn velocity 和麦克风 dBFS analyser（clipping aria-live、原始流停止释放）；overdub 检测 existing clip 自动调用 commitOverdubRecording；Takes 可在 ClipItem 切换（switchTake）；完整本地门禁与独立复审 PASS，无 P0/P1 | 1.2.0 | 0.2.0-beta.2 |
| E Automation/Tempo/Mix/Export | 已实现并验证：step/linear Tempo Map 精确积分/逆解；Automation 校验、UI、undo 与实时/离线调度；v2 Master Bus/Bus/Send DAG、共享 Mix Graph；动态 Tempo export、0..30s tail、normalize→limiter→encode、PCM16 WAV 与 Track stems；v1.x 原子迁移 | 2.0.0 | 0.3.0-rc.1 |
| E2 可视化混音与参数 EQ | 已实现并验证：OUT/PRE/POST→IN 可视化路由、完整聚合 Bus、宿主集中 Solo gate 与 Automation override 生命周期、8-band 频谱参数 EQ、unsupported analyser fallback；完整本地门禁与独立复审 PASS，无 P0/P1 | 2.1.0 | 0.4.0 |
| F E2E/CI/CD/Release | 已实现并验证：GitHub baseline SHA/409 四路原子事务；exact 依赖与 0 audit；Chromium/Firefox/WebKit 18/18 产品 E2E；axe serious/critical；CI、Netlify staging context、部署 metadata、staging smoke 与 manual release workflow；FFmpeg notice/GPL/source 随部署并由 smoke 验证 | 2.0.0 | 0.3.0-rc.1 |
| G Browser Plugin SDK | 核心与 PLUG-UI-01 已实现；完整本地门禁与独立复审 PASS，无 P0/P1 | 2.1.0 | 0.4.0 |
| H 通用控件 Automation | AUTO-02 已实现；domain/store/audio/package、三浏览器真实控件→曲线→plugin→offline 路径及独立复审全部通过，无 P0/P1 | 2.1.0 optional extension | 0.4.0 |
