# 渲染进程架构

本文聚焦 `src/renderer/`。渲染进程已经从早期 `src/js` 和全局 `app.js` 组织方式迁移到 Vite + TypeScript + feature 分层结构。旧的 `core/`、`services/` 目录仍存在，但只作为兼容转发层。

## 入口与构建

- Vite 配置：`src/renderer/vite.config.js`
- Vite root：`src/renderer/src`
- 构建输出：`src/renderer/public`
- 主窗口入口：`src/renderer/src/index.html`
- 桌面歌词入口：`src/renderer/src/DesktopLyrics.html`
- 主 renderer 入口：`src/renderer/src/app/bootstrap/main.ts`

`app/bootstrap/main.ts` 会先加载工具、应用 API和插件框架，再导入 `./app`；页面、组件和弹窗由组合根按依赖关系实例化，不依赖入口文件的重复副作用导入。

## Canonical 目录

```text
src/renderer/src/app/
  bootstrap/               应用入口与 createMusicBoxApp
  composition/             组合根和 host ports
  lifecycle/               初始化、清理、首屏生命周期
  runtime/                 路由、快捷键、事件绑定、插件启动、UI facade
  shell/                   顶层 shell 视图控制

src/renderer/src/features/
  appShell/                应用外壳、窗口、托盘、通知、更新
  audioDriver/             音频驱动 UI/设置协调
  desktopLyrics/           桌面歌词窗口与同步
  equalizer/               图形/参量均衡器
  events/                  应用事件服务
  extensions/              插件管理功能
  library/                 音乐库来源管理、索引重建、扫描、元数据编辑
  lyrics/                  canonical TTML、provider、来源编排和 AMLL Core 渲染
  media/                   文件选择、音频读取、媒体文件系统
  mediaAssets/             封面和其他媒体资源
  networkDrive/            SMB / WebDAV 网络磁盘
  playback/                播放队列、状态、音频引擎、UI 绑定
  playlists/               歌单数据、播放、封面、文件导入与目录绑定
  settings/                设置页 controller/service/renderer
  userData/                心情、日记等用户数据

src/renderer/src/ui/
  base/                    基础 Component
  collections/             集合 Surface、主从宿主和生命周期类型
  pages/                   页面级组件
  widgets/                 播放器、导航、列表、歌词等常驻组件
  dialogs/                 轻量对话框
  modals/                  模态窗口

src/renderer/src/infrastructure/electron/
  ElectronBridge.ts        window.electronAPI 访问基础
  *Gateway.ts              按领域封装 preload API

src/renderer/src/shared/
  cache/                   renderer 本地缓存
  network/                 网络请求 client
  types/                   app contracts
```

歌词以 TTML 为唯一 canonical 表示，统一管线和手动来源选择器见 [歌词系统架构](LyricsArchitecture.md)。

## 依赖方向

推荐依赖方向：

```text
ui -> features -> infrastructure/electron -> preload -> main
app composition -> features/ui/shared
features -> shared
extensions -> public Extension API
```

避免的方向：

- `features` 直接依赖具体 UI DOM 细节，除非在 `ui-bindings` 中作为显式绑定层。
- `ui` 直接调用 `window.electronAPI`。
- 新代码从 `@/core`、`@/services` 或 `@js` 导入。
- 插件 host/framework 硬编码某个具体插件 ID、命令前缀或插件私有行为。

## 组合根

`app/composition/AppCompositionRoot.ts` 是渲染进程重构后的关键文件。它负责：

- 创建 `ComponentRegistry`、`DOMEventBinder`、`APIEventBinder`、`ViewRouter`。
- 创建播放、音乐库、歌单、快捷键、插件、网络磁盘等 app controller。
- 将 feature service 与 `MusicBoxApp` facade、UI facade、legacy plugin app bridge 显式连接。
- 配置跨功能依赖，例如 `desktopLyricsService` 获取播放快照，`equalizerService` 获取当前音频引擎。

当新功能需要跨模块协作时，应优先在组合根注入一个明确端口，而不是在模块内部读取全局对象。

共享 `#content-area` 不由页面直接覆盖。`ContentMountManager` 为核心视图分配稳定、隔离的挂载根，UI facade 只负责激活或隐藏；普通视图的像素滚动由 `MainContentScrollCoordinator` 按视图 key 保存，集合 Surface 管理的视图则由自身快照恢复。

目录来源管理由 `FolderSourcesPage` 经 library feature service 调用类型化 Electron gateway；文件夹卡片只消费目录概览，不直接接触完整来源文件清单。双击卡片后，页面按来源 ID 延迟查询歌曲，并在 `folders` 路由内部复用 `TrackCollectionDetail` 展示详情，因此选择、播放、收藏和上下文菜单与艺术家、专辑详情保持一致，同时由页面 generation 防止过期查询回写。

文件夹与歌单的反向绑定使用独立弹窗，并通过页面组件绑定层接入 Dialog facade，避免页面直接访问全局应用对象。“从文件夹创建歌单”同样复用标准 `CreatePlaylistDialog`，通过类型化 options 传递预填名称和来源上下文；创建动作服务先创建歌单，再调用现有来源绑定 API。普通创建和从歌曲创建歌单继续走同一弹窗，但不会携带来源上下文。

## 运行时 facade

`app/runtime/MusicBoxApp.ts` 仍然暴露很多应用级方法，例如 `scanMusicFolder()`、`handleViewChange()`、`playTrackFromPlaylist()`。这些方法主要用于兼容旧 UI 绑定和插件调用，真实实现已经下沉到 `features/*`。

新增代码不要继续扩大 `MusicBoxApp` 的职责，除非它是应用级 facade 必须暴露的兼容入口。

## 集合页面生命周期

艺术家、专辑、歌单、文件夹来源、最近播放和歌曲集合详情统一组合 `AdaptiveCollectionSurface`。Surface 以 50 个业务项目为边界：较小集合直接渲染，达到边界后使用虚拟渲染；页面只提供稳定项目 key、布局和项目模板，不自行计算虚拟行、总高度、`scrollMargin` 或 overscan。

新增可能持续增长的集合页必须遵循以下约定：

- 业务事件绑定在不会随项目更新而替换的页面根或集合根上，并通过事件委托解析当前项目；项目重绘和虚拟化器重建不得重复增加监听器。
- 项目身份使用领域稳定 key。歌曲优先使用 `fileId`，其次使用规范化路径；数组下标只作为当前显示序号和回调参数，不能作为业务身份。
- 封面只为 Surface 报告的已渲染项目调度。封面完成后更新模型并调用 `invalidateItem()`，不得为普通封面更新执行整页 `render()`。
- 数据过滤、排序、添加和删除通过 `update()` 交给 Surface。页面不得根据 49/50 项边界维护两套渲染器或事件逻辑。
- 页面隐藏或跨路由切换时使用 Surface 的 `suspend()` / `resume()` 快照；滚动恢复由 `MainContentScrollCoordinator` 按完整 location key 协调，过期恢复任务必须失效。

拥有列表和详情两个位置的页面还必须使用 `MasterDetailViewHost` 保留稳定的 `listRoot` 与 `detailRoot`。进入详情、返回列表和路由恢复都通过 Host 切换 location；列表锚点由项目 key 快照恢复，详情滚动使用包含集合 identity 的 location key。找不到旧锚点或目标项目时应安全回退到像素位置，不能阻止正常导航。

艺术家、专辑、歌单和文件夹的本地搜索复用 `CollectionSearch`，页面只声明可搜索字段；音乐库歌曲的全局异步搜索仍由 `LibraryAppController` 处理。

## Feature 模块约定

一个 feature 通常由以下部分组成：

```text
features/<domain>/
  index.ts                 对外导出
  <Domain>Controller.ts    可选，状态编排或 UI 入口
  service/                 领域服务、gateway adapter、纯业务逻辑
  ui-bindings/             可选，连接 UI component 与 feature 的适配层
  domain/                  可选，纯领域模型
```

放置建议：

- 与 Electron IPC 交互的代码放在 service，并通过 `infrastructure/electron` gateway 访问。
- 跨页面共享的收藏状态由 `features/library/service/FavoriteService.ts` 统一写入和发布，页面不自行维护副本。
- 只处理页面/组件事件绑定的代码放到 `ui-bindings`。
- 可测试、与 DOM 无关的规则放到 `domain` 或 `service`。
- 多个 feature 共享的纯工具放到 `shared/`。

## Electron Gateway

`infrastructure/electron/ElectronBridge.ts` 提供两个基础能力：

- `getElectronAPI()`：读取 preload 暴露的 `window.electronAPI`，缺失时抛出明确错误。
- `ElectronNamespaceAdapter`：包装某个命名空间的 `call()` 和 `on()`。

新增 IPC 应按以下路径接入：

1. 主进程 controller 增加 IPC handler。
2. preload 增加对应 namespace 方法。
3. `infrastructure/electron` 增加或扩展 gateway。
4. feature service 调用 gateway。
5. controller/UI 只依赖 feature service。

## 兼容层与架构检查

`core/` 和 `services/` 目录是迁移期兼容层。每个文件必须：

- 包含 `@deprecated` 注释。
- 只包含注释和 import/export 转发。
- 不包含新的业务逻辑。

`src/renderer/scripts/check-architecture-boundaries.mjs` 会检查：

- 禁止新代码从旧 `@/core`、`@/services`、`@js` 路径导入。
- 禁止在主 renderer 中使用 `eval` 或注入 script 标签加载插件代码。
- 禁止把 `createExtensionAPI` 暴露到主 renderer window。
- 禁止 plugin host/framework 硬编码内置插件 ID 或命令前缀。

运行：

```bash
cd src/renderer
npm run check:architecture
npm run lint
```

## 播放模块

播放相关代码集中在 `features/playback/`：

- `PlaybackController.ts`：应用层播放 controller。
- `PlaybackHistoryController.ts`：常驻订阅新播放会话并触发历史记录。
- `SystemMediaSessionController.ts`：同步系统媒体状态并将系统控制转发到播放 controller。
- `PlaybackStore.ts`：播放状态 store。
- `domain/PlaybackQueue.ts`：显式队列、播放模式和队列变更规则。
- `domain/TrackIdentity.ts`：歌曲去重和同一性判断。
- `service/PlaybackService.ts`：播放服务 facade。
- `service/RecentPlaybackHistoryService.ts`：统一持久化最近播放和累计统计。
- `service/AudioEngineAdapter.ts`：Web Audio / WASAPI 切换适配。
- `service/audioEngine/webAudio/`：Web Audio 实现，由 transport controller 区分外部暂停同步与自然结束通知。
- `service/audioEngine/wasapi/WasapiEngine.ts`：WASAPI renderer adapter。
- `ui-bindings/`：播放器、列表等 UI 事件绑定。

`PlaybackQueue` 是队列顺序和当前队列项的权威来源。各播放模式共享同一组可见 `QueueEntry`，UI 通过 `queueId` 提交排序，队列快照随播放状态持久化。音频引擎返回的播放元数据由 `PlaybackStateSynchronizer` 与当前队列歌曲合并后写入 `PlaybackRuntimeState`，以保留 `fileId` 等音乐库身份；上层不直接把引擎对象作为当前歌曲。播放状态变化通过事件和 store 同步到播放器 UI、歌词、桌面歌词、系统媒体会话和插件 API；新的有效播放会话另行发布 `playbackStarted`，由组合根中的历史 controller 统一记录，最近播放页和统计页只消费结果。

## 样式结构

样式入口：

- `styles/main.scss`：主窗口样式入口。
- `styles/DesktopLyrics.scss`：桌面歌词窗口样式入口。

样式目录按用途拆分：

- `base/`：reset、loading。
- `layout/`：app、content、navbar、sidebar。
- `components/`：按钮、表单、播放器、列表等。
- `pages/`：页面级样式。
- `features/`：均衡器、迷你模式、插件、网络磁盘、快捷键等功能样式。
- `dialogs/`：对话框样式。
- `theme/`：设计 token。

## 新增 renderer 代码检查清单

- 是否放在 canonical 目录，而不是 deprecated `core/` / `services/`。
- 是否通过 gateway 访问 preload API。
- 是否把跨模块依赖显式注入到组合根或端口对象。
- 可增长集合是否复用了 `AdaptiveCollectionSurface`，主从页面是否复用了 `MasterDetailViewHost`。
- 集合事件是否绑定在稳定根，封面更新是否只失效对应项目。
- 是否清理 DOM listener、API listener、timer、plugin disposable。
- 是否运行 `npm run typecheck:renderer`。
- 是否运行 `cd src/renderer && npm run lint`。
