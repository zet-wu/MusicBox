# 仓库开发规范

## 项目结构与模块组织

`src/main/` 包含使用 TypeScript 编写的 Electron 主进程代码，主要按 `controllers/`、`services/`、`core/` 和 `utils/` 组织。`src/renderer/` 是基于 Vite 的渲染进程项目；大部分界面代码位于 `src/renderer/src/js/`，样式位于 `src/renderer/src/styles/`，静态资源位于 `src/renderer/src/assets/`。`native/` 是使用 Rust 编写的 N-API 音频引擎。`scripts/` 存放构建辅助脚本，`docs/` 存放项目文档，`build/` 存放打包资源，`test-files/` 用于保存本地媒体测试文件。

## 开发环境与依赖

- 操作系统：应用目标平台包括 Windows、macOS 和 Linux。通用的 Electron 主进程、渲染进程、Web Audio 播放和 Python 元数据功能应保持三平台兼容。
- Node.js：要求 Node.js 22 或更高版本，依赖统一使用 npm 管理。根目录、`src/renderer/` 和 `native/` 分别拥有独立的 `package.json`，修改依赖时应在对应目录执行 npm 命令。
- Python：使用 Python 3.8 或更高版本，并统一通过仓库根目录的 `.venv` 虚拟环境管理依赖。不得使用系统级 `pip` 安装项目依赖。依赖定义在 `requirements.txt` 中，主要用于元数据处理以及 Python 模块打包。
- Rust：通过用户级 rustup 管理稳定版 Rust 工具链，不要在脚本中写死 `rustc` 或 `cargo` 的绝对路径。当前基准版本为 Rust 1.94.1，Rust 依赖由 `native/Cargo.toml` 和 `native/Cargo.lock` 管理。`native/` 当前实现的是 Windows WASAPI 音频引擎，Windows 构建目标为 `x86_64-pc-windows-msvc`。
- 平台工具链：Windows 构建 WASAPI 模块时，需要 Visual Studio Build Tools 的“使用 C++ 的桌面开发”工作负载和 Windows SDK；macOS 原生构建通常需要 Xcode Command Line Tools；Linux 应安装发行版对应的 C/C++ 编译工具和 Electron 打包所需系统库。
- 命令行：文档必须区分 Windows PowerShell 与 macOS/Linux POSIX shell 的命令，不得假设所有开发者都使用 PowerShell、盘符路径或反斜杠。执行构建前，应确保 `node`、`npm`、`python`（或 `python3`）、`rustc` 和 `cargo` 可从当前 shell 的 `PATH` 访问。

首次配置 Python 环境时，必须在仓库根目录执行对应平台的命令。

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

后续 Python 开发和打包命令必须从已激活 `.venv` 的同一终端运行。

检查 Rust 环境时，可执行：

```bash
rustup show active-toolchain
rustc --version
cargo --version
```

## 跨平台开发注意事项

- 音频后端：Rust `NativeAudio.node` 和 WASAPI shared/exclusive 模式仅适用于 Windows。macOS 和 Linux 应使用 Web Audio 回退路径；通用代码不得假设 `NativeAudio.node`、WASAPI 设备或独占模式一定存在。
- 开发启动：当前 `npm run dev` 会执行 `npm run build:rs`，而 `npm run dev:main` 包含 Windows 专用的 `chcp 65001`，因此这两个脚本目前是 Windows 导向的。macOS/Linux 在不构建 WASAPI 模块时，可依次执行 `npm run build:renderer`、`npm run build:ts` 和 `npx electron dist/main/main.js --expose-gc`。修改这些脚本时，应优先将平台差异放入 Node.js 脚本或使用显式的平台分支。
- 应用打包：分别在目标平台运行 `npm run build:win`、`npm run build:mac` 或 `npm run build:linux`；Windows 打包前还要运行 `npm run build:rs` 生成 WASAPI 模块。Python helper、原生模块、签名和安装包通常依赖宿主系统，不要默认可以从一个操作系统完整交叉构建所有目标。
- 打包资源：当前 `electron-builder.yml` 将 Windows 专用的 `NativeAudio.node` 配置在全局 `extraResources` 中。修改 macOS/Linux 发布流程时，必须先将其调整为 Windows 条件资源。x64 与 arm64 安装包必须包含各自架构的原生产物，禁止复用不匹配架构的 `.node` 文件。
- 路径处理：应用代码使用 `node:path` 的 `join`、`resolve` 等 API，避免手工拼接 `/`、`\` 或盘符。不要依赖 Windows 路径大小写不敏感的行为；新增文件和导入路径的大小写必须完全一致。
- 平台判断：需要平台差异时使用 `process.platform`、`os.platform()` 或 Rust 条件编译，并保留安全的非目标平台回退。不要在跨平台代码路径中直接调用 `chcp`、PowerShell、AppleScript 或某一 Linux 发行版专属命令。
- 文件与进程：不要假设可执行文件一定带 `.exe`，也不要假设 POSIX 可执行权限在 Windows 上存在。创建子进程时避免依赖某个 shell 的内建语法，并正确处理带空格、Unicode 字符和不同路径分隔符的路径。
- 文本与大小写：文本文件统一使用 UTF-8。注意 Windows 与 POSIX 的换行差异，以及 Linux 文件系统通常区分大小写；不要提交只改变整文件换行符的无关改动。
- 功能验证：共享功能至少应考虑 Windows、macOS 和 Linux 行为。WASAPI 相关改动必须在 Windows 验证；平台打包、Python helper 和文件系统相关改动应在受影响的平台验证，并在 PR 中记录未覆盖的平台。

## 构建、测试与开发命令

- `npm install && npm run install:renderer && npm run install:rs`：安装根目录、渲染进程和原生模块所需的 Node.js 依赖。
- `python -m pip install -r requirements.txt`：只在已激活的 `.venv` 虚拟环境中安装 `src/main/metadata_editor.py` 和 Python 打包工具所需的依赖。
- `npm run dev`：在 Windows 上依次构建渲染进程、Rust WASAPI 原生模块和主进程代码，然后启动 Electron；macOS/Linux 使用上文所列的替代启动流程。
- `npm run dev:renderer`：仅通过 Vite 启动渲染进程，适用于界面开发。
- `npm run build`：包含 Windows WASAPI 原生模块构建，当前更适合 Windows 完整构建。生成各平台安装包时使用对应的 `build:win`、`build:mac` 或 `build:linux` 命令。
- `npm run build:rs` 和 `npm run build:python`：分别仅重建 Rust 原生音频模块或 Python 辅助模块；运行 Python 构建前必须激活根目录的 `.venv`。
- `cd src/renderer && npm run lint`：检查渲染进程 JavaScript 代码和架构边界。
- `cd src/renderer && npm run typecheck`：检查渲染进程 TypeScript 类型。

## 编码风格与命名规范

遵循各模块已有的代码风格，不要格式化或改写与当前任务无关的文件。主进程 TypeScript 使用 4 个空格缩进和分号；类及文件名使用 `PascalCase`，例如 `AppController.ts`，方法名使用 `camelCase`。渲染进程组件同样使用 `PascalCase`，共享辅助函数使用 `camelCase`。保留 `@components`、`@services` 和 `@utils` 等现有导入别名。日志内容应简洁，并继续使用已有的 emoji 前缀约定。新增代码的注释使用中文，但不要修改已有的英文注释。

## 测试规范

目前仓库根目录没有统一的自动化测试套件。修改界面或播放功能后，应在 Windows 运行 `npm run dev`，或在 macOS/Linux 使用上文的 Web Audio 启动流程，并至少对音乐库扫描、播放、歌词、设置和插件加载进行冒烟测试。可复用的媒体测试文件应放入 `test-files/`。新增或修改渲染进程代码后，在提交 PR 前运行 `cd src/renderer && npm run lint` 和 `cd src/renderer && npm run typecheck`。无法通过自动化测试覆盖的功能，应记录手动验证步骤和未覆盖平台。

## 提交与 Pull Request 规范

近期提交记录使用 `feature:`、`refactor:` 和 `docs:` 等小写前缀。提交标题使用中文，应简短，并且一次提交只聚焦一项改动，不要把大幅重构合并到一次提交里。PR 应说明对用户可见的影响，列出已执行的命令或手动检查步骤，关联相关 issue；涉及渲染进程或桌面界面的改动时应附带截图。若改动涉及 `native/`、应用打包流程或 preload/API 边界，必须明确说明，因为这些内容会影响发布构建和安全审查。

## 安全与集成注意事项

不要让渲染进程绕过 preload 边界直接访问 Node.js API。涉及文件系统的功能应复用 `src/main/utils/pathSecurity.ts` 等已有主进程工具。Rust 原生模块和 Python 模块的改动应限制在各自的构建路径内。不要提交 `.venv/`、`node_modules/`、Rust `target/`、构建产物、用户级工具链或包含本机绝对路径的配置文件。
