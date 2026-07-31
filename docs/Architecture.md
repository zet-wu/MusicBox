# MusicBox 架构说明

本文描述 MusicBox 当前代码结构和主要运行链路。它以仓库现状为准：主进程和渲染进程都已经从早期全局对象模式迁移到更明确的 controller/service/composition 分层，渲染进程旧 `core/`、`services/` 目录现在仅作为兼容转发层保留。

## 总览

MusicBox 是一个 Electron 桌面应用，由四个主要部分组成：

```text
Electron main process
  src/main/main.ts
  src/main/core/Application.ts
  src/main/controllers/*.ts
  src/main/services/**
        |
        | contextBridge + ipcRenderer/ipcMain
        v
Preload boundary
  src/main/preload.ts exposes window.electronAPI
        |
        v
Renderer process
  src/renderer/src/app/**
  src/renderer/src/features/**
  src/renderer/src/ui/**
  src/renderer/src/infrastructure/electron/**
        |
        v
Native/helper modules
  native/ Rust N-API audio engine
  src/main/metadata_editor.py packaged as metadata_editor executable
```

核心原则：

- 主进程负责系统能力、窗口、文件、网络磁盘、音乐库缓存、插件安装、原生音频和安全校验。
- preload 只暴露白名单 API 到 `window.electronAPI`，renderer 不直接访问 Node/Electron。
- renderer 负责 UI、播放运行时、功能编排和插件 host。
- Rust N-API 模块提供 WASAPI shared/exclusive 等原生音频能力，Web Audio 作为 renderer 内可用的播放引擎。
- Python helper 只处理音频元数据写入相关任务，构建时打包到 `dist/main`。

## 启动流程

1. `src/main/main.ts` 创建 `Application`，在 `app.whenReady()` 后启动。
2. `Application.applyConfiguration()` 根据用户配置处理硬件加速和 GC 标志。
3. `Application.initializeCoreServices()` 注册核心服务，但尽量延迟实例化重型服务。
4. `Application.registerStartupControllers()` 在窗口创建前注册 IPC controller，确保 renderer 首屏加载时 preload API 可用。
5. `WindowManager.createMainWindow()` 创建无边框主窗口并加载 `src/renderer/public/index.html`。
6. 主窗口显示后，后台加载音乐库缓存和来源注册表，向 renderer 发送 `library:updated`，并按设置调度全来源扫描。
7. renderer 入口 `src/renderer/src/app/bootstrap/main.ts` 加载基础工具、API、插件框架、UI component 和应用启动代码。
8. `createAppComposition()` 组装生命周期、路由、播放、音乐库、插件、快捷键和 UI facade。

## 主进程结构

`src/main/` 是 Electron main process 的 TypeScript 源码。

```text
src/main/
  main.ts                  Electron app lifecycle 入口
  preload.ts               contextBridge 白名单 API
  controllers/             IPC controller
  core/                    应用生命周期、配置、窗口、服务容器
  services/                主进程业务服务
  utils/                   路径安全、文件搜索、元数据等工具
  metadata_editor.py       元数据编辑 helper 源码
```

### core

- `Application.ts`：启动、关闭、服务注册、controller 注册、后台初始化。
- `WindowManager.ts`：主窗口和桌面歌词窗口创建、窗口尺寸持久化、托盘关闭行为、窗口间消息转发。
- `ServiceContainer.ts`：轻量服务容器，支持延迟实例化。
- `ConfigManager.ts`：读取和保存 `app.getPath('userData')` 下的 JSON 配置。

### controllers

controller 使用 `@Controller`、`@IpcHandle`、`@IpcOn` 装饰器声明 IPC 通道，并继承 `BaseController` 统一注册和注销。

典型 controller：

- `AppController`、`WindowController`、`DialogController`：应用、窗口、对话框能力。
- `LibraryController`：本地/网络音乐扫描、缓存、歌单、元数据。
- `NativeAudioController`：Rust N-API 音频引擎桥接。
- `NetworkController`：SMB / WebDAV 挂载、状态、目录结构。
- `ExtensionsController`：插件安装、启用禁用、文件读取、插件存储。
- `DesktopLyricsController`、`TrayController`、`GlobalShortcutsController`：桌面歌词、托盘、全局快捷键。

### services

- `services/library/LibraryCacheManager.ts` 管理可重建的音轨索引、歌单、忽略列表和缓存校验。
- `services/library/LibrarySourceManager.ts` 管理目录/精确文件来源以及歌单与目录来源的绑定。
- `services/library/CoverCacheStorage.ts` 管理应用专用封面缓存目录、所有权标记和文件清单。
- `services/library/MetadataHandler.ts` 负责元数据读取/写入相关处理。
- `services/network/NetworkDriveManager.ts` 和 `NetworkFileAdapter.ts` 抽象 SMB / WebDAV 文件访问。
- `services/extensions/ExtensionInstaller.ts` 管理外部 ZIP 插件安装到用户数据目录。
- `services/extensions/ExtensionStorageService.ts` 为插件提供 `global` / `workspace` JSON 存储。

## Preload 与 IPC 边界

`src/main/preload.ts` 通过 `contextBridge.exposeInMainWorld('electronAPI', ...)` 暴露能力。BrowserWindow 配置中 `nodeIntegration: false`、`contextIsolation: true`、`webSecurity: true`。

当前暴露的能力按命名空间组织：

- `app`、`window`、`dialog`、`tray`、`hardwareAcceleration`
- `library`、`settings`、`userdata`
- `media`、`lyrics`、`covers`、`equalizerPresets`
- `audio`、`nativeAudio`、`onNativeAudioEvent`
- `networkDrive`、`globalShortcuts`、`systemMediaKeys`、`desktopLyrics`
- `extensions`、`httpServer`、`benchmark`、`memory`

通用 Node API 已默认关闭。只有设置 `MUSICBOX_ENABLE_LEGACY_NODE_APIS=1` 时，preload 才会暴露有限的兼容 `fs`、`os`、`path` 方法。新代码应使用领域 API 或 `src/renderer/src/infrastructure/electron/*Gateway.ts`，不要重新引入通用文件系统访问。

## 渲染进程结构

渲染进程位于 `src/renderer/`，由 Vite 构建。Vite root 是 `src/renderer/src`，构建产物输出到 `src/renderer/public`，入口包括主窗口 `index.html` 和桌面歌词窗口 `DesktopLyrics.html`。

```text
src/renderer/src/
  app/                     应用启动、组合根、生命周期、运行时协调
  features/                按业务域拆分的功能模块
  ui/                      页面、弹窗、组件和基础 Component
  infrastructure/electron/ Electron API gateway
  api/                     MusicBoxAPI、播放运行时 API 和类型
  extensions/              插件 host、API、内置插件、示例和文档
  shared/                  跨功能共享的缓存、歌词、网络、类型
  styles/                  SCSS 分层样式
  assets/                  图标和图片
  core/                    deprecated 兼容转发层
  services/                deprecated 兼容转发层
```

### app 层

`app/bootstrap/main.ts` 是 renderer 的真实入口。它先加载基础设施和 UI component，再导入 `./app` 创建应用实例。

`app/composition/AppCompositionRoot.ts` 是重构后的组合根，负责把运行时 controller、feature service、UI facade 和 legacy app bridge 接到一起。新增跨功能协作时，应优先在组合根显式注入依赖，而不是让模块互相访问全局对象。

`app/runtime/MusicBoxApp.ts` 保留应用级 facade，兼容现有插件和 UI 调用，同时把具体行为转发到 feature controller/service。

### features 层

`features/` 按业务域组织 renderer 逻辑，例如：

- `playback`：播放状态、队列、播放历史、播放服务、Web Audio / WASAPI engine adapter。
- `library`：音乐库数据、扫描入口、元数据编辑、UI 绑定。
- `mediaAssets`：歌词、封面、本地/内嵌/在线资源解析。
- `equalizer`：图形均衡器、参量均衡器、预设文件。
- `desktopLyrics`：桌面歌词窗口同步和渲染控制。
- `settings`：设置页面 controller、renderer、service。
- `extensions`：插件管理 UI 和插件 host service。
- `networkDrive`：网络磁盘管理和详情页数据。

### infrastructure/electron 层

`infrastructure/electron/ElectronBridge.ts` 是 `window.electronAPI` 的类型化访问基础。各 `*Gateway.ts` 将 preload API 包装成领域方法，例如 `libraryGateway`、`nativeAudioGateway`、`desktopLyricsGateway`、`settingsSystemGateway`。

Renderer feature 不应直接散落调用 `window.electronAPI`。新增 IPC 后，推荐链路是：

```text
main controller -> preload namespace -> infrastructure/electron gateway -> feature service/controller -> UI
```

### 兼容层

`src/renderer/src/core/**` 和 `src/renderer/src/services/**` 已标记 `@deprecated`。这些文件只能包含注释和 import/export forwarding，由 `src/renderer/scripts/check-architecture-boundaries.mjs` 保护。新增代码不要从 `@/core`、`@/services` 或旧 `@js` 路径导入。

## 音频架构

MusicBox 当前有两类播放实现：

- Web Audio engine：位于 `features/playback/service/audioEngine/webAudio/`，处理浏览器侧解码、播放、预加载、进度、可见性和对象 URL 生命周期；其中 `WebAudioTransportController` 同步媒体元素的外部播放状态，自然结束仅由 `ended` 路径发布曲目结束通知。
- WASAPI/native engine：renderer 通过 `WasapiEngine.ts` 和 `nativeAudioGateway` 调用主进程 `NativeAudioController`，再桥接 `dist/main/NativeAudio.node`。

`PlaybackService` 统一暴露播放控制，`AudioEngineAdapter` 负责 Web Audio / WASAPI 切换。`PlaybackQueue` 是顺序、随机和单曲循环模式共享的显式队列模型，使用稳定的 `queueId` 支持排序和状态恢复；随机模式直接调整可见队列顺序，不维护隐藏播放序列。`native/` 中的 Rust crate 使用 N-API 暴露原生音频能力，并在 `npm run build:rs` 时复制到 `dist/main/NativeAudio.node`。

`SystemMediaSessionController` 订阅 `PlaybackStore`，通过 Media Session API 向系统同步 Web Audio 的元数据、状态和控制动作。WASAPI 绕过 Chromium 音频焦点，因此 Windows 下仅通过 `systemMediaKeys` gateway 和 `GlobalShortcutsController` 提供媒体键后备；该后备不提供 Windows 系统媒体浮层元数据。

成功开始新的播放会话时，播放运行时发布 `playbackStarted` 事件。组合根启动的 `PlaybackHistoryController` 常驻订阅该事件，并由播放历史服务统一更新最近播放与累计统计；页面只读取和订阅结果，不参与记录。

## 音乐库与元数据

音乐库数据由主进程持久化，renderer 通过 `libraryGateway` 和 `LibraryBridge` 获取。索引、来源和用户数据具有不同生命周期，相关文件存放在 Electron userData 目录：

- `music-library-cache.json`：可重建的音轨索引和扫描统计，以及需要保留的歌单、收藏和忽略列表。
- `music-library-sources.json`：持续追踪的目录来源、精确文件来源及歌单目录绑定。
- `music-folders-settings.json`：设置页音乐文件夹列表和自动扫描计划。
- `window-config.json`：主窗口尺寸和桌面歌词位置。
- `extensions.json`、`extensions/`、`extension-storage/`：外部插件和插件存储。

文件夹导入统一注册为持续来源，单个或多个文件导入统一注册为精确来源；主页、设置页和歌单目录绑定共享这套来源模型。索引重建只清除音轨元数据、扫描记录和统计，随后扫描全部已注册来源；歌单、收藏、忽略列表、来源和绑定保持不变。歌单同时保存手动成员和目录绑定派生的成员，界面歌曲数以当前索引可解析的成员为准。

收藏以 `music-library-cache.json` 中固定的系统歌单 `system:favorites` 持久化，歌曲的 `favorite` 状态由该歌单派生。Renderer 通过 `FavoriteService` 串行修改状态，并订阅 preload 转发的收藏变化事件，使播放器与歌曲页面保持同步。

元数据读取主要依赖 `music-metadata` 等 Node 侧库；写入和复杂处理由 `metadata_editor.py` helper 支持，完整打包时通过 `npm run build:python` 生成平台可执行文件。

## 封面缓存

封面缓存清理跨越 renderer 内存缓存和主进程磁盘缓存。默认目录 `userData/CoverCache` 由应用完整管理；自定义位置使用专用 `MusicBoxCoverCache` 子目录，并通过所有权标记和文件清单只删除应用创建的文件。清理不会修改音频内嵌封面、歌单自定义封面或来源不明的用户图片。

## 插件系统

插件系统位于 `src/renderer/src/extensions/`，参考 VS Code 扩展模型：

- `extensions/core/`：生命周期、事件、注册表、激活器、插件服务和 sandbox runtime。
- `extensions/api/`：播放器、音乐库、UI、存储、设置、命令、快捷键、网络、窗口等标准 API。
- `extensions/builtin/`：内置插件和 `extensions.json` 索引。
- `extensions/examples/`：插件示例。
- `extensions/docs/`：插件开发文档。

外部插件通过 ZIP 安装。主进程 `ExtensionInstaller` 负责 manifest 校验、路径安全和文件落盘，renderer 插件 host 负责扫描、加载、激活和停用。插件应通过 `context.api` 访问能力，不能依赖 renderer 内部模块或 preload 的通用 Node API。

## 安全边界

- Renderer 禁用 Node integration，并启用 context isolation。
- preload 只暴露显式白名单能力。
- 文件系统、插件安装和扩展文件读取必须在主进程校验路径，复用 `src/main/utils/pathSecurity.ts`。
- 外部链接通过主进程 `app:openExternal` 打开。
- 插件安装会阻止 ZIP path traversal，并拒绝覆盖内置插件 ID。
- 旧通用 `fs/path/os` preload 能力默认关闭，仅用于迁移期兼容。

## 构建与发布链路

```text
npm run build
  -> npm run build:python
  -> npm run build:renderer
  -> npm run build:rs
  -> npm run build:ts
  -> electron-builder
```

打包配置在 `electron-builder.yml`。应用文件包含：

- `dist/main/**/*`：主进程编译产物、Python helper、NativeAudio.node。
- `src/renderer/public/**/*`：Vite 构建后的 renderer 静态资源。
- `node_modules/**/*`：运行时依赖，按配置排除测试、文档和无关文件。

`asarUnpack` 和 `extraResources` 会处理 `NativeAudio.node` 与 `metadata_editor`，因为它们需要作为独立二进制资源加载。

## 新增功能建议

新增主进程能力：

1. 在 `src/main/controllers/` 增加或扩展 controller。
2. 在 `src/main/preload.ts` 中只暴露必要方法。
3. 在 `src/renderer/src/infrastructure/electron/` 增加 gateway。
4. 在对应 `features/*/service` 中封装业务行为。
5. 由 UI component 或 app composition 调用 feature service。

新增 renderer 功能：

1. 优先放在对应 `features/<domain>/`。
2. UI 放在 `ui/pages`、`ui/widgets`、`ui/dialogs` 或 `ui/modals`。
3. 跨功能共享的纯逻辑放到 `shared/`。
4. 不要从 deprecated `core/`、`services/` 引入新依赖。
5. 运行 `npm run typecheck:renderer` 和 `cd src/renderer && npm run lint`。
