# DuckDAW 技术设计规格

## 1. 技术栈与运行模型

- React 19 + TypeScript + Vite 6；
- Zustand 管理应用状态，zundo 管理时间旅行历史；
- Tone.js/Web Audio 执行实时播放和离线渲染；
- JSZip 读写 `.duckdaw`；
- idb-keyval 保存文件句柄、最近项目、模板和目标恢复快照；
- FFmpeg WASM 编码 MP3/OGG；
- MediaRecorder/getUserMedia 采集麦克风；
- Tailwind CSS 4、Motion 和 lucide-react 提供界面能力。

应用是本地优先 SPA。除用户主动触发 GitHub 同步和首次加载远端 FFmpeg 资源（若构建如此配置）外，工程数据不应离开浏览器。

## 2. 模块边界

| 模块 | 责任 | 不应承担 |
|---|---|---|
| `src/store/dawStore.ts` | 规范化工程/UI 状态、同步 actions、撤销切片 | 文件 I/O、Tone 节点生命周期 |
| `src/lib/audioEngine.ts` | Tone 节点、调度、传输、表头和实时播放 | React UI、工程文件解析 |
| `src/lib/projectStorage.ts` | 包格式、迁移、文件/IDB 读写、最近项目 | UI Toast、直接依赖组件 |
| `src/lib/recorder.ts` | 麦克风 MediaRecorder 生命周期 | 决定目标轨道和片段位置 |
| `src/DAWApp.tsx` | 应用级副作用、快捷键、store→engine 同步 | 复杂领域转换 |
| `src/components/DAW/*` | 用户交互和展示 | 定义持久化格式 |

新增复杂逻辑优先进入可测试的 `lib` 或领域函数，不应继续堆积到组件事件处理器中。

## 3. 状态分层

### 3.1 可持久化工程状态

必须保存并往返恢复：

- `projectName` 和工程元数据；
- `bpm`、`timeSignature`、loop、metronome 设置；
- `masterVolume`；
- `tracks`、`clips`、`markers`；
- `arrangements`、`activeArrangementId`；
- 未来加入的 automation、tempoTrack 和资源引用。

### 3.2 会话/UI 状态

默认不写入工程：

- `isPlaying`、`isRecording`、`isMicRecording`；
- selected IDs、clipboard；
- `bottomPanel`、`panelHeight`、`panelFullScreen`、`exportModalOpen`；
- `zoom`、临时拖拽和上下文菜单状态；
- undo/redo 历史。

`theme` 和部分编辑偏好（网格、最近音符时值）应进入独立用户偏好存储，而非工程文件。

### 3.3 派生/运行时资源

以下内容绝不直接序列化：

- Tone Synth/Player/Part/Channel/Meter 节点；
- `MediaStream`、`MediaRecorder`；
- `FileSystemFileHandle`（仅可放 IndexedDB，且受浏览器权限控制）；
- `blob:` 对象 URL（保存时必须转换为包内资源，加载时重新创建）。

## 4. 数据不变量

所有 action、加载迁移和测试必须维护：

1. 工程内所有 `track.id`、`clip.id`、`note.id`、`marker.id`、`arrangement.id` 在各自域唯一。
2. 每个 `clip.trackId` 引用存在轨道，且 `clip.type === track.type`。
3. `clip.start >= 0`、`clip.duration > 0`；Audio Clip 若有 `originalDuration`，则 `duration <= originalDuration`。
4. `note.start >= 0`、`note.duration > 0`、`0 <= note.velocity <= 1`。
5. `20 <= bpm <= 300`；拍号分子和分母为正数。
6. `0 <= track.volume <= 1`、`-1 <= track.pan <= 1`、效果 send 在 `[0,1]`。
7. `0 <= masterVolume <= 1`；`0 <= loopStart < loopEnd`。
8. 至少存在一个 Arrangement，且 `activeArrangementId` 引用其中一个。
9. 删除轨道级联删除片段；删除片段清除无效选择。
10. 加载外部文件前进行默认值填充、范围校正和引用校验。

实现提供 `validateProjectData` 与导出的 `validatePersistedProjectState`；ZIP 和 legacy 无效输入均在资源恢复与 Store 提交前拒绝，不可部分写入。

## 5. 时间模型

- 工程中的 `start`、`duration`、marker 和 loop 使用拍为单位，允许小数。
- Note 的 `start` 相对所属 Clip；Clip 的 `start` 相对全局 Arrangement。
- 秒与拍转换：`seconds = beats * 60 / bpm`。
- 小节/拍/Tone Transport 位置转换必须使用 `timeSignature`；不得散落 `beatsPerBar=4`。
- 建议集中实现 `beatsToTransportTime`、`transportTimeToBeats`、`secondsToBeats`，并进行 3/4、6/8、7/8 单元测试。
- UI 像素仅为派生值：`x = beat * zoom`，不得回写造成累计浮点漂移。

## 6. Store 与撤销设计

### 6.1 Action 原则

- 工程修改 action 同时更新 `isDirty=true`。
- UI/session action 不设置 dirty。
- 复合操作使用单一领域 action，例如 `replaceProject`、`moveClip`、`commitRecording`，避免组件连续多次 set 导致中间无效状态。
- 所有外部加载通过 `replaceProject(validatedProject)` 原子提交。

### 6.2 撤销边界

目标撤销切片应包含全部可编辑工程数据，不包含 transport runtime、选择、UI 和 dirty。推荐显式定义 `UndoableProjectState`，而不是手写少数字段。

拖拽中的 pointermove 只更新预览；pointerup 一次提交。录音结束、量化多音符和删除轨道均为单历史事务。新建/打开工程后清空历史。

## 7. AudioEngine 同步

### 7.1 生命周期

- `initialize` 必须幂等，并在用户手势后调用 `Tone.start()`。
- `syncTracks` 负责创建、更新和删除轨道通道及效果节点。
- `syncClips` 负责创建、更新和删除 Part/Player，不得重复调度。
- 替换工程和卸载时必须 dispose 不再使用的节点。
- 对象 URL 需要所有权追踪；从包加载或录音生成的 URL 在片段删除/工程替换时 revoke。

### 7.2 信号链

目标语义：音源/Player → track channel（volume/pan/mute/solo）→ delay/reverb → track meter → destination → master meter。若实时引擎和 Offline 渲染采用不同构造代码，必须用共享参数映射函数保证语义等价。

### 7.3 调度

- MIDI 事件时间 = `clip.start + note.start`；不播放片段长度之外的事件。
- Audio Player 从 `clip.start` 开始，并遵守裁剪长度。
- Mute/Solo 决策应集中计算：存在任意 Solo 时只播放 Solo 且未 Mute 的轨道。
- BPM/loop/拍号变化必须同步 Tone.Transport。

## 8. 持久化数据流

### 8.1 保存

1. 从 store 生成不可变 DTO；
2. 校验不变量；
3. 克隆 clips，读取所有 Audio Blob；
4. 将资源写入 `samples/`，DTO 中改为相对路径；
5. 生成 manifest/project JSON；
6. JSZip 生成 Blob；
7. 写句柄或下载；
8. 仅在实际写入成功后清除 dirty 和更新最近项目。

任何资源读取失败都必须使保存失败，除非用户明确选择“忽略缺失资源”；不得只警告后生成看似成功的不完整工程。

### 8.2 加载

1. 将输入完整读入临时内存；
2. 验证 ZIP、manifest、版本和 JSON；
3. 迁移旧 schema；
4. 验证引用和范围；
5. 提取资源并创建临时对象 URL；
6. 所有步骤成功后原子替换 store；
7. 清理旧运行时资源、清空历史和 dirty；
8. 更新文件句柄与最近项目。

步骤 2–5 失败时，撤销临时对象 URL 并保留当前工程。

### 8.3 自动恢复

建议 IDB keys：

- `duckdaw_current_file_handle`：当前文件句柄；
- `duckdaw_recent_projects`：最近项目；
- `duckdaw_templates`：模板；
- `duckdaw_recovery_snapshot_v1`：恢复快照 DTO/包、更新时间、源工程 ID 和最近显式保存时间。

恢复快照不得复用“保存到当前磁盘文件”的逻辑，以免后台覆盖用户文件。

## 9. 错误模型

领域层应抛出带 code 的错误：

- `UNSUPPORTED_BROWSER`、`PERMISSION_DENIED`、`USER_CANCELLED`；
- `INVALID_ARCHIVE`、`UNSUPPORTED_VERSION`、`INVALID_PROJECT`；
- `MISSING_RESOURCE`、`DECODE_FAILED`；
- `WRITE_FAILED`、`NETWORK_FAILED`、`ENCODE_FAILED`。

UI 对 `USER_CANCELLED` 静默处理；其他错误使用统一 Toast/Modal，包含简短原因和可执行下一步。控制台可记录技术细节，但不能作为唯一反馈。

## 10. 安全与隐私

- 外部 ZIP/JSON、文件名和 GitHub 响应均视为不可信输入；限制解压总大小、文件数和单资源大小，防止 ZIP bomb。
- 包内路径必须拒绝 `..`、绝对路径和非声明资源。
- GitHub repo/path 进入 URL 前逐段编码和校验。
- PAT 不得持久化到工程；优先会话内存或 OAuth。若保留 localStorage，UI 必须明确 XSS 风险并提供清除入口。
- 麦克风流停止时关闭所有 tracks；权限只在用户点击录音后请求。
- 不执行工程包中的代码、HTML 或任意外部 URL。

## 11. 测试策略

### 11.1 单元测试

- 时间换算和吸附；
- Store actions 与不变量；
- schema 验证、默认值和版本迁移；
- ZIP 打包/解包往返，包括多个 Audio Blob；
- undoable state 选择和事务边界；
- Mute/Solo 和导出范围计算。

### 11.2 集成测试

- File System Access 成功、取消、拒权和降级下载；
- IDB 最近项目、模板和恢复快照；
- MediaRecorder 成功/失败状态机；
- GitHub create/update/load 和错误响应；
- FFmpeg 编码失败恢复。

### 11.3 端到端验收

至少覆盖：新建 MIDI 作品保存重载、音频导入保存重载、麦克风录音、撤销重做、多拍号循环、离线导出、损坏工程加载不覆盖当前工程。
