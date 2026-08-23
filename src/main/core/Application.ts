/**
 * 应用主类
 * 负责应用的初始化、启动和生命周期管理
 */

import {app} from 'electron';
import * as fs from 'fs';
import {ServiceContainer} from './ServiceContainer';
import {WindowManager} from './WindowManager';
import {ConfigManager} from './ConfigManager';
import {BaseController} from '../decorators/IpcHandler';
import {registerAudioStreamProtocol} from '../services/audio/AudioStreamProtocol';
import {LyricsPersistenceService} from '../services/lyrics/LyricsPersistenceService';

interface LibraryScanner {
    migratePlaylistCovers(): Promise<void>;
    scanDirectories(directoryPaths: string[]): Promise<{scannedFolderCount: number; failedFolders: string[]}>;
    scanAllLibrarySources(): Promise<{failedSources: string[]}>;
}

interface MusicFolderSettingsProvider {
    getMusicFolders(): Promise<string[]>;
    getAutoScanSettings(): Promise<{
        musicFolders: string[];
        sourceCount?: number;
        autoScanEnabled: boolean;
        scanFrequency: string;
        lastScanTime: number;
    }>;
}

/**
 * 性能计时器
 */
class PerformanceTimer {
    private marks = new Map<string, number>();

    mark(name: string): void {
        this.marks.set(name, Date.now());
    }

    measure(name: string, startMark: string): number {
        const start = this.marks.get(startMark);
        if (!start) return 0;
        const duration = Date.now() - start;
        console.log(`⏱️ ${name}: ${duration}ms`);
        return duration;
    }

    getStats(): Record<string, number> {
        const stats: Record<string, number> = {};
        const entries = Array.from(this.marks.entries());
        for (let i = 1; i < entries.length; i++) {
            const [name, time] = entries[i];
            const [prevName, prevTime] = entries[i - 1];
            stats[`${prevName}->${name}`] = time - prevTime;
        }
        return stats;
    }
}

/**
 * 应用类
 */
export class Application {
    private container: ServiceContainer;
    private windowManager: WindowManager;
    private configManager: ConfigManager;
    private controllers: BaseController[] = [];
    private libraryScanner: LibraryScanner | null = null;
    private musicFolderSettingsProvider: MusicFolderSettingsProvider | null = null;
    private embeddedCoverService: {destroy(): Promise<void>} | null = null;
    private isInitialized = false;
    private isConfigured = false;
    private perfTimer = new PerformanceTimer();

    constructor() {
        this.container = new ServiceContainer();
        this.configManager = new ConfigManager();
        this.windowManager = new WindowManager();
        this.applyConfiguration();
    }

    /**
     * 启动应用
     */
    async start(): Promise<void> {
        if (this.isInitialized) {
            console.warn('⚠️ 应用已经初始化');
            return;
        }

        this.perfTimer.mark('start');
        console.log('🚀 应用启动中...');

        try {
            // 1. 应用配置
            this.applyConfiguration();
            this.perfTimer.mark('config');

            // 2. 初始化核心服务
            // 仅注册，不实例化
            await this.initializeCoreServices();
            this.perfTimer.mark('services');

            // 3. 注册启动 IPC 控制器
            // 渲染进程加载后会立即调用 preload 暴露的多个 IPC，因此 handler 必须先于窗口创建完成。
            await this.registerStartupControllers();
            this.perfTimer.mark('startup-controllers');

            // 4. 创建主窗口
            // 优先显示界面
            await this.windowManager.createMainWindow();
            this.perfTimer.mark('window');

            this.isInitialized = true;

            const windowTime = this.perfTimer.measure('窗口显示总耗时', 'start');
            console.log('✅ 应用窗口已显示');
            console.log(`📊 启动性能: ${windowTime}ms`);

            if (!this.isBenchmarkMode()) {
                // 5. 后台初始化重型服务
                this.initializeHeavyServices()
                    .then(() => this.startAutoScanner())
                    .catch(e => console.error('❌ 后台服务初始化失败:', e));
            }

            this.runBenchmarkScriptIfRequested().catch(e => console.error('❌ Benchmark脚本执行失败:', e));
        } catch (error) {
            console.error('❌ 应用启动失败:', error);
            throw error;
        }
    }

    private isBenchmarkMode(): boolean {
        return Boolean(
            process.env.MUSICBOX_BENCHMARK_SCRIPT ||
            process.argv.some(arg => arg.startsWith('--benchmark-script='))
        );
    }

    private async runBenchmarkScriptIfRequested(): Promise<void> {
        const scriptArg = process.argv.find(arg => arg.startsWith('--benchmark-script='));
        const scriptPath = scriptArg ? scriptArg.slice('--benchmark-script='.length) : process.env.MUSICBOX_BENCHMARK_SCRIPT;
        if (!scriptPath) return;

        const win = this.windowManager.getMainWindow();
        if (!win || win.isDestroyed()) {
            throw new Error('主窗口不可用，无法执行benchmark脚本');
        }

        const script = await fs.promises.readFile(scriptPath, 'utf8');
        await win.webContents.executeJavaScript('new Promise(resolve => setTimeout(resolve, 1000))');
        const result = await win.webContents.executeJavaScript(script, true);
        console.log(`__MUSICBOX_BENCHMARK_RESULT__${JSON.stringify(result)}`);
    }

    private async startAutoScanner(): Promise<void> {
        try {
            const scheduler = await this.container.get<any>('autoScanScheduler');
            const settingsLoader = async () => {
                const settings = await this.musicFolderSettingsProvider?.getAutoScanSettings() || {
                    musicFolders: [],
                    autoScanEnabled: false,
                    scanFrequency: 'on_startup',
                    lastScanTime: 0
                };
                const sourceManager = await this.container.get<any>('librarySourceManager');
                return {
                    ...settings,
                    sourceCount: sourceManager.getSources().length
                };
            };

            const scanHandler = async () => {
                if (!this.libraryScanner) {
                    throw new Error('音乐库扫描器尚未初始化');
                }
                const result = await this.libraryScanner.scanAllLibrarySources();
                if (result.failedSources.length > 0) {
                    throw new Error(`扫描失败: ${result.failedSources.join(', ')}`);
                }
            };

            scheduler.initialize(scanHandler, settingsLoader);
            await scheduler.start();
        } catch (error) {
            console.warn('⚠️ 自动扫描调度器启动失败:', error);
        }
    }

    /**
     * 应用配置
     */
    private applyConfiguration(): void {
        if (this.isConfigured) {
            return;
        }

        console.log('🔧 应用配置...');

        // 硬件加速设置
        const hardwareAcceleration = this.configManager.loadHardwareAccelerationSettings();
        if (!hardwareAcceleration) {
            console.log('🔧 禁用硬件加速');
            if (app.isReady()) {
                console.warn('⚠️ 硬件加速只能在 app ready 前禁用，本次启动已跳过');
            } else {
                app.disableHardwareAcceleration();
            }
        } else {
            console.log('✅ 硬件加速已启用');
        }

        // GC 标志
        app.commandLine.appendSwitch('js-flags', '--expose-gc');
        this.isConfigured = true;
    }

    /**
     * 初始化核心服务（仅注册，不实例化）
     */
    private async initializeCoreServices(): Promise<void> {
        console.log('📦 注册核心服务...');

        // 注册核心服务
        // 立即注册
        this.container.register('windowManager', () => this.windowManager);
        this.container.register('configManager', () => this.configManager);

        // 注册网络服务
        // 延迟实例化
        const {initializeGlobalDriveRegistry} = await import('../services/network/DriveRegistry');
        this.container.register('driveRegistry', async () => {
            return initializeGlobalDriveRegistry();
        });

        const {NetworkDriveManager} = await import('../services/network/NetworkDriveManager');
        this.container.register('networkDriveManager', async () => {
            const manager = new NetworkDriveManager();
            await manager.initialize();
            return manager;
        });

        const {NetworkFileAdapter} = await import('../services/network/NetworkFileAdapter');
        this.container.register('networkFileAdapter', async () => {
            const manager = await this.container.get<InstanceType<typeof NetworkDriveManager>>('networkDriveManager');
            return new NetworkFileAdapter(manager);
        });

        // 注册音乐库服务
        // 延迟加载缓存
        const {LibraryCacheManager} = await import('../services/library/LibraryCacheManager');
        this.container.register('libraryCacheManager', async () => {
            const adapter = await this.container.get<InstanceType<typeof NetworkFileAdapter>>('networkFileAdapter');
            const manager = new LibraryCacheManager(adapter);
            // 持久化状态必须先于窗口和 IPC 可用，避免空内存缓存覆盖已有歌单。
            await manager.loadCache();
            return manager;
        });

        const {LibrarySourceManager} = await import('../services/library/LibrarySourceManager');
        this.container.register('librarySourceManager', () => new LibrarySourceManager());

        // 注册元数据处理器（按需初始化）
        const {MetadataHandler} = await import('../services/library/MetadataHandler');
        this.container.register('metadataHandler', async () => {
            const handler = new MetadataHandler();

            // 不在这里初始化 Python 进程，首次使用时再初始化，因此注释
            // await handler.initialize();

            return handler;
        });

        const {AutoScanScheduler} = await import('../services/library/AutoScanScheduler');
        this.container.register('autoScanScheduler', () => new AutoScanScheduler());

        const {ExtensionInstaller} = await import('../services/extensions/ExtensionInstaller');
        this.container.register('extensionInstaller', () => new ExtensionInstaller());

        const {ExtensionStorageService} = await import('../services/extensions/ExtensionStorageService');
        this.container.register('extensionStorageService', () => new ExtensionStorageService());

        console.log(`✅ 核心服务注册完成 (${this.container.getStats().registered} 个)`);
    }

    /**
     * 后台初始化重型服务
     */
    private async initializeHeavyServices(): Promise<void> {
        console.log('🔄 加载音乐库缓存...');
        try {
            // 缓存已在启动控制器注册前加载，这里只初始化其余重服务。
            const libraryCacheManager = await this.container.get<any>('libraryCacheManager');
            await this.libraryScanner?.migratePlaylistCovers();
            const librarySourceManager = await this.container.get<any>('librarySourceManager');
            const musicFolders = await this.musicFolderSettingsProvider?.getMusicFolders() || [];
            const sourceLoadResult = await librarySourceManager.loadAndMigrate({
                musicFolders,
                scannedDirectories: libraryCacheManager.getScannedDirectories(),
                tracks: libraryCacheManager.getAllTracks()
            });
            if (sourceLoadResult.migrated || libraryCacheManager.needsPlaylistMembershipMigration()) {
                await libraryCacheManager.saveCache();
            }
            console.log('✅ 音乐库缓存加载完成');

            this.windowManager.sendToMainWindow('library:updated', libraryCacheManager.getAllTracks());
        } catch (error) {
            console.error('❌ 重型服务初始化失败:', error);
        }
    }

    /**
     * 注册启动 IPC 控制器（窗口创建前必需）
     */
    private async registerStartupControllers(): Promise<void> {
        const startTime = Date.now();
        console.log('🎮 注册启动 IPC 控制器...');

        const [
            {WindowController},
            {AppController},
            {DialogController},
            {AudioController},
            {NativeAudioController},
            {FileController},
            {BenchmarkController},
            {DesktopLyricsController},
            {NetworkController},
            {LibraryController},
            {SystemController},
            {SettingsController},
            {MemoryController},
            {UserDataController},
            {HardwareAccelerationController},
            {GlobalShortcutsController},
            {ExtensionsController},
            {CoversController},
            {EqualizerPresetController},
            {LyricsController},
            {TrayController},
            {HttpServerController},
            {EmbeddedCoverService},
            {PlaylistCoverStorage},
            {parseMetadata}
        ] = await Promise.all([
            import('../controllers/WindowController'),
            import('../controllers/AppController'),
            import('../controllers/DialogController'),
            import('../controllers/AudioController'),
            import('../controllers/NativeAudioController'),
            import('../controllers/FileController'),
            import('../controllers/BenchmarkController'),
            import('../controllers/DesktopLyricsController'),
            import('../controllers/NetworkController'),
            import('../controllers/LibraryController'),
            import('../controllers/SystemController'),
            import('../controllers/SettingsController'),
            import('../controllers/MemoryController'),
            import('../controllers/UserDataController'),
            import('../controllers/HardwareAccelerationController'),
            import('../controllers/GlobalShortcutsController'),
            import('../controllers/ExtensionsController'),
            import('../controllers/CoversController'),
            import('../controllers/EqualizerPresetController'),
            import('../controllers/LyricsController'),
            import('../controllers/TrayController'),
            import('../controllers/HttpServerController'),
            import('../services/library/EmbeddedCoverService'),
            import('../services/library/PlaylistCoverStorage'),
            import('../utils/metadata')
        ]);

        const networkDriveManager = await this.container.get<any>('networkDriveManager');
        const networkFileAdapter = await this.container.get<any>('networkFileAdapter');
        const libraryCacheManager = await this.container.get<any>('libraryCacheManager');
        const librarySourceManager = await this.container.get<any>('librarySourceManager');
        const metadataHandler = await this.container.get<any>('metadataHandler');
        const extensionInstaller = await this.container.get<any>('extensionInstaller');
        const extensionStorageService = await this.container.get<any>('extensionStorageService');
        registerAudioStreamProtocol(networkFileAdapter);

        const boundParseMetadata = (filePath: string) =>
            parseMetadata(filePath, networkFileAdapter.isNetworkPath(filePath) ? networkFileAdapter : null, {skipCover: true});

        // 尝试加载原生音频模块
        let nativeAudioModule: any = null;
        try {
            nativeAudioModule = require('../NativeAudio.node');
        } catch {
            console.warn('⚠️ 原生音频模块未找到，NativeAudio功能不可用');
        }

        const audioController = new AudioController(boundParseMetadata);
        const embeddedCoverService = new EmbeddedCoverService();
        const playlistCoverStorage = new PlaylistCoverStorage();
        this.embeddedCoverService = embeddedCoverService;
        const trayController = new TrayController(this.windowManager);
        this.windowManager.setTraySettingsGetter(() => trayController.getSettings());
        const settingsController = new SettingsController();
        const libraryController = new LibraryController(
            libraryCacheManager, metadataHandler, networkDriveManager,
            networkFileAdapter, this.windowManager, embeddedCoverService,
            playlistCoverStorage,
            parseMetadata, () => settingsController.getMusicFolders(),
            librarySourceManager,
            (folderPath: string) => settingsController.removeMusicFolder(folderPath),
            () => settingsController.isAutoPlaylistCoverEnabled(),
            audioController.state
        );
        this.libraryScanner = libraryController;
        this.musicFolderSettingsProvider = settingsController;

        const startupControllers = [
            new WindowController(this.windowManager),
            new AppController(this.windowManager),
            new DialogController(this.windowManager),
            audioController,
            new NativeAudioController(nativeAudioModule, this.windowManager, networkFileAdapter),
            new FileController(networkFileAdapter),
            new BenchmarkController(),
            new DesktopLyricsController(this.windowManager),
            new NetworkController(networkDriveManager, networkFileAdapter, this.windowManager),
            libraryController,
            new SystemController(),
            settingsController,
            new MemoryController(),
            new UserDataController(),
            new HardwareAccelerationController(),
            new GlobalShortcutsController(this.windowManager),
            new ExtensionsController(extensionInstaller, extensionStorageService, this.windowManager),
            new CoversController(),
            new EqualizerPresetController(this.windowManager),
            new LyricsController(
                networkFileAdapter,
                new LyricsPersistenceService(app.getPath('userData')),
                this.windowManager
            ),
            trayController,
            new HttpServerController()
        ];

        for (const controller of startupControllers) {
            controller.register();
            this.controllers.push(controller);
        }

        const duration = Date.now() - startTime;
        console.log(`✅ 启动 IPC 控制器注册完成 (${startupControllers.length} 个, ${duration}ms)`);
    }

    /**
     * 停止应用
     */
    async stop(): Promise<void> {
        console.log('🛑 应用关闭中...');

        try {
            // 停止自动扫描
            if (this.container.isInstantiated('autoScanScheduler')) {
                const scheduler = this.container.getSync<any>('autoScanScheduler');
                scheduler.stop();
            }

            // 保存缓存
            if (this.container.isInstantiated('libraryCacheManager')) {
                await this.container.getSync<any>('libraryCacheManager').saveCache();
            }

            // 清理网络磁盘
            if (this.container.isInstantiated('networkDriveManager')) {
                this.container.getSync<any>('networkDriveManager').cleanup();
            }

            // 注销所有控制器
            for (const controller of this.controllers) {
                controller.unregister();
            }

            if (this.embeddedCoverService) {
                await this.embeddedCoverService.destroy();
                this.embeddedCoverService = null;
            }

            // 关闭所有窗口
            this.windowManager.closeAllWindows();

            console.log('✅ 应用已关闭');
        } catch (error) {
            console.error('❌ 应用关闭失败:', error);
        }
    }

    /**
     * 创建主窗口
     */
    async createMainWindow(): Promise<void> {
        await this.windowManager.createMainWindow();
    }
}
