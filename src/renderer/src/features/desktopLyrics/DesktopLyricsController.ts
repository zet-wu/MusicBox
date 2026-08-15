import type {Result} from '@api/types/common';
import type {AmllLyricLine} from '@applemusic-like-lyrics/ttml';
import type {DesktopLyricsSettings, MusicBoxSettings} from '@api/types/settings';
import {desktopLyricsService} from './service';
import type {DesktopLyricsToggleResult} from './service';

class DesktopLyricsController {
    configure(...args: Parameters<typeof desktopLyricsService.configure>): void {
        desktopLyricsService.configure(...args);
    }

    async toggle(): Promise<DesktopLyricsToggleResult> {
        return await desktopLyricsService.toggle();
    }

    async isVisible(): Promise<boolean> {
        return await desktopLyricsService.isVisible();
    }

    async hide(): Promise<Result> {
        return await desktopLyricsService.hide();
    }

    async updateSettings(settings: DesktopLyricsSettings | MusicBoxSettings): Promise<Result> {
        return await desktopLyricsService.updateSettings(settings);
    }

    async syncLyrics(lyrics: AmllLyricLine[]): Promise<void> {
        await desktopLyricsService.syncLyrics(lyrics);
    }
}

export const desktopLyricsController = new DesktopLyricsController();
export {DesktopLyricsController};
export type {DesktopLyricsToggleResult};
