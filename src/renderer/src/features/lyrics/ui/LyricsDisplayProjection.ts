import type {AmllLyricLine} from '@applemusic-like-lyrics/ttml';

export interface LyricsDisplayPreferences {
    showTranslation: boolean;
    showRomanization: boolean;
    showRuby: boolean;
}

export function projectLyricsForDisplay(
    lines: AmllLyricLine[],
    preferences: LyricsDisplayPreferences
): AmllLyricLine[] {
    if (preferences.showTranslation && preferences.showRomanization && preferences.showRuby) return lines;
    return lines.map(line => ({
        ...line,
        translatedLyric: preferences.showTranslation ? line.translatedLyric : '',
        romanLyric: preferences.showRomanization ? line.romanLyric : '',
        words: line.words.map(word => ({
            ...word,
            romanWord: preferences.showRomanization ? word.romanWord : undefined,
            ruby: preferences.showRuby ? word.ruby : undefined
        }))
    }));
}
