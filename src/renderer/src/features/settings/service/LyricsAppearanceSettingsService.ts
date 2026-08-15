import type {MusicBoxSettings} from "@api/types/settings";

export interface LyricsAppearanceSettings {
    colorMode: 'auto' | 'custom';
    sungColor: string;
    unsungColor: string;
    showTranslation: boolean;
    showRomanization: boolean;
    showRuby: boolean;
}

export const LYRICS_DISPLAY_SETTINGS_CHANGED_EVENT = 'musicbox:lyrics-display-settings-changed';

class LyricsAppearanceSettingsService {
    getSettings(settings: MusicBoxSettings): LyricsAppearanceSettings {
        return {
            colorMode: settings.lyricsColorMode === 'custom' ? 'custom' : 'auto',
            sungColor: typeof settings.lyricsSungColor === 'string'
                ? settings.lyricsSungColor
                : typeof settings.lyricsTextColor === 'string'
                    ? settings.lyricsTextColor
                    : typeof settings.lyricsHighlightColor === 'string'
                        ? settings.lyricsHighlightColor
                        : '#335eea',
            unsungColor: typeof settings.lyricsUnsungColor === 'string'
                ? settings.lyricsUnsungColor
                : '#6b7280',
            showTranslation: settings.lyricsShowTranslation !== false,
            showRomanization: settings.lyricsShowRomanization !== false,
            showRuby: settings.lyricsShowRuby !== false
        };
    }

    applyTextColor(settings: Pick<LyricsAppearanceSettings, 'colorMode' | 'sungColor' | 'unsungColor'>): void {
        if (settings.colorMode === 'custom') {
            document.documentElement.style.setProperty('--lyrics-sung-color', settings.sungColor);
            document.documentElement.style.setProperty('--lyrics-unsung-color', settings.unsungColor);
        } else {
            document.documentElement.style.removeProperty('--lyrics-sung-color');
            document.documentElement.style.removeProperty('--lyrics-unsung-color');
        }
    }

    notifyDisplaySettingsChanged(): void {
        window.dispatchEvent(new Event(LYRICS_DISPLAY_SETTINGS_CHANGED_EVENT));
    }
}

export const lyricsAppearanceSettingsService = new LyricsAppearanceSettingsService();
