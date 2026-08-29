# DuckDAW 功能需求与验收标准

> 本文描述当前工作树。需求关键字“必须 / 应 / 可以”分别表示强制、推荐和可选。每条需求只有在实现、失败反馈和自动化/源码契约证据一致时标记为“已实现”。

## 1. 工程生命周期

### FR-PROJ-01 新建工程 — 已实现
- File 菜单可新建空工程；未保存更改先确认。
- 新工程重置工程级/选择状态、文件句柄和撤销历史，使用 120 BPM、4/4、Main Arrangement，并生成新 `projectId/createdAt`。
- 证据：`projectLifecycle.test.ts` 覆盖取消和确认、新身份、句柄与历史清理。

### FR-PROJ-02 保存与另存为 — 已实现
- `Ctrl/Cmd+S` 保存，`Ctrl/Cmd+Shift+S` 另存为；FSA 首存选路径、复存写回，无 FSA 时下载 `.duckdaw`。
- 保存返回 `saved|downloaded|skipped|cancelled`，仅真实成功清 dirty 和显示成功；音频资源读取失败使整个保存失败。
- 证据：`saveProject.test.ts` 覆盖四态；`projectStorage.test.ts` 覆盖资源失败原子性和稳定工程身份。

### FR-PROJ-03 打开工程 — 已实现
- 支持 `.duckdaw`/ZIP 和 legacy JSON；打开前确认未保存更改。
- 在替换 Store 前校验格式/版本、身份、大小/路径/资源、schema、ID 和类型引用；恢复全部持久化字段和 Blob URL 后一次提交，随后清撤销历史。
- 证据：`projectStorage.test.ts` 覆盖全字段往返、未来版本、身份不一致、缺资源、无效 MIDI/legacy 引用；`dawStore.test.ts` 覆盖原子替换和会话清理。

### FR-PROJ-04 最近项目 — 已实现（平台受限）
- FSA 浏览器保留最多 10 个最近句柄，按最近打开排序；权限失效时重新请求，拒绝后不替换当前工程。
- 无文件句柄能力的浏览器允许隐藏列表并使用导入入口。
- 证据：`projectStorage.ts` 的 `addToRecentProjects/openRecentProject`。

### FR-PROJ-05 脏状态与离页保护 — 已实现
- 所有持久化工程修改设 `isDirty=true`；成功保存/加载清除；dirty 时使用浏览器原生 `beforeunload` 保护。
- 选择、缩放、面板布局等 UI 会话状态不标脏。
- 证据：`dawStore.test.ts` 覆盖传输、节拍器和主音量 dirty；`DAWApp.tsx` 注册离页保护。

### FR-PROJ-06 自动保存与崩溃恢复 — 已实现
- 每次持久化编辑后 2 秒防抖写独立 IndexedDB 快照，不触发文件选择器。
- 启动时提供恢复、丢弃或稍后处理；恢复后保持 dirty，显式保存后清快照。
- 证据：`recovery.test.ts` 覆盖快照往返和 dirty 恢复；`DAWApp.tsx` 覆盖防抖与启动决策。

### FR-PROJ-07 模板 — 已实现
- 模板保留 BPM、拍号、轨道和参数结构，移除 clips/markers 及音频内容。
- 打开模板生成新工程身份、清文件句柄/恢复快照/撤销历史并标脏；支持列出和删除。
- 证据：`projectLifecycle.test.ts` 覆盖结构模板、新身份和删除。

### FR-PROJ-08 GitHub 同步 — 已实现（用户授权/网络受限）
- 用户提供 `owner/repo`、路径和 PAT 后，通过 GitHub Contents API 创建、携 SHA 更新和加载 `.duckdaw`；路径逐段编码，服务端错误通过 Toast 显示。
- 409 提供可行动冲突提示；加载遵循工程校验、dirty 确认和原子替换。
- PAT 仅存 `sessionStorage`，UI 明示风险并提供清除按钮，不进入工程、日志或 URL。OAuth 属后续部署增强，不是当前本地应用前置条件。
- 证据：`complianceContracts.test.ts` 锁定会话存储、风险文案、清除和 409 分支。

### FR-PROJ-09 统一 Project 工作流 — 已实现（2026-08-24）
- **Project 是唯一顶层工作概念**。顶栏 Project 入口集中提供 New Project、Recent Projects、Open Local Project、Save/Save As 与 GitHub Sync；Settings 不再重复承载工程导入导出或远端同步。`Recent Projects` 仅表示最多 10 个最近 File System Access 句柄，不冒充版本历史。
- Arrangement 保留为 Project 内部的独立时间线及 `.duckdaw` 2.1.0 兼容字段，不得改名、扁平化或迁移；界面不得把 Arrangement 呈现为与 Project 并列的打开/保存对象。
- 所有替换当前 Project 的入口必须执行同一事务：dirty 决策 → 临时读取/解包/校验/迁移 → 停止 transport/录音 → 原子 `replaceProject` → 切换来源绑定 → 清 undo、选择、Inspector 与过期 recovery。取消、权限拒绝、解析失败、网络失败或 GitHub 冲突取消时，当前 Project、文件句柄、baseline、dirty、undo 与 recovery 均保持不变。
- 从 Local、GitHub、SMF 或 Template 成功打开后不得保留不属于新 Project 的旧主文件句柄；仅 New/Template 生成新 `projectId`，Open/Save/Save As/Download/GitHub Sync 保持工程身份。PAT 仍仅存 `sessionStorage`。
- Project Center 的展开状态、当前来源提示和导航焦点是 session UI state，不进入 package、recovery、dirty 或 undo；本需求不升级 `.duckdaw` 2.1.0。
- 验收：`PROJ-T09-01~07` 覆盖 dirty cancel、旧句柄隔离、失败零提交、身份、来源 checkpoint、PAT/baseline 和迁移；`PROJ-E2E-09` 覆盖 New→Local→Recent（平台支持时）→GitHub mock 及 unsupported FSA。

## 2. 传输、时间轴与导航

### FR-TRN-01 播放、暂停、停止 — 已实现
- Play 从当前位置播放，再次触发暂停并保留位置；Stop 回到起点；首次音频操作从用户手势启动 Web Audio。
- Space 播放/暂停、Enter 停止，文本输入中不触发。
- 证据：`DAWApp.tsx`、`TopBar.tsx`、`audioEngine.ts`。

### FR-TRN-02 BPM 与拍号 — 已实现
- BPM 限制 20–300；支持 UI 拍号；标尺、循环、播放头、录音和导出统一以四分音符 beat 为内部单位。
- `beatsPerBar = numerator * 4 / denominator`，支持 3/4、6/8、7/8，不固定假设 4/4。
- 证据：`time.test.ts` 9 项换算测试；`audioEngine.ts`、`ArrangeView.tsx`、`DAWApp.tsx` 接入统一函数。

### FR-TRN-03 网格吸附 — 已实现
- 提供 Bar、二/四/八/十六/三十二分及三连音网格；TopBar 可独立开关 Grid Snap。
- 开启时片段、音符、播放头、循环和标记使用同一吸附规则；关闭时保持稳定 beat 坐标。
- 证据：`TopBar.tsx` 和 `complianceContracts.test.ts` 锁定开关入口。

### FR-TRN-04 循环区 — 已实现
- 标尺拖拽创建，可移动及调整两端；保证 `0 <= loopStart < loopEnd`，引擎与 UI 同步。
- 非 4/4 边界通过统一时间换算传给 Tone Transport。
- 证据：`time.test.ts`、`ArrangeView.tsx`、`audioEngine.ts`。

### FR-TRN-05 播放头和缩放 — 已实现
- 点击/拖拽标尺定位，播放时自动滚动；水平缩放 5–80 px/beat，仅影响显示。
- 证据：`ArrangeView.tsx`。

### FR-TRN-06 标记 — 已实现
- 双击标尺新增，单击跳转，双击标记重命名；右键菜单支持重命名、改色和删除。
- 位置非负并完整保存加载。
- 证据：`projectStorage.test.ts` 往返标记；`complianceContracts.test.ts` 锁定菜单操作。

### FR-TRN-07 真实播放状态与幂等停止 — 已实现（2026-08-24）
- Transport runtime 必须区分 `stopped | playing | paused`。Play 从 stopped 启动、从 paused 续播；Pause 保留当前位置；playing/paused 下 Stop 只执行一次停止并回到起点。
- stopped、起点、无 MIDI/Mic recording 且无 Count-in 时点击或按键 Stop 是严格音频 no-op：不得初始化/恢复 AudioContext、不得调用 Tone Transport stop/seek、不得触发任何新 note 或可听瞬态。重复 Stop 同样无副作用。
- playing 时顶栏必须显示真实 Pause glyph 且可访问名称为 `Pause`；paused/stopped 时显示 Play glyph 且名称为 `Play`。按钮、Space、Enter、Project 切换必须复用同一命令语义，Store 与 Tone Transport 不得分叉。
- 全局 Stop 仍取消 MIDI/Mic recording 与 Count-in、阻止延迟采集并释放输入/分析器/recorder；实际停止必须清除后续调度和活动 voice，不留下延迟 onset。
- runtime 状态不进入 package、recovery、dirty 或 undo。本需求不改变时间模型和 `.duckdaw` 版本。
- 验收：`TRN-T07-01~04` 覆盖 idle no-op、play/pause/stop 状态机、voice/调度释放及录音/Project 切换；`TRN-E2E-07` 三浏览器断言 idle Stop 无 meter 瞬态并核对 glyph/accessible name。

## 3. 编排、轨道与片段

### FR-ARR-01 多编排 — 已实现
- `Clip.arrangementId` 隔离内容；界面、实时播放和导出只使用活动编排。
- 新建可选空白或深复制当前编排；删除编排级联删除其 clips，禁止删除最后一个；旧工程迁移到活动编排。
- 证据：`editingInvariants.test.ts` 覆盖隔离、复制新 ID、级联删除和最后项保护。

### FR-TRK-01 轨道管理 — 已实现
- 支持新增 MIDI/Audio、重命名、删除、排序和选择；删除级联片段并确认；ID 唯一。
- 证据：`dawStore.ts`、`ArrangeView.tsx`、`TrackHeader.tsx`。

### FR-TRK-02 轨道参数 — 已实现
- 音量 `[0,1]`、声像 `[-1,1]`、Mute/Solo、颜色、Reverb/Delay `[0,1]`；MIDI 支持四种音色和 ADSR。
- 参数实时同步引擎、进入 dirty/撤销并持久化。
- 证据：`audioEngine.ts`、`mixSettings.test.ts`、工程往返测试。

### FR-CLIP-01 创建、选择与删除片段 — 已实现
- MIDI 区域双击/菜单创建；支持单选、Shift 多选、框选；快捷键删除，菜单删除确认。
- 证据：`ArrangeView.tsx`、`DAWApp.tsx`。

### FR-CLIP-02 移动、复制与长度 — 已实现
- 片段可吸附移动、Alt 拖拽复制、Duplicate 深复制并生成 clip/note 新 ID；可调整长度，Audio 不超过原时长。
- Store 拒绝跨不兼容轨道类型移动。
- 证据：`editingInvariants.test.ts` 覆盖类型拒绝；`dawStore.ts`、`ClipItem.tsx`。

### FR-CLIP-03 剪贴板 — 已实现
- `Ctrl/Cmd+C/X/V/D` 按当前上下文处理片段或音符；片段粘贴定位到播放头/目标轨道。
- 剪贴板保存深复制 DTO，Cut 后 Paste 不依赖已删除原 ID，所有新对象生成新 ID。
- 证据：`editingInvariants.test.ts` 覆盖 Cut→Paste。

## 4. MIDI 与钢琴卷帘

### FR-MIDI-01 音符编辑 — 已实现
- Piano Roll 覆盖 C1–B6；支持新增/试听、选择/框选、移动、缩放、删除、复制和最近时值。
- Store/加载校验 `start>=0`、`duration>0`、`velocity in [0,1]`。
- 证据：`PianoRoll.tsx`、`projectStorage.test.ts` 无效音符拒绝。

### FR-MIDI-02 量化 — 已实现
- Q/菜单按当前网格量化选中音符；无选择、关闭吸附或网格无效时不修改，结果不为负。
- 证据：`PianoRoll.tsx`、`dawStore.ts`。

### FR-MIDI-03 MIDI 录音 — 已实现（Web MIDI 平台受限）
- 仅合法 MIDI Track 可启动；不支持/无设备时 Toast 并恢复状态。
- 采集 Note On/Off、velocity 和相对时间，velocity 0 按 Note Off；停止时关闭仍按下音符并一次提交可撤销 MIDI Clip。
- 证据：`midiInput.test.ts`、`DAWApp.tsx`、`editingInvariants.test.ts`。

## 5. 音频导入与录音

### FR-AUD-01 音频导入 — 已实现
- 支持拖入和 Audio Track 文件选择；解码成功后按 `durationSeconds / 60 * bpm` 计算拍长并显示波形。
- 非 Audio 目标有明确处理；解码失败 Toast 且撤销临时 Blob URL。
- 证据：`ArrangeView.tsx`。

### FR-AUD-02 麦克风录音 — 已实现（安全上下文/权限受限）
- 要求目标 Audio Track；权限或录制失败恢复 UI 并 Toast。
- 记录开始 beat，停止返回 URL/MIME/实际秒时长，按 BPM 换算 duration beats 后创建可保存 Audio Clip。
- **REC-PRO-05 边播放边录制**：从停止状态开始 Audio Track 录音时，必须先成功启动 `MediaRecorder`，再从当前播放头启动 Transport；录音期间其他未静音 Track、节拍器、Loop 与 Automation 按正常实时图继续播放。若 Transport 已在播放，不得 stop、pause、seek 或重复 start，录音起点必须在麦克风授权及 `MediaRecorder.start()` 成功后按当时 Transport beat 采样。
- 停止单轨录音只结束采集并一次提交 Audio Clip，Transport 保持原播放状态；全局 Stop 仍同时停止 Transport 与录音。录音输入默认不直通 Master，避免扬声器回授。
- Count-in 期间允许工程播放但尚不采集；取消必须阻止稍后启动。权限/设备/`MediaRecorder` 失败不得创建 Clip、不得把原本停止的 Transport 启动；原本已播放的 Transport 不受失败影响。停止或失败必须释放输入、analyser 与 recorder 资源；本行为不改变工程持久化格式。
- 证据：`recorder.test.ts` 覆盖时长/MIME/关闭输入；`audioRecording.test.ts` 覆盖 capture→beat→play 顺序、已播放不重启、失败不启动；`DAWApp.tsx` 完成目标、Transport 与提交调用链；`REC-E2E-05` 覆盖浏览器可见录制时播放与停止后继续播放。

## 6. 混音与音频引擎

### FR-MIX-01 混音器 — 已实现
- 每轨实时电平、音量、声像、Mute/Solo、Reverb/Delay，MIDI ADSR；主通道电平/音量；面板可调高、全屏和关闭。
- 证据：`Mixer.tsx`、`audioEngine.ts`。

### FR-MIX-02 播放一致性 — 已实现
- 实时和离线图共用 `createTrackMixSettings`，一致应用音量、声像、Mute/Solo、Reverb/Delay；离线额外应用主音量。
- 删除轨道 dispose synth/channel/meter/reverb/delay；重调度 dispose Part/Player；Store 在删除/替换且剪贴板不再引用时 revoke Blob URL。
- 证据：`mixSettings.test.ts` 参数契约；`audioEngine.test.ts` 节点释放；`dawStore.ts` URL 所有权逻辑。

### FR-MIX-03 节拍器 — 已实现
- 支持开关、音量、四种音色、1x/2x/4x 细分和实际拍号的小节首拍重音；右键设置、单击切换。
- 证据：`audioEngine.ts`、`TopBar.tsx`、`time.test.ts`。

### MIX-ROUTE-03 可视化路由与聚合通道 — 已实现
- Mixer 必须以可缩放/滚动的节点连线图呈现 Track、Bus/Group 与 Destination。每个源节点暴露 `OUT`、`PRE`、`POST` 端口，每个 Bus 暴露 `IN`；拖拽或键盘选择源端口再选择 `IN` 可创建连接，已有 Output 与 Send 以不同线型/颜色显示。Send 可选择删除；必需的 Output 只能重新接到另一 Bus，不能形成悬空源。
- `Track OUT → Bus IN` 调用 `setTrackOutputBus`；`Bus OUT → Bus IN` 调用 `updateBus(outputBusId)`；`Track/Bus PRE|POST → Bus IN` 调用 `addSend(preFader)`。非法自连、悬空端点、重复 Send、指向同一目标的 Output 冗余操作和任何环必须拒绝且不改变工程；每次有效连接/删除是一个 undo 事务。
- 用户可新建非 Destination Bus 作为聚合混音通道；它默认输出到唯一 Destination Bus，并在 Mixer 中拥有完整的音量、声像、Mute、电平与有序 Effect Plugin 链。被 Track/Bus/Send 引用时不可删除；移除引用后可删除并释放实时节点/插件。
- 本能力复用 v2.1 `Track.outputBusId`、`Bus`、`Send` 与 `effectPlugins`，不升级格式。旧工程仍迁移到唯一 Master Bus；加载或编辑失败保留最后有效图。

### MIX-SOLO-01 确定性独奏 — 已实现
- Solo 判定由宿主集中计算：没有 Solo 时播放所有未 Mute Track；存在一个或多个 Solo 时，仅播放 `isSolo && !isMuted` 的 Track。不得使用 Tone 全局 Solo 使中间 Bus、Send 或 Destination 被连带静音。
- 多 Solo、Solo+Mute、Track 直达 Master、经过多级 Bus、Pre/Post Send 必须一致；Bus 自身 Mute 仍在 Track Solo 判定后生效。实时播放、Track Solo Automation 与离线导出共享同一判定语义。

### PLUG-EQ-01 可视化频谱参数均衡器 — 已实现
- 提供内置 `duckdaw.effect.parametric-eq`，可挂载到 Track 或 Bus 的任意效果槽；实时和离线使用同一 factory 与最多 8 个 peaking bands，点参数为 enabled/frequency/gain/Q。
- Inspector 显示实时 FFT 频谱和对数频率 EQ 曲线。单击空白处增加点，指针拖拽修改频率/增益，选中点可调 Q 或删除；频率限制 `20..20000 Hz`、增益 `-24..24 dB`、Q `0.1..18`，超过 8 点时拒绝新增。每次添加、删除或一次拖拽手势只形成一个可撤销事务。
- 频谱不可用、页面后台或离线渲染时 EQ 音频处理仍正常，UI 显示静态曲线而不报错；Inspector 关闭、插件删除、图重建和导出完成必须停止 animation frame 并 dispose FFT/Filter 节点。参数使用现有 v2.1 descriptor number 值持久化，未知/旧工程无需迁移。

### PLUG-INST-02 MIDI 乐器热切换连续性 — 已实现（2026-08-24）
- MIDI Clip 的既有调度回调在乐器选择、参数替换、Undo/Redo 或播放中切换后，必须在事件执行时解析该 Track 当前有效 instrument instance，不得继续调用已 dispose 的旧实例、漏发后续音符或重复调度。
- 新 instrument 必须先成功创建并接入候选信号链，再释放旧实例；factory 失败遵循现有 synth fallback，删除 Track 后旧回调安全 no-op，其他 Track 不受影响。
- 该修复不改变 Clip 调度签名、descriptor identity、unknown plugin 往返、实时/离线 factory 或 `.duckdaw` 2.1.0。
- 验收：`PLUG-T13~15` 覆盖同一 Part callback 热切换、参数/Undo/播放中切换、fallback/删除/释放；`PLUG-E2E-02` 三浏览器证明循环 MIDI 在切换前后持续产生真实 meter 输出。

### PLUG-UI-02 可调整与最大化 Plugin Inspector — 已实现（2026-08-24）
- Inspector 默认宽 320px，用户可从左边缘用 pointer 或键盘调整到 `280..min(720, viewportWidth-320)`；主工作区至少保留 320px。宽度在当前 session 内关闭/重开后保留，不写工程、不 dirty、不 undo。
- Maximize 覆盖应用工作区但不调用浏览器 Fullscreen API；Restore 恢复原宽，Escape 先退出最大化并把焦点还给触发按钮。关闭时最大化状态复位，pointer capture、全局监听和临时拖拽必须释放。
- resize separator 必须提供 orientation、value/min/max 与 Arrow（16px）、Shift+Arrow（64px）、Home/End 键盘语义；窄 viewport 仍可关闭和恢复。
- 验收：`PLUG-UI-T02-01/02` 覆盖 clamp、pointercancel/unmount、键盘、焦点、零持久副作用；`PLUG-E2E-03` 覆盖三浏览器与 axe。

### MIX-ROUTE-04 可折叠与放大的 Route 工作区 — 已实现（2026-08-24）
- Mixer Route 默认关闭；Mixer header 提供带 `aria-expanded/aria-controls` 的 Route 开关。关闭只撤销未完成的端口连接候选，不修改、释放或重建既有 Bus/Send graph。
- Route 打开后可在 Mixer 内 Expand/Restore；Expand 只扩大 Route 工作区，不冒充浏览器/应用全屏。既有画布 zoom `70%..150%` 与工作区放大是独立语义，关闭/重开保留 graph 与 session zoom。
- toggle、expand 和 zoom 均为 session UI state，不 dirty、不 undo、不 package；每个有效路由编辑仍保持 MIX-ROUTE-03 的 DAG、零提交和单 undo 合同。
- 验收：`MIX-ROUTE-T04-01/02` 覆盖默认关闭、pending cancel、graph/zoom/dirty 保持和放大布局；`MIX-E2E-04` 覆盖 pointer、键盘与三浏览器。

### MIX-UI-01 可调整 Track channel strip — 已实现（2026-08-24）
- 每个 Track strip 默认/最小 128px、最大 320px，可从右边缘用 pointer 或与 Inspector 相同的键盘 separator 语义独立调宽；Bus 与 sticky Master 保持既有宽度和行为。
- Track 宽度按 ID 保存于 session UI state，删除 Track 时清理；拖宽不得触发 Track reorder、slider、dirty、undo、recovery 或 package 变化，横向滚动与 sticky Master 不得失效。
- 验收：`MIX-UI-T01-01/02` 覆盖独立宽度、clamp、删除清理、pointercancel、键盘和零工程副作用；`MIX-E2E-05` 覆盖插件长名称可见性、滚动和三浏览器。

### PLUG-EQ-02 紧凑命名与主题自适应 — 已实现（2026-08-24）
- 内置 `duckdaw.effect.parametric-eq` 的用户名称统一为 `Parametric EQ`；stable plugin ID、instance ID、8×4 参数 ID、范围、版本与 descriptor 往返均不变。
- EQ 图的背景、网格、刻度、静态曲线、动态频谱、选中点和 focus 状态必须跟随 Light/Dark/System 的最终主题，保持可读对比；主题切换只改变视觉，不重建/bypass 音频、不修改参数或撤销历史。
- 频谱 API 缺失、页面后台和 analyser 读取失败继续只隐藏动态频谱，保留主题正确的静态响应。
- 验收：`PLUG-EQ-T04/05` 覆盖 display-only 兼容、computed theme 与参数/engine 不变；`PLUG-EQ-E2E-02` 覆盖两主题、键盘编辑和 axe。

## 7. 导出

### FR-EXP-01 离线音频导出 — 已实现
- WAV/MP3/OGG，44.1/48/96 kHz，完整活动编排或循环区；渲染/编码进度阻止重复提交。
- 空工程/无效循环拒绝；事件相对区域起点调度并裁剪边界；失败重置 idle、Toast 后可重试。
- 导出应用 BPM、主/轨道参数、Mute/Solo、效果及 MIDI/Audio 位置。
- 证据：`exportPlan.test.ts` 覆盖 sample rate/region/empty；`mixSettings.test.ts` 锁定混音等价参数；`ExportModal.tsx` catch 恢复 idle。

## 8. 撤销、快捷键与界面

### FR-UI-01 撤销/重做 — 已实现
- 顶栏按钮按栈启用；`Ctrl/Cmd+Z` 撤销，`Ctrl/Cmd+Shift+Z`/`Ctrl/Cmd+Y` 重做。
- zundo 覆盖全部可编辑工程字段，排除会话状态；加载/新建清栈；MIDI 录音一次提交，Piano Roll pointer up/cancel 将拖拽合并为一步。
- 证据：`editingInvariants.test.ts` marker undo；`dawStore.test.ts` 状态范围；`PianoRoll.tsx` 事务收口。

### FR-UI-02 主题 — 已实现
- Light/Dark/System 即时应用；偏好写 `localStorage`；System 监听 `matchMedia.change`。
- 证据：`complianceContracts.test.ts`。

### FR-UI-03 全局反馈 — 已实现
- 保存、打开、模板、GitHub、录音、导入和导出业务结果统一 Toast；长导出有 rendering/encoding/progress 和重复提交保护。
- 业务错误不只依赖 `alert`/`console.error`；取消不显示成功。确认/命名可使用浏览器 confirm/prompt，不承担错误反馈。
- 证据：`complianceContracts.test.ts` 扫描关键业务组件；`saveProject.test.ts` 覆盖取消语义。

### FR-UI-04 快捷键冲突规则 — 已实现
- 文本输入中禁用编辑/传输快捷键；保存、打开保留。
- 支持 Space、Enter、Delete/Backspace、C/X/V/D、Q、Ctrl/Cmd+S/O/Z、Ctrl/Cmd+Shift+Z 和 Ctrl/Cmd+Y。
- 证据：`DAWApp.tsx`、`PianoRoll.tsx`。
