# 1.1 本地存储设计方案

## 一、背景与目标

当前 DuckDAW 的工程保存仅依赖 GitHub Sync（云端），存在以下问题：
- 用户无网络时无法保存
- GitHub 仓库权限/token 过期会导致同步失败
- 无法像专业 DAW 那样本地快速保存/加载
- 缺乏版本历史和崩溃恢复机制

**目标**：设计一套工程格式，同时满足：
1. **本地存储**：通过浏览器 File System Access API（优先）或 Blob Download（降级）保存到本地磁盘
2. **GitHub 同步**：工程打包后作为 `project.duckdaw` 文件提交到 GitHub 仓库，两种方式数据完全一致
3. **双向兼容**：本地加载 GitHub 上的工程文件，无需任何转换
4. **渐进增强**：本地存储为增强功能，不影响现有 GitHub-only 工作流

---

## 二、工程文件格式设计

### 2.1 文件格式概述

- **文件扩展名**：`.duckdaw`
- **本质**：一个 ZIP 压缩包（方便未来扩展内含多个资源文件）
- **内部结构**：

```
example-song.duckdaw          ← ZIP 压缩包
├── manifest.json            ← 工程元数据（必需）
├── project.json             ← 工程主体数据（轨道/片段/音符等）
├── samples/                  ← 音频采样资源目录（可选，无采样时不存在）
│   ├── drum-loop-001.wav
│   └── vocal-chop.mp3
├── presets/                  ← 音色/效果器预设目录（可选）
│   ├── bass-preset.json
│   └── reverb-hall.json
└── thumbnails/               ← 工程缩略图（可选）
    └── thumbnail.png
```

> **设计理由**：ZIP 格式允许未来无损添加更多资源文件（采样、预设、缩略图），而不改变文件格式版本。解析时即使某些目录不存在也能正常加载。

### 2.2 manifest.json（工程元数据）

```json
{
  "format": "duckdaw",
  "version": "1.1.0",
  "generator": "duckdaw",
  "createdAt": "2025-06-01T12:00:00.000Z",
  "updatedAt": "2025-06-01T14:30:00.000Z",
  "projectId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "name": "My Song Title",
  "author": "username",
  "bpm": 120,
  "timeSignature": [4, 4],
  "sampleRate": 44100,
  "resources": {
    "samples": ["drum-loop-001.wav", "vocal-chop.mp3"],
    "presets": ["bass-preset.json", "reverb-hall.json"]
  },
  "description": "A short description of the project"
}
```

**字段说明**：

| 字段 | 类型 | 必需 | 说明 |
|------|------|------|------|
| `format` | string | 是 | 固定值 `"duckdaw"`，用于识别文件类型 |
| `version` | string | 是 | 文件格式版本，遵循 semver，解析器按此决定如何解读 `project.json` |
| `generator` | string | 是 | 生成该文件的程序标识 |
| `createdAt` | ISO8601 | 是 | 首次创建时间 |
| `updatedAt` | ISO8601 | 是 | 最后保存时间 |
| `projectId` | UUID | 是 | 全局唯一标识，用于 GitHub 冲突检测和版本对照 |
| `name` | string | 是 | 工程名称（显示用） |
| `author` | string | 否 | GitHub 用户名（来自 GitHub Sync 时自动填入） |
| `bpm` | number | 是 | 默认 BPM |
| `timeSignature` | [num, den] | 是 | 默认节拍签名 |
| `sampleRate` | number | 否 | 导出采样率参考（默认 44100） |
| `resources` | object | 否 | 资源索引，列出包内的采样/预设文件名 |
| `description` | string | 否 | 工程描述/备注 |

### 2.3 project.json（工程主体数据）

对应现有 `dawStore` 中 `getProjectData()` 的全部状态，结构如下：

```json
{
  "meta": {
    "version": "1.1.0",
    "projectId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890"
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
  "tracks": [
    {
      "id": "track-1",
      "name": "Synth Lead",
      "type": "midi",
      "volume": 0.8,
      "pan": 0,
      "isMuted": false,
      "isSolo": false,
      "instrument": "synth",
      "color": "#0ea5e9",
      "reverb": 0.2,
      "delay": 0.1,
      "env": {
        "attack": 0.01,
        "decay": 0.2,
        "sustain": 0.5,
        "release": 0.5
      },
      "insertEffects": [],
      "sends": [],
      "automationLanes": []
    },
    {
      "id": "track-2",
      "name": "Audio Vocal",
      "type": "audio",
      "volume": 0.9,
      "pan": 0,
      "isMuted": false,
      "isSolo": false,
      "color": "#ef4444",
      "reverb": 0,
      "delay": 0,
      "insertEffects": [],
      "sends": [],
      "automationLanes": []
    }
  ],
  "clips": [
    {
      "id": "clip-1",
      "trackId": "track-1",
      "name": "Melody A",
      "start": 0,
      "duration": 16,
      "type": "midi",
      "color": "#0ea5e9",
      "notes": [
        {
          "id": "n1",
          "note": "C4",
          "start": 0,
          "duration": 1,
          "velocity": 0.8
        }
      ]
    },
    {
      "id": "clip-2",
      "trackId": "track-2",
      "name": "Vocal Take 1",
      "start": 4,
      "duration": 8,
      "type": "audio",
      "color": "#ef4444",
      "bufferUrl": "samples/vocal-chop.mp3",
      "fadeIn": 0.05,
      "fadeOut": 0.1,
      "gain": 0,
      "timeStretch": 1.0,
      "pitchShift": 0
    }
  ],
  "markers": [
    {
      "id": "marker-1",
      "name": "Verse",
      "position": 16,
      "color": "#f59e0b"
    },
    {
      "id": "marker-2",
      "name": "Chorus",
      "position": 32,
      "color": "#ef4444"
    }
  ],
  "automation": [
    {
      "trackId": "track-1",
      "parameter": "volume",
      "points": [
        { "time": 0, "value": 0.8 },
        { "time": 16, "value": 0.5 },
        { "time": 24, "value": 0.9 }
      ]
    }
  ],
  "tempoTrack": [
    {
      "position": 0,
      "bpm": 120,
      "curve": "linear"
    },
    {
      "position": 32,
      "bpm": 130,
      "curve": "exponential"
    }
  ],
  "arrangements": [
    {
      "id": "arr-1",
      "name": "Main Arrangement",
      "clips": ["clip-1", "clip-2"]
    }
  ]
}
```

**设计要点说明**：

1. **版本兼容**：`meta.version` 与 `manifest.version` 一致，加载时严格按版本解析
2. **ID 全局唯一**：所有实体（track/clip/note/marker）均使用 UUID，无需担心合并冲突
3. **资源引用用相对路径**：音频片段的 `bufferUrl` 存储为 ZIP 包内相对路径（如 `samples/vocal-chop.mp3`），而非 `blob:http://...` 这样的临时 URL
4. **音频数据分离存储**：大段音频二进制不内嵌 JSON，而是作为独立文件放在 `samples/` 目录，加载时从 ZIP 中解压到内存
5. **automation 独立**：轨道自动化数据与轨道定义分离，通过 `trackId` 关联，便于扩展新的自动化参数
6. **预留扩展字段**：`insertEffects`、`sends`、`automationLanes`、`arrangements` 等在当前版本为空结构，未来可直接填充而无需改变格式版本

---

## 三、文件读写流程

### 3.1 保存（Save）

```
用户触发保存 (Ctrl+S / File > Save)
         │
         ▼
┌──────────────────────────────────────┐
│ 1. 序列化工程状态                     │
│    - 收集 tracks/clips/notes/markers │
│    - 将 blob URL 的音频数据读出并      │
│      转换为 ArrayBuffer               │
│    - 生成 projectId（首次保存时）      │
└──────────────────────────────────────┘
         │
         ▼
┌──────────────────────────────────────┐
│ 2. 构建 manifest.json + project.json  │
│    - 扫描引用的所有音频采样            │
│    - 将采样复制到 samples/ 子目录      │
│    - 收集所有效果器预设到 presets/    │
└──────────────────────────────────────┘
         │
         ▼
┌──────────────────────────────────────┐
│ 3. 打包为 ZIP                         │
│    - 使用 JSZip 库（浏览器端）         │
│    - manifest.json 放在最前（优先解析） │
└──────────────────────────────────────┘
         │
         ▼
┌──────────────────────────────────────┐
│ 4. 写入目标位置（按优先级尝试）        │
│    ① File System Access API           │
│       → 弹出目录选择器，记住路径       │
│       → 后续保存直接写同一文件        │
│    ② Blob Download（降级方案）        │
│       → 触发浏览器下载对话框          │
│       → 每次保存生成新文件            │
└──────────────────────────────────────┘
         │
         ▼
┌──────────────────────────────────────┐
│ 5. 写入 IndexedDB 缓存               │
│    - 同时在 IndexedDB 存一份完整备份   │
│    - 用于崩溃恢复和离线编辑            │
└──────────────────────────────────────┘
```

### 3.2 加载（Open）

```
用户触发加载 (Ctrl+O / File > Open)
         │
         ▼
┌──────────────────────────────────────┐
│ 1. 获取 .duckdaw 文件                  │
│    - File System Access API: 打开文件  │
│    - Blob Download 模式: 文件 input   │
└──────────────────────────────────────┘
         │
         ▼
┌──────────────────────────────────────┐
│ 2. 解析 manifest.json                 │
│    - 校验 format === "duckdaw"        │
│    - 读取 version 决定解析策略        │
│    - 提取资源列表 (samples/presets)   │
└──────────────────────────────────────┘
         │
         ├── version === "1.0.0"? ──→ 走 legacy 兼容路径（见 4.3）
         │
         ▼
┌──────────────────────────────────────┐
│ 3. 解压 ZIP                          │
│    - project.json → DAW store state  │
│    - samples/*.wav|mp3|ogg            │
│      → 解压到内存 → 创建 object URL  │
│    - presets/*.json → 音色库缓存      │
└──────────────────────────────────────┘
         │
         ▼
┌──────────────────────────────────────┐
│ 4. 恢复工程状态                       │
│    - 重建 tracks（重新分配 instrument）│
│    - 重建 clips（bufferUrl → object URL）│
│    - 恢复 transport 设置              │
│    - 恢复 markers 和 automation       │
└──────────────────────────────────────┘
         │
         ▼
┌──────────────────────────────────────┐
│ 5. 更新最近工程列表                   │
│    - 在 IndexedDB 记录路径/mtime     │
│    - 刷新 Recent Projects 菜单       │
└──────────────────────────────────────┘
```

### 3.3 自动保存（Auto-Save）

- 每隔 **3 分钟**（可配置）触发一次自动保存
- 自动保存目标为 IndexedDB（不打扰用户）
- 浏览器关闭时若有未保存更改，弹出确认框提示用户
- 下次打开应用时，检测 IndexedDB 中是否有比 GitHub 更新或本地文件更新的版本，提示用户选择

---

## 四、兼容性设计

### 4.1 向前兼容（格式版本升级）

- 解析器读取 `version` 字段后，只解析认识字段，忽略陌生字段
- 新版本写入时使用新字段，老版本解析器会跳过未知字段而不报错
- 版本号规则：`major.minor.patch`
  - `major` 不变：新增可选字段，向后兼容
  - `major` 递增：破坏性变更，需要迁移工具

### 4.2 向后兼容（v1.0 工程加载）

当前代码库中 `getProjectData()` 输出的是简化结构（只有 `bpm`, `tracks`, `clips`）。需要兼容加载这类工程：

**检测方式**：
```javascript
if (!manifest || manifest.format !== 'duckdaw') {
  // 旧格式：直接解析为 legacy project
  loadLegacyProject(jsonData);
  return;
}
```

**Legacy 转换层**：
```javascript
function loadLegacyProject(data) {
  // 将 v1.0 的 flat 结构映射到 v1.1 的分层结构
  return {
    meta: { version: "1.0.0", projectId: generateUUID() },
    transport: {
      bpm: data.bpm,
      timeSignature: [4, 4],
      swing: 0,
      isLooping: false,
      loopStart: 0,
      loopEnd: 16,
      metronome: { enabled: false, sound: 'cute', volume: 0.8, subdivisions: 1 }
    },
    tracks: data.tracks.map(t => ({
      ...t,
      insertEffects: [],
      sends: [],
      automationLanes: []
    })),
    clips: data.clips,
    markers: [],
    automation: [],
    tempoTrack: [{ position: 0, bpm: data.bpm, curve: 'linear' }],
    arrangements: [{ id: generateUUID(), name: 'Main', clips: data.clips.map(c => c.id) }]
  };
}
```

### 4.3 音频资源兼容性

- **v1.0**：`bufferUrl` 存的是 `blob:http://...` 临时 URL，重启后失效
- **v1.1**：将音频二进制文件打包进 `samples/`，ZIP 解压后重新生成 object URL
- **迁移策略**：加载 v1.0 工程后，检测到 `bufferUrl` 以 `blob:` 开头时，保留 blob（在当前 session 有效），但提示用户 "检测到未打包的音频，建议另存以捆绑采样"

---

## 五、GitHub 同步整合

### 5.1 统一文件格式

GitHub 同步和本地存储共用同一个 `.duckdaw` ZIP 文件格式：
- 本地保存：File System Access API 写到用户选定的本地目录
- GitHub 同步：将 `.duckdaw` 文件作为仓库的一个资产文件提交到 GitHub

**文件命名规则**：
```
{projectId}.duckdaw
```
（例如：`a1b2c3d4-e5f6.duckdaw`）

> 不用工程名作为文件名，避免多设备同步时因重命名产生冲突。工程名存储在 `manifest.json` 内部。

### 5.2 GitHub Sync 流程改进

现有 GitHub Sync 机制是直接序列化 `dawStore` 状态为 JSON 上传。改进后：

```
GitHub Sync 触发
       │
       ▼
┌──────────────────────────────┐
│ 检测本地是否有更新版本        │
│ - 比较 updatedAt 时间戳      │
└──────────────────────────────┘
       │
       ├── 无更新 ──→ 跳过
       │
       ▼
┌──────────────────────────────┐
│ 打包本地 .duckdaw ZIP         │
│ （包含采样资源）              │
└──────────────────────────────┘
       │
       ▼
┌──────────────────────────────┐
│ 通过 GitHub API 上传/更新文件 │
│ PUT /repos/{owner}/{repo}/   │
│   contents/path/project.duckdaw│
└──────────────────────────────┘
       │
       ▼
┌──────────────────────────────┐
│ commit message 格式:          │
│ "Sync: {projectName} @ {ts}" │
└──────────────────────────────┘
```

### 5.3 冲突处理

多设备同时修改产生冲突时：
1. 比较 `updatedAt` 时间戳，保留最新版本
2. 旧版本自动备份到 `backups/` 目录（ZIP 格式）
3. 用户可手动查看/恢复冲突版本

---

## 六、关键技术选型

| 功能 | 方案 | 理由 |
|------|------|------|
| ZIP 打包/解压 | `JSZip` | 浏览器端纯 JS 实现，轻量，支持大文件流式读写 |
| 文件系统访问 | File System Access API | 现代浏览器支持，可直接读写磁盘文件，无需每次下载 |
| 离线降级 | Blob Download + `<a download>` | Safari/旧浏览器不支持 File System Access API 时使用 |
| 崩溃缓存 | IndexedDB（通过 `idb-keyval`） | 存储最近自动保存的工程内容，支持跨 session 恢复 |
| UUID 生成 | `crypto.randomUUID()` | 浏览器内置，无需引入额外依赖 |
| 路径解析 | 使用相对路径（`samples/xxx.wav`） | ZIP 内资源定位，与文件系统解耦 |

---

## 七、UI/UX 设计

### 7.1 菜单结构

```
File
├── New Project              Ctrl+N
├── Open Project...          Ctrl+O
├── Open Recent >
│   ├── example-song.duckdaw
│   ├── my-beat.duckdaw
│   └── ─────────────
│   └── Clear Recent
├── Save Project             Ctrl+S
├── Save Project As...       Ctrl+Shift+S
├── ─────────────
├── Save to GitHub            Ctrl+G
├── Load from GitHub          Ctrl+Shift+G
├── ─────────────
├── Export Audio...           Ctrl+E
├── Export MIDI...            Ctrl+Shift+E
├── Export Stems...           Ctrl+Alt+E
├── ─────────────
├── Project Templates >
│   ├── Empty Project
│   ├── 4/4 Beat Template
│   ├── 6/8 Ballad Template
│   └── ─────────────
│   └── Save as Template...
└── Exit
```

### 7.2 未保存提示

- 标题栏工程名后显示 `*` 表示有未保存更改（如 `My Song *`）
- 关闭标签页/浏览器前弹出对话框：

```
┌──────────────────────────────────────┐
│  未保存的更改                         │
│                                       │
│  您对 "My Song" 做了以下更改但未保存：│
│  · 添加了 3 个音符                   │
│  · 修改了轨道 "Bass" 的音量          │
│                                       │
│  [保存]  [另存为...]  [不保存]  [取消]│
└──────────────────────────────────────┘
```

### 7.3 保存成功反馈

- 保存完成后，标题栏 `*` 消失，显示 "已保存" Toast 提示（2 秒后自动消失）
- 保存失败时显示红色错误 Toast，提示具体原因（磁盘满/权限不足/网络错误）

### 7.4 首次保存流程（File System Access API）

首次按 `Ctrl+S` 时：
1. 弹出系统文件保存对话框，扩展名过滤 `.duckdaw`
2. 用户选择保存位置和文件名
3. 后续 `Ctrl+S` 直接写入同一文件，不再弹窗
4. 若用户希望另存为，使用 `Ctrl+Shift+S`

---

## 八、模块接口设计

```typescript
// 工程打包/解包核心 API

interface ProjectPackage {
  manifest: Manifest;
  project: ProjectData;
  samples: Map<string, ArrayBuffer>;   // filename → binary
  presets: Map<string, object>;         // filename → preset JSON
}

interface ProjectStorage {
  // 保存工程到指定位置
  save(project: ProjectPackage, options?: SaveOptions): Promise<void>;

  // 从文件加载工程
  load(fileHandle: FileSystemFileHandle): Promise<ProjectPackage>;

  // 从 Blob 加载（降级方案）
  loadFromBlob(blob: Blob): Promise<ProjectPackage>;

  // 导出工程到指定路径
  exportToPath(path: string): Promise<void>;
}

interface SaveOptions {
  // 强制显示文件保存对话框（忽略已记忆的路径）
  forceDialog?: boolean;
  // 保存后同步到 GitHub
  syncToGitHub?: boolean;
  // 保存描述信息（Git commit message 用）
  commitMessage?: string;
}
```

```typescript
// 工程加载器（处理多版本兼容）

class ProjectLoader {
  // 检测文件格式版本
  detectVersion(source: FileSystemFileHandle | Blob): Promise<string>;

  // 加载工程（自动路由到对应版本的解析器）
  async load(source): Promise<ProjectData>;

  // v1.0 legacy 格式转换
  migrateFromV1(legacyData: LegacyProjectData): ProjectData;
}
```

---

## 九、数据流总图

```
┌──────────────────────────────────────────────────────────────────┐
│                           用户操作                                 │
│   Ctrl+S 保存 │ Ctrl+O 打开 │ File>Save │ GitHub Sync │ AutoSave │
└───────────────┬──────────────────────────────────────────────────┘
                │
                ▼
┌──────────────────────────────────────────────────────────────────┐
│                     ProjectStorageService                         │
│   save() / load() / loadFromBlob() / exportToPath()             │
└───────────────┬──────────────────────────────────────────────────┘
                │
    ┌───────────┼────────────┐
    │           │            │
    ▼           ▼            ▼
┌────────┐ ┌──────────┐ ┌────────────┐
│FS API │ │ IndexedDB │ │ GitHub API │
│(优先) │ │ (自动保存) │ │ (云同步)   │
└───┬────┘ └────┬─────┘ └─────┬──────┘
    │            │              │
    └────────────┴──────────────┘
                  │
                  ▼
        ┌─────────────────┐
        │   ZIP 打包/解包 │
        │    (JSZip)      │
        └────────┬────────┘
                 │
     ┌───────────┼────────────┐
     │           │            │
     ▼           ▼            ▼
 manifest.json project.json samples/*.wav
     │
     ▼
┌────────────────────┐
│   DAW Store 状态   │
│ (tracks/clips/... )│
└────────────────────┘
```

---

*本文档版本：v1.0*
*关联文档：`../FEATURE_REQUIREMENTS.md`（功能需求总文档）*
