# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Cross-Platform File Editing

Use paths appropriate to the current host platform. Do not hard-code Windows drive letters, user directories, path separators, executable suffixes, or case-insensitive path assumptions. In application code, use `node:path` helpers instead of manually concatenating paths. File and import name casing must match exactly so the code also works on case-sensitive Linux filesystems.

## Project Overview

MusicBox is a plugin-based local music player built with Electron. It supports multiple audio formats (flac, mp3, wav, ogg, m4a, aac, wma) and features a plugin system inspired by VSCode's extension architecture.

## Technology Stack

- **Main Process**: Electron (v41.2.1) with TypeScript, Node.js (>=24.15.0)
- **Renderer Process**: Vite + TypeScript/vanilla JS hybrid (migrating to TypeScript)
- **Native Audio**: Rust (v1.94.1) with WASAPI exclusive mode support, built via napi-rs
- **Python**: Used for metadata editing utilities (>=3.8), managed in the repository-root `.venv`, and compiled to `.exe` via PyInstaller
- **Styling**: SCSS

## Development Commands

Create and activate the Python virtual environment before installing other dependencies.

Windows PowerShell:

```powershell
python -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install --upgrade pip
python -m pip install -r requirements.txt
```

macOS/Linux:

```bash
python3 -m venv .venv
source .venv/bin/activate
python -m pip install --upgrade pip
python -m pip install -r requirements.txt
```

Keep `.venv` activated for all subsequent development and build commands.

```bash
# Install Node.js and Rust-related dependencies
npm install && npm run install:renderer && npm run install:rs

# Windows development (builds renderer + WASAPI native module + TypeScript)
npm run dev

# macOS/Linux development (uses the Web Audio fallback)
npm run build:renderer
npm run build:ts
npx electron dist/main/main.js --expose-gc

# Build renderer only (for UI iteration)
npm run dev:renderer    # Vite dev server on port 8080

# Build TypeScript (main process) only
npm run build:ts        # Compiles src/main/**/*.ts to dist/main/
npm run watch:ts        # Watch mode for TypeScript compilation

# Build Rust native module only
npm run build:rs

# Build Python metadata editor only
npm run build:python    # Compiles metadata_editor.py to .exe via PyInstaller

# Type-check renderer (separate from build)
npm run typecheck:renderer

# Full application build
npm run build

# Platform-specific builds (run on the corresponding host OS)
npm run build:rs        # Windows: build WASAPI native module first
npm run build:win       # Windows (NSIS + portable)
npm run build:mac       # macOS (DMG + ZIP)
npm run build:linux     # Linux (AppImage + deb + rpm)

# Lint renderer code
cd src/renderer && npm run lint

# Clean build artifacts
npm run clean
```

Note: `npm run dev` is NOT hot-reload -- it runs a full `build:renderer` + `build:rs` + `build:ts` before launching Electron. For fast UI iteration, use `dev:renderer` separately.

## Architecture

### Multi-Process Structure

```
Main Process (Node.js + TypeScript)   <-> IPC <->   Renderer Process (Chromium)
├── Application class (core/Application.ts)         ├── Vite + TS/JS hybrid
├── Controllers (IPC handlers via decorators)       ├── Plugin system (TypeScript)
├── Services (library, network, extensions)         ├── Feature modules
├── WindowManager & ConfigManager                   ├── UI layer (base/dialogs/modals/pages/widgets)
├── Native audio engine (Rust N-API)                ├── API layer (MusicBoxAPI)
├── Tray, HTTP server, global shortcuts             ├── Infrastructure & shared utilities
└── Python metadata editor (subprocess)             └── Desktop lyrics window (separate HTML entry)
```

### Main Process (`src/main/`)

**Architecture Pattern**: Controller-based with dependency injection

- **`main.ts`**: Entry point -- creates `Application` instance and manages app lifecycle
- **`core/Application.ts`**: Central orchestrator -- initializes services, registers controllers, manages startup. All 22 controllers are instantiated and registered in `registerStartupControllers()`.
- **`core/ServiceContainer.ts`**: Dependency injection container for services
- **`core/WindowManager.ts`**: Window creation and management (main window, mini mode, etc.)
- **`core/ConfigManager.ts`**: Configuration file management
- **`preload.ts`**: Preload script bridging main/renderer via contextBridge. Exposes namespaced APIs: audio, nativeAudio, library, settings, lyrics, covers, networkDrive, window, desktopLyrics, tray, globalShortcuts, extensions, userdata, memory, benchmark, httpServer, app, hardwareAcceleration, and file operations.
- **`controllers/`**: 22 IPC handler classes using `@IpcHandler` decorator pattern. Key controllers: AudioController, NativeAudioController, LibraryController, NetworkController, LyricsController, CoversController, DesktopLyricsController, WindowController, TrayController, HttpServerController, GlobalShortcutsController, ExtensionsController, SettingsController, HardwareAccelerationController, BenchmarkController, MemoryController, UserDataController, AppController, DialogController, FileController, SystemController.
- **`services/`**: Business logic
  - `library/`: LibraryCacheManager, MetadataHandler, AutoScanScheduler
  - `network/`: NetworkDriveManager, NetworkFileAdapter, DriveRegistry
  - `extensions/`: ExtensionInstaller
- **`decorators/IpcHandler.ts`**: Decorator for automatic IPC handler registration
- **`utils/`**: Utility functions (metadata parsing, path security, file search)
- **`types/`**: TypeScript type definitions

### Renderer Process (`src/renderer/src/`)

The renderer uses a **feature-based modular architecture** (recently refactored from a monolithic `app.js`). Layers:

- **`app/`**: Application bootstrap, composition root, lifecycle management, and app shell.
- **`core/`**: Core app entry point -- `app.ts` re-exports from `app/bootstrap/app.ts`.
- **`features/`**: Domain feature modules -- each is a self-contained vertical slice:
  - `playback/` -- Playback controls, progress, volume, mini mode
  - `audioDriver/` -- Audio engine driver (WASAPI/fallback)
  - `desktopLyrics/` -- Desktop lyrics window logic
  - `equalizer/` -- Graphic and parametric EQ controls
  - `library/` -- Music library browsing and management
  - `playlists/` -- Playlist management
  - `media/` -- Media file handling
  - `mediaAssets/` -- Cover art, embedded media
  - `networkDrive/` -- SMB/WebDAV network drive UI
  - `settings/` -- Application settings
  - `extensions/` -- Extension management UI
  - `events/` -- Application event system
  - `appShell/` -- App shell, window behavior
  - `userData/` -- User mood/diary data
- **`ui/`**: Presentation layer -- `base/`, `dialogs/`, `modals/`, `pages/`, `widgets/`
- **`api/`**: Renderer-side API layer. `MusicBoxAPI.ts` is the central orchestrator (~33KB) -- it bridges main process events to the app event system, manages playback state synchronization, and provides typed API access to all main process functionality.
- **`services/`**: Cross-feature shared services (audio, covers, lyrics, navigation, plugins, preferences, settings, update)
- **`shared/`**: Shared utilities -- caching, network helpers, types
- **`infrastructure/`**: Infrastructure layer (currently `electron/` for Electron-specific adapters)
- **`extensions/`**: Plugin system (TypeScript) -- core infrastructure, namespaced API, built-in plugins. API docs at `extensions/api/README.md`.
- **`utils/`**: General utilities (md5, URL validation, shortcuts)
- **`styles/`**: SCSS stylesheets (`main.scss`, `DesktopLyrics.scss`)
- Two HTML entry points: `index.html` (main app) and `DesktopLyrics.html` (separate window)

### Native Audio Module (`native/`)

- Rust-based audio engine: decoding (rodio/symphonia), WASAPI exclusive output, resampling (rubato), EQ (biquad)
- Built as `NativeAudio.node` N-API addon, loaded by main process
- Release profile: LTO enabled, opt-level=3, stripped

### Vite Configuration (`src/renderer/vite.config.js`)

- Root: `src/`, output: `public/`
- Target: Chrome 138
- Two HTML entry points: `index.html` and `DesktopLyrics.html`
- Manual chunks: vendor, extensions, components, shared-utils
- Path aliases: `@` -> `src/`, `@utils`, `@api`, `@ui`, `@extensions`, `@styles`, `@assets`

## Key Patterns

### IPC Communication Flow

To add main process functionality accessible from renderer:

1. **Create a Controller** in `src/main/controllers/` (or update existing one)
   ```typescript
   import { BaseController, IpcHandler } from '../decorators/IpcHandler';

   export class MyController extends BaseController {
       @IpcHandler('my-domain:action')
       async handleAction(event: any, arg: any) {
           // Implementation
           return result;
       }
   }
   ```

2. **Register Controller** in `Application.registerStartupControllers()` (`core/Application.ts`)

3. **Expose in preload.ts** via `contextBridge.exposeInMainWorld`

4. **Use from Renderer** via `window.electronAPI.*`
   ```javascript
   const result = await window.electronAPI.invoke('my-domain:action', arg);
   ```

Channel naming convention: `domain:action` (e.g., `audio:loadTrack`, `library:scan`)

### Renderer Feature Module Pattern

Each feature in `features/` follows a controller-based pattern where domain logic is split into focused controllers (e.g., playback feature has separate controllers for controls, progress, volume, mini mode, lyrics). Features register with the app's composition root in `app/`.

### Renderer API Layer Pattern

The `MusicBoxAPI` class in `api/MusicBoxAPI.ts` is the central renderer-side API orchestrator. It:
1. Bridges main process `EventEmitter` to the app event service
2. Exposes typed wrappers for all IPC channels
3. Synchronizes playback state between main and renderer
4. Manages playback queue, persistence, and desktop lyrics sync

### Plugin System

Located in `src/renderer/src/extensions/`:
- **Core** (`core/`): TypeScript -- lifecycle, events, DI, registry, activation, permissions, host management
- **API** (`api/`): Exposes namespaced API (player, library, ui, storage, settings, navigation, etc.). See `api/README.md` for API documentation.
- **Built-in plugins**: `builtin/` -- serve as reference implementations
- Each plugin needs: `manifest.json` + entry file exporting `activate(context)` / `deactivate()`
- Activation events: `onStartUp`, `onCommand:*`, `onView:*`, `*`

### Library Cache System

- **LibraryCacheManager** (`src/main/services/library/LibraryCacheManager.ts`): Central music library cache with incremental updates, file watching, and query interface
- **AutoScanScheduler** (`src/main/services/library/AutoScanScheduler.ts`): Automatic library scanning
- **MetadataHandler** (`src/main/services/library/MetadataHandler.ts`): Metadata parsing and editing (uses `music-metadata@11.12.3`)
- Library search uses Fuse.js for fuzzy matching

### Network Drive Support

- **NetworkDriveManager** (`src/main/services/network/NetworkDriveManager.ts`): Manages SMB (via `node-smb2`) and WebDAV (via `webdav`) connections
- **NetworkFileAdapter** (`src/main/services/network/NetworkFileAdapter.ts`): Unified interface for local and network files
- **DriveRegistry** (`src/main/services/network/DriveRegistry.ts`): Registry for mounted network drives
- Metadata parsing and audio playback work transparently with network files

### Build & Packaging

- **Electron Builder**: `electron-builder.yml` -- targets Windows (NSIS + portable), macOS (DMG + ZIP), Linux (AppImage + deb + rpm), all with x64 + arm64
- `NativeAudio.node` and `metadata_editor.exe` are unpacked from ASAR and placed in extraResources
- **Python module**: Built via `scripts/build-python-module.js` using PyInstaller (fallback to Nuitka)
- **Rust module**: Built via napi-rs with `cargo-cp-artifact`, outputs to `dist/main/NativeAudio.node`
- **TypeScript**: Main process compiled to `dist/main/` via `tsc -p src/main/tsconfig.json` (target ES2022, CommonJS)
- **Benchmark infrastructure**: `scripts/benchmarks/` contains benchmark scripts for performance testing

### CI/CD (GitHub Actions)

- **`.github/workflows/deploy-docs.yml`**: Deploys docs to GitHub Pages on pushes to `dev` touching `docs/**`
- **`.github/workflows/release.yml`**: Manual workflow dispatch for building and releasing the application across platforms

## Development Notes

### TypeScript Configs
- **Main process** (`src/main/tsconfig.json`): Target ES2022, module CommonJS, strict mode, experimental decorators enabled
- **Renderer** (`src/renderer/tsconfig.json`): Target ES2022, module ESNext, strict mode, path aliases configured

### Python Metadata Editor
- Source: `src/main/metadata_editor.py`
- Dependencies: mutagen (defined in `requirements.txt`)
- Environment: repository-root `.venv`; never install project dependencies with the system-level `pip`
- Build process automatically tries PyInstaller first, falls back to Nuitka

### Native Audio Module
- Built with Rust 1.94.1 (specific version required)
- Uses WASAPI for Windows exclusive audio mode
- Release build uses LTO and opt-level=3 for performance

### Development Workflow
- Main process changes: Run `npm run build:ts` (or `npm run watch:ts`), then restart with the platform-appropriate development flow
- Renderer UI changes: Use `npm run dev:renderer` for faster iteration (Vite HMR)
- Rust changes: Run `npm run build:rs` then restart main process
- Python changes: Activate the repository-root `.venv`, run `npm run build:python`, then restart the main process

## Code Style Notes

- **TypeScript**: Main process uses TypeScript with strict mode, 4-space indentation, semicolons; renderer is hybrid TS/JS (migrating toward full TypeScript)
- **JavaScript**: ES6+ with `async/await` for async operations
- **Naming**: `PascalCase` for classes (e.g., `AppController.ts`), `camelCase` for methods and helpers
- **Resource cleanup**: Disposable pattern in extension system
- **Log outputs**: Must start with relevant emoji icons for quick identification (project convention)
  - 🔧 Configuration/setup, ✅ Success, ❌ Errors, 🔄 Loading/processing, 🎵 Audio, 📦 Build/packaging, ⚠️ Warnings
- **IPC naming**: Use `domain:action` pattern (e.g., `audio:init`, `library:scan`)
- **File organization**: Controllers in `src/main/controllers/`, services in `src/main/services/`, features in `src/renderer/src/features/`
- **Decorators**: Use `@IpcHandler('channel:name')` for IPC handler methods in controllers
- **Windows**: `npm run dev:main` uses `chcp 65001` to set UTF-8 console encoding (required for proper emoji/log output on Windows)
- **macOS/Linux**: Do not use `npm run dev` or `npm run dev:main` until their Windows-only WASAPI and `chcp` steps are made conditional; build renderer/main and launch Electron directly as shown above
- **Packaging**: Run `build:win`, `build:mac`, and `build:linux` on their corresponding host operating systems; build `NativeAudio.node` before Windows packaging, and do not assume native helpers, signing, or system packaging tools can be fully cross-compiled
- **Packaging resources**: `electron-builder.yml` currently lists the Windows-only `NativeAudio.node` in global `extraResources`; make it Windows-conditional before macOS/Linux releases, and build native artifacts separately for x64 and arm64

## Testing

No automated test framework is configured. Use `npm run dev` on Windows or the documented Web Audio startup flow on macOS/Linux, then smoke-test manually:
- Library scan and browse
- Audio playback (local and network files)
- Lyrics display (synced and desktop lyrics)
- Settings changes and persistence
- Plugin loading and activation

Put reusable media fixtures in `test-files/`. Run `cd src/renderer && npm run lint` before opening a PR (this also runs an architecture-boundary check via `check:architecture`).

## Commit & PR Conventions

- Commit prefixes: `feature:`, `fix:`, `refactor:`, `docs:` (lowercase)
- Commit subjects: short, imperative mood, scoped to one change
- PRs must: explain user-visible impact, list manual checks performed, link related issues, include screenshots for UI changes
- Call out changes in `native/`, packaging, or preload/API boundaries explicitly (they affect release builds and security review)

## Security

- **Never bypass the preload boundary** -- no direct renderer access to Node.js APIs. All main-process access goes through `contextBridge` via `preload.ts`.
- Reuse existing utilities like `src/main/utils/pathSecurity.ts` for filesystem-facing work.
- Keep native (Rust) and Python changes isolated to their build paths.
