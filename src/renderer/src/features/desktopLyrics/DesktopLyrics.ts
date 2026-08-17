import {resolveDesktopLyricsElements} from './DesktopLyricsElements';
import {DesktopLyricsEventBinder} from './DesktopLyricsEventBinder';
import {DesktopLyricsLockController} from './DesktopLyricsLockController';
import {DesktopAmllLyricsView} from './DesktopAmllLyricsView';
import {DesktopLyricsSettingsController} from './DesktopLyricsSettingsController';
import type {DesktopLyricsElements} from './DesktopLyricsTypes';

class DesktopLyrics {
    private readonly elements: DesktopLyricsElements;
    private readonly lockController: DesktopLyricsLockController;
    private readonly lyricsView: DesktopAmllLyricsView;
    private readonly settingsController: DesktopLyricsSettingsController;
    private readonly eventBinder: DesktopLyricsEventBinder;
    isPlaying: boolean;
    currentPosition: number;

    constructor() {
        this.elements = resolveDesktopLyricsElements();
        this.lockController = new DesktopLyricsLockController(this.elements);
        this.lyricsView = new DesktopAmllLyricsView({container: this.elements.lyricsMount});
        this.settingsController = new DesktopLyricsSettingsController(this.elements, this.lockController);
        this.eventBinder = new DesktopLyricsEventBinder({
            elements: this.elements,
            lockController: this.lockController,
            lyricsView: this.lyricsView,
            settingsController: this.settingsController,
            setPlaybackState: (state) => {
                if (typeof state.isPlaying === 'boolean') {
                    this.isPlaying = state.isPlaying;
                }
                if (typeof state.position === 'number') {
                    this.currentPosition = state.position;
                }
            }
        });
        this.isPlaying = false;
        this.currentPosition = 0;

        this.init();
        window.addEventListener('beforeunload', () => this.destroy(), {once: true});
    }

    init(): void {
        this.eventBinder.bind();
        this.settingsController.loadSettings();
        void this.settingsController.applySettings();
    }

    destroy(): void {
        this.eventBinder.destroy();
        this.lyricsView.destroy();
    }
}

document.addEventListener('DOMContentLoaded', () => {
    new DesktopLyrics();
});
