import type {MusicBoxSettings} from "@api/types/settings";

export type LyricsFontFamily = 'inherit' | 'system' | 'cjk-sans' | 'serif' | 'monospace' | 'custom';

export interface LyricsAppearanceSettings {
    colorMode: 'auto' | 'custom';
    textColor: string;
    fontFamily: LyricsFontFamily;
    customLatinFont: string;
    customCjkFont: string;
    fontSize: number | null;
    showTranslation: boolean;
    showRomanization: boolean;
    showRuby: boolean;
}

export const LYRICS_DISPLAY_SETTINGS_CHANGED_EVENT = 'musicbox:lyrics-display-settings-changed';

const FONT_FAMILIES: Record<LyricsFontFamily, string | null> = {
    inherit: null,
    system: 'system-ui, sans-serif',
    'cjk-sans': '"Microsoft YaHei", "PingFang SC", "Yu Gothic UI", "Noto Sans CJK SC", sans-serif',
    serif: '"Noto Serif CJK SC", "Songti SC", SimSun, serif',
    monospace: 'Consolas, "SFMono-Regular", monospace',
    custom: '"MusicBox Lyrics Custom", system-ui, "Microsoft YaHei", "PingFang SC", "Yu Gothic UI", sans-serif'
};

const CUSTOM_FONT_STYLE_ID = 'musicbox-lyrics-custom-fonts';
const LATIN_UNICODE_RANGE = 'U+0000-024F, U+1E00-1EFF, U+FF61-FF65';
const CJK_UNICODE_RANGE = [
    'U+2E80-2FFF',
    'U+3000-303F',
    'U+3040-30FF',
    'U+3100-31FF',
    'U+3400-4DBF',
    'U+4E00-9FFF',
    'U+A960-A97F',
    'U+AC00-D7AF',
    'U+D7B0-D7FF',
    'U+F900-FAFF',
    'U+FF01-FF60',
    'U+FF66-FFEF',
    'U+20000-2FA1F'
].join(', ');

class LyricsAppearanceSettingsService {
    getSettings(settings: MusicBoxSettings): LyricsAppearanceSettings {
        return {
            colorMode: settings.lyricsColorMode === 'custom' ? 'custom' : 'auto',
            textColor: typeof settings.lyricsColor === 'string' ? settings.lyricsColor : '#335eea',
            fontFamily: isLyricsFontFamily(settings.lyricsFontFamily) ? settings.lyricsFontFamily : 'inherit',
            customLatinFont: normalizeFontName(settings.lyricsCustomLatinFont),
            customCjkFont: normalizeFontName(settings.lyricsCustomCjkFont),
            fontSize: typeof settings.lyricsFontSize === 'number' && settings.lyricsFontSize >= 20 && settings.lyricsFontSize <= 64
                ? settings.lyricsFontSize
                : null,
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

    applyTypography(settings: Pick<LyricsAppearanceSettings, 'fontFamily' | 'customLatinFont' | 'customCjkFont' | 'fontSize'>): void {
        this.applyCustomFontFaces(settings);
        const fontFamily = FONT_FAMILIES[settings.fontFamily];
        if (fontFamily) {
            document.documentElement.style.setProperty('--lyrics-font-family', fontFamily);
        } else {
            document.documentElement.style.removeProperty('--lyrics-font-family');
        }
        if (settings.fontSize === null) {
            document.documentElement.style.removeProperty('--amll-lp-font-size');
        } else {
            document.documentElement.style.setProperty('--amll-lp-font-size', `${settings.fontSize}px`);
        }
    }

    private applyCustomFontFaces(settings: Pick<LyricsAppearanceSettings, 'fontFamily' | 'customLatinFont' | 'customCjkFont'>): void {
        document.getElementById(CUSTOM_FONT_STYLE_ID)?.remove();
        if (settings.fontFamily !== 'custom') return;

        const latinFont = settings.customLatinFont || settings.customCjkFont;
        const cjkFont = settings.customCjkFont || settings.customLatinFont;
        if (!latinFont || !cjkFont) return;

        const style = document.createElement('style');
        style.id = CUSTOM_FONT_STYLE_ID;
        style.textContent = [
            createLocalFontFace(latinFont, LATIN_UNICODE_RANGE),
            createLocalFontFace(cjkFont, CJK_UNICODE_RANGE)
        ].join('\n');
        document.head.append(style);
    }

    notifyDisplaySettingsChanged(): void {
        window.dispatchEvent(new Event(LYRICS_DISPLAY_SETTINGS_CHANGED_EVENT));
    }
}

export const lyricsAppearanceSettingsService = new LyricsAppearanceSettingsService();

function isLyricsFontFamily(value: unknown): value is LyricsFontFamily {
    return typeof value === 'string' && value in FONT_FAMILIES;
}

function normalizeFontName(value: unknown): string {
    return typeof value === 'string' ? value.trim().slice(0, 100) : '';
}

function createLocalFontFace(fontName: string, unicodeRange: string): string {
    const escapedFontName = fontName.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/[\r\n\f]/g, ' ');
    return `@font-face { font-family: "MusicBox Lyrics Custom"; src: local("${escapedFontName}"); unicode-range: ${unicodeRange}; }`;
}
