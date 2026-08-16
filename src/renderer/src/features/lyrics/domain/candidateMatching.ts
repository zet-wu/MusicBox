import type {LyricsCandidate, TrackLyricsQuery} from './types';
import OpenCC from 'opencc-js/t2cn';

const TITLE_WEIGHT = 0.45;
const ARTIST_WEIGHT = 0.30;
const ALBUM_WEIGHT = 0.10;
const DURATION_WEIGHT = 0.15;
const cjkConverters = [
    OpenCC.Converter({from: 't', to: 'cn'}),
    OpenCC.Converter({from: 'tw', to: 'cn'}),
    OpenCC.Converter({from: 'hk', to: 'cn'}),
    OpenCC.Converter({from: 'jp', to: 'cn'})
];

export function scoreLyricsCandidateIdentity(
    query: TrackLyricsQuery,
    candidate: Omit<LyricsCandidate, 'identityScore' | 'qualityScore'>
): number {
    const title = similarity(query.title, candidate.title);
    const artist = bestListSimilarity(query.artists, candidate.artists);
    const album = query.album && candidate.album ? similarity(query.album, candidate.album) : 0.5;
    const duration = durationSimilarity(query.durationMs, candidate.durationMs);
    return clampScore(Math.round(100 * (
        title * TITLE_WEIGHT
        + artist * ARTIST_WEIGHT
        + album * ALBUM_WEIGHT
        + duration * DURATION_WEIGHT
    )));
}

export function scoreLyricsCandidateQuality(
    candidate: Omit<LyricsCandidate, 'identityScore' | 'qualityScore'>
): number {
    const capabilities = candidate.capabilities;
    if (capabilities?.ttml) return 25;
    if (capabilities?.wordTimed) return 40;
    return 0;
}

export function rankLyricsCandidates(
    query: TrackLyricsQuery,
    candidates: Array<Omit<LyricsCandidate, 'identityScore' | 'qualityScore'>>
): LyricsCandidate[] {
    return candidates
        .map(candidate => ({
            ...candidate,
            identityScore: scoreLyricsCandidateIdentity(query, candidate),
            qualityScore: scoreLyricsCandidateQuality(candidate)
        }))
        .sort((left, right) => {
            const scoreDifference = right.identityScore - left.identityScore;
            if (scoreDifference !== 0) return scoreDifference;
            return right.qualityScore - left.qualityScore;
        });
}

function normalizeBase(value: string): string {
    return value
        .normalize('NFKC')
        .toLocaleLowerCase()
        .replace(/[\s_'"“”‘’·・.()[\]{}（）【】]/g, '')
        .replace(/(?:feat\.?|ft\.?).*$/i, '')
        .trim();
}

function normalizeVariants(value: string): string[] {
    const base = normalizeBase(value);
    if (!base) return [];

    const expanded = expandHanIterationMarks(base);
    const variants = new Set([base, expanded]);
    for (const converter of cjkConverters) {
        variants.add(converter(base));
        variants.add(converter(expanded));
    }
    return [...variants].filter(Boolean);
}

function expandHanIterationMarks(value: string): string {
    const characters = [...value];
    return characters.map((character, index) => {
        if (character !== '々' || index === 0) return character;
        const previous = characters[index - 1];
        return /\p{Script=Han}/u.test(previous) ? previous : character;
    }).join('');
}

function similarity(left: string, right: string): number {
    const leftVariants = normalizeVariants(left);
    const rightVariants = normalizeVariants(right);
    if (leftVariants.length === 0 || rightVariants.length === 0) return 0;
    return Math.max(...leftVariants.flatMap(normalizedLeft => rightVariants.map(normalizedRight => (
        normalizedSimilarity(normalizedLeft, normalizedRight)
    ))));
}

function normalizedSimilarity(normalizedLeft: string, normalizedRight: string): number {
    if (normalizedLeft === normalizedRight) return 1;
    if (normalizedLeft.includes(normalizedRight) || normalizedRight.includes(normalizedLeft)) return 0.8;

    const leftChars = new Set(normalizedLeft);
    const rightChars = new Set(normalizedRight);
    const intersection = [...leftChars].filter(character => rightChars.has(character)).length;
    return (2 * intersection) / (leftChars.size + rightChars.size);
}

function bestListSimilarity(left: string[], right: string[]): number {
    if (left.length === 0 || right.length === 0) return 0.5;
    return Math.max(...left.flatMap(leftItem => right.map(rightItem => similarity(leftItem, rightItem))));
}

function durationSimilarity(left?: number, right?: number): number {
    if (!left || !right) return 0.5;
    const difference = Math.abs(left - right);
    if (difference <= 2_000) return 1;
    if (difference <= 5_000) return 0.75;
    if (difference <= 10_000) return 0.35;
    return 0;
}

function clampScore(score: number): number {
    return Math.max(0, Math.min(100, score));
}
