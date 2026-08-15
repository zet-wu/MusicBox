import {parseLrc, parseQrc, type LyricLine as ParsedLyricLine} from '@applemusic-like-lyrics/lyric';
import type {LyricLine, SubLyricContent, TTMLResult} from '@applemusic-like-lyrics/ttml';

export type CompanionKind = 'translation' | 'romanization';

export class CompanionLyricsMerger {
    // 网易 YRC 与辅助 LRC 在真实数据中可出现约 700ms 的行首偏差。
    constructor(private readonly toleranceMs = 750) {}

    mergeLrc(document: TTMLResult, lyrics: string | undefined, kind: CompanionKind): void {
        if (!lyrics?.trim()) return;

        this.mergeParsedLines(document, parseLrc(lyrics), kind, false);
    }

    mergeQrc(document: TTMLResult, lyrics: string | undefined, kind: CompanionKind): void {
        if (!lyrics?.trim()) return;

        this.mergeParsedLines(document, parseQrc(lyrics), kind, true);
    }

    private mergeParsedLines(
        document: TTMLResult,
        companions: ParsedLyricLine[],
        kind: CompanionKind,
        preserveWordTiming: boolean
    ): void {
        let searchFrom = 0;
        for (const companion of companions) {
            const matchIndex = this.findMonotonicMatch(document.lines, companion, searchFrom);
            if (matchIndex < 0) continue;

            const content = this.toSubLyric(companion, preserveWordTiming);
            if (kind === 'translation') {
                document.lines[matchIndex].translations = [content];
            } else {
                document.lines[matchIndex].romanizations = [content];
            }
            searchFrom = matchIndex + 1;
        }
    }

    private findMonotonicMatch(lines: LyricLine[], companion: ParsedLyricLine, from: number): number {
        for (let index = from; index < lines.length; index += 1) {
            const difference = lines[index].startTime - companion.startTime;
            if (Math.abs(difference) <= this.toleranceMs) return index;
            if (difference > this.toleranceMs) return -1;
        }
        return -1;
    }

    private toSubLyric(line: ParsedLyricLine, preserveWordTiming: boolean): SubLyricContent {
        return {
            text: line.words.map(word => word.word).join(''),
            words: preserveWordTiming
                ? line.words.map(word => ({
                    text: word.word,
                    startTime: word.startTime,
                    endTime: word.endTime
                }))
                : undefined
        };
    }
}
