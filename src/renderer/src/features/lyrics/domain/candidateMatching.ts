import type {LyricsCandidate, TrackLyricsQuery} from './types';
import OpenCC from 'opencc-js/t2cn';
import {partial_ratio, ratio} from 'fuzzball';

const TITLE_WEIGHT = 0.7;
const ALBUM_WEIGHT = 0.2;
const ARTIST_WEIGHT = 0.1;
const TITLE_FULL_MATCH_WEIGHT = 0.4;
const ALBUM_FULL_MATCH_WEIGHT = 0.3;
const ARTIST_FULL_MATCH_WEIGHT = 0.2;
const DURATION_REJECT_THRESHOLD_MS = 15_000;
const FUZZ_OPTIONS = {full_process: false} as const;
export const AUTO_MATCH_IDENTITY_THRESHOLD = 55;
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
    if (
        query.durationMs !== undefined
        && candidate.durationMs !== undefined
        && Math.abs(query.durationMs - candidate.durationMs) > DURATION_REJECT_THRESHOLD_MS
    ) {
        return 0;
    }

    const fields = [
        {score: similarity(query.title, candidate.title, TITLE_FULL_MATCH_WEIGHT), weight: TITLE_WEIGHT},
        {
            score: query.album && candidate.album
                ? similarity(query.album, candidate.album, ALBUM_FULL_MATCH_WEIGHT)
                : 0,
            weight: query.album ? ALBUM_WEIGHT : 0
        },
        {
            score: bestListSimilarity(query.artists, candidate.artists, ARTIST_FULL_MATCH_WEIGHT),
            weight: query.artists.length > 0 ? ARTIST_WEIGHT : 0
        }
    ];
    const activeWeight = fields.reduce((sum, field) => sum + field.weight, 0);
    if (activeWeight === 0) return 0;
    return clampScore(Math.round(fields.reduce((sum, field) => sum + field.score * field.weight, 0) / activeWeight));
}

export function scoreLyricsCandidateQuality(
    candidate: Omit<LyricsCandidate, 'identityScore' | 'qualityScore'>
): number {
    const capabilities = candidate.capabilities;
    return clampScore(
        (capabilities?.ttml ? 25 : 0)
        + (capabilities?.wordTimed ? 40 : 0)
        + (capabilities?.translation ? 15 : 0)
        + (capabilities?.romanization ? 10 : 0)
        + (capabilities?.ruby ? 10 : 0)
    );
}

export function combinedFuzzyScore(left: string, right: string, fullMatchWeight: number): number {
    const partial = partial_ratio(left, right, FUZZ_OPTIONS);
    const full = ratio(left, right, FUZZ_OPTIONS);
    return partial * (1 - fullMatchWeight) + full * fullMatchWeight;
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
        .sort(compareLyricsCandidates);
}

export function identityBucket(score: number): number {
    return Math.min(4, Math.floor(score / 20));
}

export function compareLyricsCandidates(left: LyricsCandidate, right: LyricsCandidate): number {
    const bucketDifference = identityBucket(right.identityScore) - identityBucket(left.identityScore);
    if (bucketDifference !== 0) return bucketDifference;

    const qualityDifference = right.qualityScore - left.qualityScore;
    if (qualityDifference !== 0) return qualityDifference;

    return right.identityScore - left.identityScore;
}

function normalizeBase(value: string): string {
    return value
        .normalize('NFKC')
        .toLocaleLowerCase()
        .replace(/(?:feat\.?|ft\.?).*$/i, '')
        .replace(/[\s_'"“”‘’·・.()[\]{}（）【】]/g, '')
        .trim();
}

function normalizeVariants(value: string): string[] {
    const raw = value.normalize('NFKC').toLocaleLowerCase().trim();
    const withoutBracketSuffix = raw.replace(/\s*[([（【].*[)\]）】]\s*$/, '').trim();
    const base = normalizeBase(raw);
    const strippedBase = normalizeBase(withoutBracketSuffix);
    if (!base) return [];

    const expanded = expandHanIterationMarks(base);
    const variants = new Set([raw, withoutBracketSuffix, base, strippedBase, expanded]);
    for (const converter of cjkConverters) {
        for (const variant of [...variants]) variants.add(converter(variant));
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

function similarity(left: string, right: string, fullMatchWeight: number): number {
    const leftVariants = normalizeVariants(left);
    const rightVariants = normalizeVariants(right);
    if (leftVariants.length === 0 || rightVariants.length === 0) return 0;
    return Math.max(...leftVariants.flatMap(normalizedLeft => rightVariants.map(normalizedRight => (
        combinedFuzzyScore(normalizedLeft, normalizedRight, fullMatchWeight)
    ))));
}

function bestListSimilarity(left: string[], right: string[], fullMatchWeight: number): number {
    if (left.length === 0 || right.length === 0) return 0;
    return Math.max(...left.flatMap(leftItem => right.map(rightItem => (
        similarity(leftItem, rightItem, fullMatchWeight)
    ))));
}

function clampScore(score: number): number {
    return Math.max(0, Math.min(100, score));
}
