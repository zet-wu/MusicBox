import type {
    BackgroundVocal,
    LyricLine,
    RubyTag,
    SubLyricContent,
    Syllable,
    TTMLResult
} from '@applemusic-like-lyrics/ttml';

export interface TimelineShiftResult {
    document: TTMLResult;
    appliedDeltaMs: number;
}

export function constrainTimelineDelta(document: TTMLResult, requestedDeltaMs: number): number {
    const normalizedDelta = Math.trunc(requestedDeltaMs);
    const earliestStart = findEarliestTimedStart(document);
    const constrainedDelta = normalizedDelta < 0 && earliestStart !== null
        ? Math.max(normalizedDelta, -earliestStart)
        : normalizedDelta;
    return constrainedDelta === 0 ? 0 : constrainedDelta;
}

export function shiftTimeline(document: TTMLResult, requestedDeltaMs: number): TimelineShiftResult {
    const constrainedDelta = constrainTimelineDelta(document, requestedDeltaMs);
    const appliedDeltaMs = constrainedDelta;

    return {
        document: {
            metadata: cloneMetadata(document.metadata),
            lines: document.lines.map(line => shiftLine(line, appliedDeltaMs))
        },
        appliedDeltaMs
    };
}

function findEarliestTimedStart(document: TTMLResult): number | null {
    let earliest: number | null = null;
    const visit = (startTime: number): void => {
        if (!Number.isFinite(startTime)) return;
        earliest = earliest === null ? startTime : Math.min(earliest, startTime);
    };

    for (const line of document.lines) {
        visitTimedContent(line, visit);
        if (line.backgroundVocal) visitTimedContent(line.backgroundVocal, visit);
    }
    return earliest;
}

function visitTimedContent(content: BackgroundVocal | LyricLine, visit: (startTime: number) => void): void {
    visit(content.startTime);
    visitSyllables(content.words, visit);
    visitSubLyrics(content.translations, visit);
    visitSubLyrics(content.romanizations, visit);
}

function visitSubLyrics(contents: SubLyricContent[] | undefined, visit: (startTime: number) => void): void {
    for (const content of contents ?? []) visitSyllables(content.words, visit);
}

function visitSyllables(words: Syllable[] | undefined, visit: (startTime: number) => void): void {
    for (const word of words ?? []) {
        visit(word.startTime);
        for (const ruby of word.ruby ?? []) visit(ruby.startTime);
    }
}

function shiftLine(line: LyricLine, deltaMs: number): LyricLine {
    return {
        ...line,
        startTime: line.startTime + deltaMs,
        endTime: line.endTime + deltaMs,
        words: shiftSyllables(line.words, deltaMs),
        translations: shiftSubLyrics(line.translations, deltaMs),
        romanizations: shiftSubLyrics(line.romanizations, deltaMs),
        backgroundVocal: line.backgroundVocal
            ? shiftBackgroundVocal(line.backgroundVocal, deltaMs)
            : undefined
    };
}

function shiftBackgroundVocal(vocal: BackgroundVocal, deltaMs: number): BackgroundVocal {
    return {
        ...vocal,
        startTime: vocal.startTime + deltaMs,
        endTime: vocal.endTime + deltaMs,
        words: shiftSyllables(vocal.words, deltaMs),
        translations: shiftSubLyrics(vocal.translations, deltaMs),
        romanizations: shiftSubLyrics(vocal.romanizations, deltaMs)
    };
}

function shiftSubLyrics(contents: SubLyricContent[] | undefined, deltaMs: number): SubLyricContent[] | undefined {
    return contents?.map(content => ({
        ...content,
        words: shiftSyllables(content.words, deltaMs)
    }));
}

function shiftSyllables(words: Syllable[] | undefined, deltaMs: number): Syllable[] | undefined {
    return words?.map(word => ({
        ...word,
        startTime: word.startTime + deltaMs,
        endTime: word.endTime + deltaMs,
        ruby: word.ruby?.map(ruby => shiftRuby(ruby, deltaMs))
    }));
}

function shiftRuby(ruby: RubyTag, deltaMs: number): RubyTag {
    return {
        ...ruby,
        startTime: ruby.startTime + deltaMs,
        endTime: ruby.endTime + deltaMs
    };
}

function cloneMetadata(metadata: TTMLResult['metadata']): TTMLResult['metadata'] {
    return structuredClone(metadata);
}
