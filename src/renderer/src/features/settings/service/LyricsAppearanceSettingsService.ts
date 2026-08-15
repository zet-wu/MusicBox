import type {MusicBoxSettings} from "@api/types/settings";

export interface LyricsAppearanceSettings {
    colorMode: 'auto' | 'custom';
    textColor: string;
    showTranslation: boolean;
    showRomanization: boolean;
    showRuby: boolean;
}

export const LYRICS_DISPLAY_SETTINGS_CHANGED_EVENT = 'musicbox:lyrics-display-settings-changed';

class LyricsAppearanceSettingsService {
    getSettings(settings: MusicBoxSettings): LyricsAppearanceSettings {
        return {
            colorMode: settings.lyricsColorMode === 'custom' ? 'custom' : 'auto',
            textColor: typeof settings.lyricsTextColor === 'string'
                ? settings.lyricsTextColor
                : typeof settings.lyricsSungColor === 'string'
                    ? settings.lyricsSungColor
                    : typeof settings.lyricsHighlightColor === 'string'
                        ? settings.lyricsHighlightColor
                        : '#335eea',
            showTranslation: settings.lyricsShowTranslation !== false,
            showRomanization: settings.lyricsShowRomanization !== false,
            showRuby: settings.lyricsShowRuby !== false
        };
    }

    applyTextColor(settings: Pick<LyricsAppearanceSettings, 'colorMode' | 'textColor'>): void {
        if (settings.colorMode === 'custom') {
            document.documentElement.style.setProperty('--lyrics-text-color', settings.textColor);
        } else {
            document.documentElement.style.removeProperty('--lyrics-text-color');
        }
    }

    notifyDisplaySettingsChanged(): void {
        window.dispatchEvent(new Event(LYRICS_DISPLAY_SETTINGS_CHANGED_EVENT));
    }
}

export const lyricsAppearanceSettingsService = new LyricsAppearanceSettingsService();
