import type {MusicBoxSettings} from "@api/types/settings";

export interface LyricsAppearanceSettings {
    colorMode: 'auto' | 'custom';
    textColor: string;
}

class LyricsAppearanceSettingsService {
    getSettings(settings: MusicBoxSettings): LyricsAppearanceSettings {
        return {
            colorMode: settings.lyricsColorMode === 'custom' ? 'custom' : 'auto',
            textColor: typeof settings.lyricsTextColor === 'string'
                ? settings.lyricsTextColor
                : typeof settings.lyricsHighlightColor === 'string'
                    ? settings.lyricsHighlightColor
                : '#335eea'
        };
    }

    applyTextColor(settings: LyricsAppearanceSettings): void {
        if (settings.colorMode === 'custom') {
            document.documentElement.style.setProperty('--lyrics-text-color', settings.textColor);
        } else {
            document.documentElement.style.removeProperty('--lyrics-text-color');
        }
    }
}

export const lyricsAppearanceSettingsService = new LyricsAppearanceSettingsService();
