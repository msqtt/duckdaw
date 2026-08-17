# `.duckdaw` 工程文件格式规范

## 1. 格式标识

- 当前格式版本：`1.1.0`；
- 扩展名：`.duckdaw`；
- 容器：ZIP；
- JSON 编码：UTF-8；
- Manifest 标识：`format === "duckdaw"`。

扩展名不是有效性依据；加载器必须检查 ZIP 内容、manifest 和 schema。

## 2. 包目录

```text
project.duckdaw
├── manifest.json       # 必需：包元数据和资源清单
├── project.json        # 必需：工程主体
├── samples/            # 可选：音频资源
│   └── <resource-id>.<ext>
└── presets/            # 保留：未来预设资源
    └── <resource-id>.json
```

v1.1.0 不允许工程主体依赖包外绝对路径、`file:` URL、HTTP URL 或旧会话 `blob:` URL。

## 3. `manifest.json`

### 3.1 Schema

```ts
interface ManifestV1_1 {
  format: 'duckdaw';
  version: '1.1.0';
  generator: string;
  createdAt: string;       // ISO 8601
  updatedAt: string;       // ISO 8601
  projectId: string;       // UUID 或稳定唯一 ID
  name: string;
  author?: string;
  description?: string;
  bpm: number;
  timeSignature: [number, number];
  sampleRate?: number;
  resources: {
    samples: string[];     // 相对 samples/ 的文件名
    presets: string[];     // 相对 presets/ 的文件名
  };
}
```

### 3.2 规则

- `createdAt` 在对同一工程执行普通 Save 时保持不变；`updatedAt` 每次成功打包更新。
- `projectId` 在普通 Save/Save As 时保持不变；从模板创建新工程时重新生成。
- `name`、`bpm`、`timeSignature` 必须与 `project.json` 一致；冲突时加载失败，不静默选择其一。
- 资源名必须唯一、为安全相对文件名，且每一项在 ZIP 中存在。
- 未被 manifest 声明的文件可忽略，但不得执行或自动加载。

当前写出器保持普通 Save/Save As 的 `projectId/createdAt`，仅 New 和 Template 实例化生成新身份。

## 4. `project.json`

### 4.1 顶层 Schema

```ts
interface ProjectV1_1 {
  meta: {
    version: '1.1.0';
    projectId: string;
  };
  transport: TransportV1_1;
  master: {
    volume: number;
  };
  tracks: TrackV1_1[];
  clips: ClipV1_1[];
  markers: MarkerV1_1[];
  arrangements: ArrangementV1_1[];
  activeArrangementId: string;
  automation: unknown[];
  tempoTrack: TempoPointV1_1[];
}
```

为兼容当前文件，`master` 缺失时默认 `{ volume: 0.8 }`；其余默认规则见第 8 节。

### 4.2 Transport

```ts
interface TransportV1_1 {
  bpm: number;                         // 20..300
  timeSignature: [number, number];
  swing: number;                       // 0..1，当前 UI 未编辑
  isLooping: boolean;
  loopStart: number;                   // beats
  loopEnd: number;                     // beats，必须 > loopStart
  metronome: {
    enabled: boolean;
    sound: 'cute' | 'click' | 'woodblock' | 'electronic';
    volume: number;                    // 0..1
    subdivisions: 1 | 2 | 4;
  };
}
```

### 4.3 Track

```ts
type TrackType = 'midi' | 'audio';
type InstrumentType = 'piano' | 'synth' | 'bass' | 'drum';

interface TrackV1_1 {
  id: string;
  name: string;
  type: TrackType;
  volume: number;                      // 0..1
  pan: number;                         // -1..1
  isMuted: boolean;
  isSolo: boolean;
  color: string;                       // CSS color；推荐 #RRGGBB
  instrument?: InstrumentType;         // midi only
  reverb: number;                      // 0..1
  delay: number;                       // 0..1
  env?: {
    attack: number;
    decay: number;
    sustain: number;                   // 0..1
    release: number;
  };
  insertEffects: unknown[];            // v1.1 保留
  sends: unknown[];                    // v1.1 保留
  automationLanes: unknown[];          // v1.1 保留
}
```

Audio Track 不得包含有行为意义的 `instrument/env`。未知 instrument 在迁移时降级为 `synth` 并产生警告。

### 4.4 Clip 与 Note

```ts
interface NoteV1_1 {
  id: string;
  note: string;                        // 例如 C4、F#3
  start: number;                       // clip-local beats
  duration: number;                    // beats > 0
  velocity: number;                    // 0..1
}

interface ClipV1_1 {
  id: string;
  name?: string;
  trackId: string;
  arrangementId: string;               // 必需；旧 v1.1 文件可缺省并迁移
  start: number;                       // arrangement-global beats
  duration: number;                    // beats > 0
  originalDuration?: number;
  type: TrackType;
  notes: NoteV1_1[];                   // midi 使用；audio 应为空
  bufferUrl?: string;                  // audio: samples/<filename>
  mimeType?: string;                   // audio/*；旧文件按资源扩展名推断
  color?: string;
}
```

兼容说明：当前运行时要求 `arrangementId`。加载旧文件时，缺失字段的 clips 迁移到活动编排或 `main`；写出器始终写入该字段。

Audio Clip 的 `bufferUrl` 必须引用 `samples/`；相应文件名必须出现在 `manifest.resources.samples`。MIDI Clip 不得引用资源。

### 4.5 Marker、Arrangement 与 Tempo

```ts
interface MarkerV1_1 {
  id: string;
  name: string;
  position: number;                    // beats >= 0
  color: string;
}

interface ArrangementV1_1 {
  id: string;
  name: string;
}

interface TempoPointV1_1 {
  position: number;
  bpm: number;
  curve: 'linear' | 'step';
}
```

v1.1 当前写出 `tempoTrack` 和 `automation` 作为前向兼容占位；在 UI 未实现前，加载器应保留未知但合法数据，避免无意丢失。

## 5. 最小示例

`manifest.json`：

```json
{
  "format": "duckdaw",
  "version": "1.1.0",
  "generator": "duckdaw",
  "createdAt": "2026-08-17T00:00:00.000Z",
  "updatedAt": "2026-08-17T00:00:00.000Z",
  "projectId": "8cf860e5-b5cc-4b8c-aa08-1f0d28fb52b4",
  "name": "New Project",
  "bpm": 120,
  "timeSignature": [4, 4],
  "resources": { "samples": [], "presets": [] }
}
```

`project.json`：

```json
{
  "meta": {
    "version": "1.1.0",
    "projectId": "8cf860e5-b5cc-4b8c-aa08-1f0d28fb52b4"
  },
  "transport": {
    "bpm": 120,
    "timeSignature": [4, 4],
    "swing": 0,
    "isLooping": false,
    "loopStart": 0,
    "loopEnd": 16,
    "metronome": {
      "enabled": false,
      "sound": "cute",
      "volume": 0.8,
      "subdivisions": 1
    }
  },
  "master": { "volume": 0.8 },
  "tracks": [],
  "clips": [],
  "markers": [],
  "arrangements": [{ "id": "main", "name": "Main Arrangement" }],
  "activeArrangementId": "main",
  "automation": [],
  "tempoTrack": [{ "position": 0, "bpm": 120, "curve": "linear" }]
}
```

## 6. 打包规则

1. JSON 必须在资源读取成功后生成，避免 manifest 声明与实际 ZIP 不一致。
2. 建议资源文件名使用稳定 `resourceId + 原扩展名`；不得无条件把任意录音编码标成 WAV。
3. 同一二进制可按内容哈希去重；多个 Clip 可以引用同一资源。
4. ZIP 生成失败、任一必需资源缺失或读取失败时，整个 Save 失败。
5. 默认压缩策略应平衡速度与体积；已压缩音频无需高等级重复压缩。

当前写出器根据 `Clip.mimeType` 使用受控扩展名（wav/mp3/ogg/webm/m4a/aac/flac）；旧 Clip 缺 MIME 时按 WAV 兼容，加载时从扩展名推断并补齐 MIME。

## 7. 加载与安全校验

加载器必须按顺序检查：

1. 文件大小在产品配置上限内；
2. ZIP 可解析且文件数量、解压后总大小、压缩比合理；
3. 两个必需 JSON 存在且单文件大小合理；
4. JSON 可解析、format/version 受支持；
5. manifest/project 的 projectId 和版本一致；
6. 所有数值有限且在范围内，ID/引用合法；
7. 所有声明资源存在，路径安全；
8. 音频可构造 Blob；
9. 完成迁移和默认值填充后才提交 store。

不得使用 `value || default` 恢复合法的 `0` 或 `false`；必须使用类型判断或 `??`。

## 8. 默认值与迁移

缺失字段默认值：

| 字段 | 默认值 |
|---|---|
| BPM | 120 |
| timeSignature | `[4,4]` |
| loop | disabled, 0..16 |
| metronome | disabled, cute, 0.8, 1 |
| master.volume | 0.8 |
| markers | `[]` |
| arrangements | `[{id:'main', name:'Main Arrangement'}]` |
| activeArrangementId | 第一个 arrangement ID |
| automation | `[]` |
| tempoTrack | position 0 的当前 BPM |

### Legacy JSON

支持至少 `{ bpm, tracks, clips }` 的历史 JSON：

- 生成新 projectId；
- 补齐轨道和传输默认值；
- 拒绝无法恢复的 `blob:` Audio Clip，或明确标记为缺失资源；
- 迁移完成后工程标脏，引导另存为 `.duckdaw`。

### 版本策略

采用 semver：

- patch：不改变 schema 的修复；
- minor：可向后兼容的可选字段；
- major：破坏性结构变化。

加载器必须接受已知旧版本并迁移；遇到高于当前支持的 major 版本时拒绝加载并保留当前工程。

## 9. 往返保证

对任一有效工程执行 `load(save(project))` 后，除以下运行时字段外必须语义等价：对象 URL、文件句柄、选择、播放/录音状态、撤销历史和 UI 布局。

最低往返测试必须覆盖：

- `0` 音量、`false` 开关等假值；
- 非 4/4 拍号；
- markers 和多个 arrangements；
- MIDI notes 与颜色/ADSR/效果；
- 至少两个不同编码的 Audio Clip；
- loop/metronome/master 设置；
- legacy JSON；
- 缺失资源、错误引用、损坏 ZIP 和未来版本拒绝。
