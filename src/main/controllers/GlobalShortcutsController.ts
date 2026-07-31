// 全局快捷键控制器

import {app, globalShortcut} from 'electron';
import {BaseController, Controller, IpcHandle} from '../decorators/IpcHandler';
import {WindowManager} from '../core/WindowManager';

interface ShortcutConfig {
    name: string;
    key: string;
    enabled: boolean;
}

type SystemMediaKeyAction = 'playPause' | 'previousTrack' | 'nextTrack';

const SYSTEM_MEDIA_KEYS: ReadonlyArray<{
    accelerator: string;
    action: SystemMediaKeyAction;
}> = [
    {accelerator: 'MediaPlayPause', action: 'playPause'},
    {accelerator: 'MediaPreviousTrack', action: 'previousTrack'},
    {accelerator: 'MediaNextTrack', action: 'nextTrack'}
];

function convertToElectronShortcut(key: string): string {
    return key
        .replace(/Ctrl/g, 'CommandOrControl')
        .replace(/Cmd/g, 'Command')
        .replace(/ArrowUp/g, 'Up')
        .replace(/ArrowDown/g, 'Down')
        .replace(/ArrowLeft/g, 'Left')
        .replace(/ArrowRight/g, 'Right')
        .replace(/Space/g, 'Space');
}

@Controller('globalShortcuts')
export class GlobalShortcutsController extends BaseController {
    private enabled = false;
    private registered = new Map<string, string>(); // id -> electronKey
    private systemMediaKeys = new Set<string>();
    private willQuitBound = false;

    constructor(private windowManager: WindowManager) {
        super();
    }

    override register(): void {
        super.register();
        if (!this.willQuitBound) {
            this.willQuitBound = true;
            app.on('will-quit', () => {
                this.unregisterConfiguredShortcuts();
                this.unregisterSystemMediaKeys();
            });
        }
    }

    private unregisterConfiguredShortcuts(quiet = false): void {
        if (!quiet) console.log('🎹 取消注册所有全局快捷键');
        this.registered.forEach((accelerator) => {
            globalShortcut.unregister(accelerator);
        });
        this.registered.clear();
    }

    private unregisterSystemMediaKeys(): void {
        this.systemMediaKeys.forEach((accelerator) => {
            globalShortcut.unregister(accelerator);
        });
        this.systemMediaKeys.clear();
    }

    @IpcHandle('globalShortcuts:register')
    registerShortcuts(shortcuts: Record<string, ShortcutConfig>): boolean {
        try {
            this.unregisterConfiguredShortcuts(true);
            if (!shortcuts || typeof shortcuts !== 'object') return false;

            for (const [id, shortcut] of Object.entries(shortcuts)) {
                if (!shortcut.enabled || !shortcut.key) continue;
                const electronKey = convertToElectronShortcut(shortcut.key);
                try {
                    const registered = globalShortcut.register(electronKey, () => {
                        console.log(`🎹 全局快捷键触发: ${shortcut.name} (${electronKey})`);
                        this.windowManager.sendToMainWindow('global-shortcut-triggered', id);
                    });
                    if (registered) this.registered.set(id, electronKey);
                    else console.warn(`⚠️ 快捷键注册失败: ${shortcut.name} (${electronKey})`);
                } catch (error) {
                    console.error(`❌ 注册快捷键失败: ${shortcut.name}`, error);
                }
            }
            return true;
        } catch (error) {
            console.error('❌ 注册全局快捷键失败:', error);
            return false;
        }
    }

    @IpcHandle('globalShortcuts:unregister')
    unregisterAll2(): boolean {
        try {
            this.unregisterConfiguredShortcuts();
            return true;
        } catch (error) {
            console.error('❌ 取消注册全局快捷键失败:', error);
            return false;
        }
    }

    @IpcHandle('globalShortcuts:setEnabled')
    setEnabled(enabled: boolean): boolean {
        try {
            this.enabled = enabled;
            if (!enabled) this.unregisterConfiguredShortcuts();
            return true;
        } catch (error) {
            console.error('❌ 设置全局快捷键状态失败:', error);
            return false;
        }
    }

    @IpcHandle('globalShortcuts:isEnabled')
    isEnabled(): boolean {
        return this.enabled;
    }

    @IpcHandle('systemMediaKeys:setEnabled')
    setSystemMediaKeysEnabled(enabled: boolean): boolean {
        this.unregisterSystemMediaKeys();
        if (!enabled || process.platform !== 'win32') {
            return !enabled;
        }

        let allRegistered = true;
        SYSTEM_MEDIA_KEYS.forEach(({accelerator, action}) => {
            try {
                const registered = globalShortcut.register(accelerator, () => {
                    this.windowManager.sendToMainWindow('system-media-key-triggered', action);
                });
                if (registered) {
                    this.systemMediaKeys.add(accelerator);
                    return;
                }

                allRegistered = false;
                console.warn(`⚠️ 系统媒体键注册失败: ${accelerator}`);
            } catch (error) {
                allRegistered = false;
                console.error(`❌ 系统媒体键注册异常: ${accelerator}`, error);
            }
        });

        return allRegistered;
    }
}
