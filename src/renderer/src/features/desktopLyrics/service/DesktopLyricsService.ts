import type {Result} from '@api/types/common';
import type {AmllLyricLine} from '@applemusic-like-lyrics/ttml';
import type {DesktopLyricsSettings, MusicBoxSettings} from '@api/types/settings';
import type {Track} from '@api/types/track';
import {DesktopLyricsSync} from './DesktopLyricsSync';
import type {DesktopLyricsToggleResult} from './DesktopLyricsWindowOperationsService';

export type DesktopLyricsPlaybackSnapshot = {
    currentTrack: Track | null;
    isPlaying: boolean;
    position: number;
};

interface DesktopLyricsServiceDependencies {
    getPlaybackSnapshot(): DesktopLyricsPlaybackSnapshot;
    getSettings(): MusicBoxSettings;
}

export class DesktopLyricsService {
    private readonly sync: DesktopLyricsSync;
    private dependencies: DesktopLyricsServiceDependencies;

    constructor() {
        this.dependencies = {
            getPlaybackSnapshot: () => ({
                currentTrack: null,
                isPlaying: false,
                position: 0
            }),
            getSettings: () => ({})
        };
        this.sync = new DesktopLyricsSync({
            getCurrentState: () => {
                const snapshot = this.dependencies.getPlaybackSnapshot();
                return {
                    currentTrack: snapshot.currentTrack,
                    isPlaying: snapshot.isPlaying,
                    position: snapshot.position
                };
            },
            getCurrentSettings: () => this.dependencies.getSettings()
        });
    }

    configure(dependencies: DesktopLyricsServiceDependencies): void {
        this.dependencies = dependencies;
    }

    async toggle(): Promise<DesktopLyricsToggleResult> {
        return await this.sync.toggleDesktopLyrics();
    }

    async isVisible(): Promise<boolean> {
        return await this.sync.isDesktopLyricsVisible();
    }

    async hide(): Promise<Result> {
        return await this.sync.hideDesktopLyrics();
    }

    async updateSettings(settings: DesktopLyricsSettings | MusicBoxSettings): Promise<Result> {
        return await this.sync.updateDesktopLyricsSettings(settings);
    }

    async syncLyrics(lyrics: AmllLyricLine[]): Promise<void> {
        await this.sync.syncToDesktopLyrics('lyrics', lyrics);
    }

    async syncTimelinePreview(deltaMs: number): Promise<void> {
        await this.sync.syncToDesktopLyrics('timelinePreview', deltaMs);
    }
}

export const desktopLyricsService = new DesktopLyricsService();
export type {DesktopLyricsToggleResult};
