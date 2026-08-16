import type {DesktopLyricLine} from './DesktopLyricsTypes';

export function projectLyricsForDesktop(lines: DesktopLyricLine[]): DesktopLyricLine[] {
    return lines
        .filter(line => !line.isBG)
        .map(line => ({
            ...line,
            isDuet: false,
            translatedLyric: '',
            romanLyric: '',
            words: line.words.map(word => {
                const projected = {...word};
                delete projected.romanWord;
                projected.ruby = word.ruby?.map(ruby => ({...ruby}));
                return projected;
            })
        }));
}
