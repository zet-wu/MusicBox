import {decodeKrc} from './decodeKrc';
import type {KrcLine, KrcParseResult} from './types';

const LINE_PATTERN = /^\[(\d+),(\d+)](.*)$/;
const WORD_PATTERN = /<(\d+),(\d+),\d+>([^<]*)/g;

interface KrcLanguageTrack {
    type?: number;
    lyricContent?: unknown;
}

interface KrcLanguagePayload {
    content?: KrcLanguageTrack[];
}

export function parseKrc(bytes: Uint8Array): KrcParseResult {
    const text = decodeKrc(bytes);
    const offset = parseOffset(text);
    const language = parseLanguageBlock(text);
    const lines = text
        .split(/\r?\n/)
        .map(line => parseLine(line, offset))
        .filter((line): line is NonNullable<typeof line> => Boolean(line));

    if (lines.length === 0) {
        throw new Error('KRC 未包含可用歌词');
    }

    const translations = getLanguageRows(language, 1);
    const romanizations = getLanguageRows(language, 0);
    lines.forEach((line, index) => {
        const translation = translations[index];
        if (translation?.length) line.translation = translation.join('');

        const romanization = romanizations[index];
        if (!romanization?.length) return;
        line.romanization = joinRomanization(romanization);
        if (romanization.length === line.words.length) {
            line.romanizationWords = romanization.map((word, wordIndex) => ({
                text: word,
                startTime: line.words[wordIndex].startTime,
                endTime: line.words[wordIndex].endTime
            }));
        }
    });

    return {lines};
}

function parseLine(line: string, offset: number): KrcLine | null {
    const match = line.match(LINE_PATTERN);
    if (!match) return null;

    const rawStart = Number(match[1]);
    const duration = Number(match[2]);
    const startTime = Math.max(0, rawStart + offset);
    const words = [...match[3].matchAll(WORD_PATTERN)].map(wordMatch => {
        const relativeStart = Number(wordMatch[1]);
        const wordDuration = Number(wordMatch[2]);
        return {
            text: wordMatch[3],
            startTime: Math.max(0, rawStart + relativeStart + offset),
            endTime: Math.max(0, rawStart + relativeStart + wordDuration + offset)
        };
    });

    const text = words.length > 0
        ? words.map(word => word.text).join('')
        : match[3].trim();
    if (!text) return null;

    return {
        text,
        startTime,
        endTime: Math.max(startTime, rawStart + duration + offset),
        words
    };
}

function parseOffset(text: string): number {
    const match = text.match(/^\[offset:([+-]?\d+)]$/m);
    return match ? Number(match[1]) : 0;
}

function parseLanguageBlock(text: string): KrcLanguagePayload | undefined {
    const match = text.match(/^\[language:([^\]]+)]$/m);
    if (!match) return undefined;

    try {
        const json = new TextDecoder().decode(Uint8Array.from(atob(match[1]), character => character.charCodeAt(0)));
        return JSON.parse(json) as KrcLanguagePayload;
    } catch (error) {
        throw new Error('KRC language block 无效', {cause: error});
    }
}

function getLanguageRows(payload: KrcLanguagePayload | undefined, type: number): string[][] {
    const track = payload?.content?.find(item => item.type === type);
    if (!Array.isArray(track?.lyricContent)) return [];
    return track.lyricContent.map(row => Array.isArray(row) ? row.map(String) : []);
}

function joinRomanization(words: string[]): string {
    return words.join(words.some(word => /\s$/.test(word)) ? '' : ' ');
}
