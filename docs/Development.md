# 开发指南

本文记录 MusicBox 本地开发、检查、构建和常见排障流程。

## 环境要求

- Node.js >= 22.0.0
- npm，使用项目 lockfile 对应版本即可
- Python >= 3.8，用于 `src/main/metadata_editor.py` 及其打包；Python 依赖必须安装在仓库根目录的 `.venv` 虚拟环境中
- Rust toolchain with Cargo，推荐支持 Rust 2024 edition 的稳定版本
- Rust `NativeAudio.node` 和 WASAPI 仅适用于 Windows；macOS/Linux 使用 Web Audio 回退路径，并验证通用 Electron 功能和对应平台打包流程

## 创建 Python 虚拟环境

Windows PowerShell：

```powershell
python -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install --upgrade pip
python -m pip install -r requirements.txt
```

macOS/Linux：

```bash
python3 -m venv .venv
source .venv/bin/activate
python -m pip install --upgrade pip
python -m pip install -r requirements.txt
```

不要使用系统级 `pip` 安装本项目依赖。后续运行开发、Python helper 或平台打包命令时，应保持 `.venv` 处于激活状态。

## 安装 Node.js 和 Rust 相关依赖

```bash
npm install
npm run install:renderer
npm run install:rs
```

说明：

- 根目录依赖用于 Electron main、打包和共享脚本。
- `src/renderer` 是独立 Vite 工程，需要单独安装。
- `native` 是 Rust N-API 模块，同时有 npm wrapper 用于复制构建产物。
- `requirements.txt` 当前用于 Python 元数据 helper，其依赖只应安装到根目录的 `.venv`。

## 常用命令

Windows 完整开发启动：

```bash
# 构建 renderer、Windows native 和 main 后启动 Electron
npm run dev
```

当前 `npm run dev` 会构建 Windows WASAPI 模块，`npm run dev:main` 还使用了 Windows 的 `chcp`。macOS/Linux 使用以下流程启动 Web Audio 版本：

```bash
npm run build:renderer
npm run build:ts
npx electron dist/main/main.js --expose-gc
```

其余常用命令可在各平台执行：

```bash
# 只启动 Vite renderer dev server，适合纯 UI 调试
npm run dev:renderer

# 主进程 TypeScript 编译
npm run build:ts
npm run watch:ts

# renderer 构建/类型检查
npm run build:renderer
npm run typecheck:renderer

# Rust N-API 音频模块
npm run build:rs

# Python helper 打包
npm run build:python

# 完整应用打包
npm run build
```

## Renderer 检查

渲染进程 lint 会先执行架构边界检查，再执行 ESLint：

```bash
cd src/renderer
npm run check:architecture
npm run lint
```

架构检查会阻止以下问题：

- 新代码导入 deprecated `@/core`、`@/services` 或旧 `@js` 路径。
- 主 renderer 中使用 `eval` 或 script 注入加载插件。
- 插件 host/framework 硬编码具体内置插件 ID。
- 兼容转发文件混入业务逻辑。

类型检查：

```bash
npm run typecheck:renderer
```

## 文档站

文档站位于 `docs/`，使用 VitePress。

```bash
cd docs
npm install
npm run docs:dev
npm run docs:build
npm run docs:preview
```

主要页面：

- `docs/index.md`：官网首页。
- `docs/Architecture.md`：总体架构。
- `docs/RendererArchitecture.md`：渲染进程架构。
- `docs/Development.md`：本文。

## 开发流程建议

### 修改主进程或 preload

1. 在 `src/main/controllers/` 增加或修改 controller。
2. 必要时在 `src/main/services/` 增加主进程服务。
3. 在 `src/main/preload.ts` 暴露最小 API。
4. 在 `src/renderer/src/infrastructure/electron/` 添加 gateway。
5. 在 feature service 中封装业务调用。
6. 运行 `npm run build:ts` 和 renderer 检查。
7. 手动验证窗口创建、IPC 调用和错误路径。

注意不要在 renderer 直接使用 Node/Electron API。文件路径、插件包、网络磁盘等输入必须在主进程校验。

### 修改 renderer 功能

1. 优先在 `src/renderer/src/features/<domain>/` 中实现业务逻辑。
2. UI 放到 `src/renderer/src/ui/` 对应页面、组件、弹窗或 modal。
3. Electron 调用通过 `infrastructure/electron/*Gateway.ts`。
4. 跨功能依赖通过 `app/composition/AppCompositionRoot.ts` 或端口对象注入。
5. 运行 `npm run typecheck:renderer` 和 `cd src/renderer && npm run lint`。

### 修改播放或音频引擎

至少验证：

- 本地文件播放、暂停、继续、上一首、下一首、拖动进度。
- 播放列表和播放模式：顺序、随机、单曲循环。
- 音量、歌词同步、桌面歌词同步。
- Web Audio engine 可用。
- Windows 上验证 WASAPI shared/exclusive 切换和回退路径。
- 均衡器启停、预设、参量均衡器。

### 修改音乐库或网络磁盘

至少验证：

- 本地目录扫描和缓存加载。
- 搜索、删除、忽略列表、缓存校验。
- 歌单创建、重命名、删除、添加/移除歌曲。
- SMB / WebDAV 挂载、目录浏览、扫描、断开和刷新。
- 网络路径 `network://<driveId>/...` 不破坏本地路径逻辑。

### 修改插件系统

至少验证：

- 内置插件扫描和启用/禁用。
- 外部 ZIP 插件安装、卸载、重复安装覆盖。
- `context.api` 中命令、事件、UI、存储、播放器能力。
- 插件停用时 disposable 是否释放。
- 插件路径校验，不能读取安装目录之外文件。

## 打包说明

`npm run build` 包含 Windows WASAPI 原生模块构建，因此当前适合 Windows 完整构建。各平台安装包应在对应的目标操作系统上构建：

```bash
# Windows
npm run build:rs
npm run build:win

# macOS
npm run build:mac

# Linux
npm run build:linux
```

Windows 完整构建主要步骤：

1. `build:python`：将 `src/main/metadata_editor.py` 打包到 `dist/main/metadata_editor(.exe)`。
2. `build:renderer`：Vite 构建主窗口和桌面歌词窗口到 `src/renderer/public`。
3. `build:rs`：Cargo release 构建 `NativeAudio.node` 并复制到 `dist/main`。
4. `build:ts`：编译 `src/main` TypeScript 到 `dist/main`。
5. `build:main`：执行 `electron-builder`。

`electron-builder.yml` 中配置了平台目标、图标、asar unpack 和 extra resources。Windows 包中的 `NativeAudio.node` 与各平台生成的 `metadata_editor` 必须作为独立资源可访问。Python helper、原生模块、签名和系统打包工具依赖宿主平台，不要默认可以从一个操作系统完整交叉构建所有目标。

当前 `electron-builder.yml` 将 Windows 专用的 `NativeAudio.node` 放在全局 `extraResources` 中。正式构建 macOS/Linux 安装包前，必须先将其改为 Windows 条件资源，否则非 Windows 构建仍可能查找该文件。构建多架构安装包时，还必须分别生成与目标 CPU 架构匹配的原生模块，不能把 x64 的 `.node` 文件放入 arm64 安装包。

## 手动验证清单

当前项目没有根目录统一自动化测试套件。重要改动建议至少手动覆盖：

- 启动、关闭、最小化、最大化、托盘关闭行为。
- 首次进入欢迎页、选择音乐目录、扫描音乐库。
- 播放、暂停、上一首、下一首、进度、音量、播放模式。
- 歌词面板、TTML 逐字歌词、桌面歌词。
- 设置页：主题、快捷键、音乐目录、缓存、硬件加速、托盘。
- 插件管理：内置插件、外部插件安装/卸载、插件存储。
- 迷你播放器和窗口尺寸恢复。
- 网络磁盘挂载和断开。

## 常见排障

### renderer 页面加载失败

先确认已执行：

```bash
npm run build:renderer
```

开发模式主窗口会优先加载 `src/renderer/public/index.html`。如果该目录不存在，Electron 会尝试备用路径但界面可能无法显示。

### NativeAudio.node 未找到

执行：

```bash
npm run build:rs
```

构建成功后应存在 `dist/main/NativeAudio.node`。如果 Rust 编译失败，先确认 Rust toolchain、MSVC build tools 或对应平台原生编译环境已安装。

### Python helper 打包失败

先在仓库根目录激活虚拟环境，再重新安装依赖并构建。

Windows PowerShell：

```powershell
.\.venv\Scripts\Activate.ps1
python -m pip install -r requirements.txt
npm run build:python
```

macOS/Linux：

```bash
source .venv/bin/activate
python -m pip install -r requirements.txt
npm run build:python
```

脚本会优先使用 PyInstaller，失败后尝试 Nuitka。打包命令必须从已激活 `.venv` 的终端运行，并且打包阶段需要能访问 Python 包安装源。

### 插件没有加载

检查：

- `manifest.json` 是否包含 `id`、`name`、`version`、`main`。
- `main` 指向的文件是否存在。
- `module` 是否与入口脚本挂到 `window` 上的对象名一致。
- `activationEvents` 是否包含可触发事件，例如 `onStartUp`。
- 开发者工具 console 是否有插件激活错误。

### 架构检查失败

按错误信息定位文件和行号。通常需要：

- 将 `@/core` 导入改为 `@/app` 或 `@/features`。
- 将 `@/services` 导入改为 `@/features/*/service` 或 `@/infrastructure/electron`。
- 把业务逻辑移出兼容转发文件。
- 移除主 renderer 中的 `eval`、script 注入或插件 ID 硬编码。
