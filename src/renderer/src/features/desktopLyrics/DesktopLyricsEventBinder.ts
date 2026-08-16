import type {DesktopLyricsPlaybackState} from '@api/types/playback';
import type {Track} from '@api/types/library';
import {desktopLyricsWindowService} from './service';
import type {DesktopLyricsLockController} from './DesktopLyricsLockController';
import type {DesktopAmllLyricsView} from './DesktopAmllLyricsView';
import type {DesktopLyricsSettingsController} from './DesktopLyricsSettingsController';
import type {DesktopLyricsElements, DesktopLyricsSettings} from './DesktopLyricsTypes';

interface DesktopLyricsEventBinderOptions {
    elements: DesktopLyricsElements;
    lockController: DesktopLyricsLockController;
    lyricsView: DesktopAmllLyricsView;
    settingsController: DesktopLyricsSettingsController;

    setPlaybackState(state: { isPlaying?: boolean; position?: number }): void;
}

export class DesktopLyricsEventBinder {
    constructor(private readonly options: DesktopLyricsEventBinderOptions) {
    }

    bind(): void {
        this.bindDomEvents();
        this.bindIpcEvents();
    }

    private bindDomEvents(): void {
        const {elements, lockController} = this.options;

        elements.lockBtn.addEventListener('click', () => {
            void lockController.toggle();
        });

        elements.closeBtn.addEventListener('click', () => {
            void desktopLyricsWindowService.close();
        });

        lockController.bindControlHover();
    }

    private bindIpcEvents(): void {
        const {lyricsView, settingsController, setPlaybackState} = this.options;

        desktopLyricsWindowService.onLyricsUpdated((lyricsData) => {
            lyricsView.updateLyrics(lyricsData);
        });

        desktopLyricsWindowService.onPositionChanged((position) => {
            const normalizedPosition = lyricsView.updatePosition(position);
            if (normalizedPosition !== null) {
                setPlaybackState({position: normalizedPosition});
            }
        });

        desktopLyricsWindowService.onPlaybackStateChanged((state: DesktopLyricsPlaybackState) => {
            const isPlaying = state?.isPlaying || false;
            lyricsView.setPlaying(isPlaying);
            setPlaybackState({isPlaying});
        });

        desktopLyricsWindowService.onTrackChanged((_track: Track | null) => {
            setPlaybackState({position: 0});
            lyricsView.reset();
        });

        desktopLyricsWindowService.onSettingsChanged((settings) => {
            void settingsController.updateSettings(settings as Partial<DesktopLyricsSettings>);
        });
    }
}
