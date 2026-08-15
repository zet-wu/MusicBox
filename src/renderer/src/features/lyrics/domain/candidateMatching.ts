import type {LyricsCandidate, TrackLyricsQuery} from './types';

const TITLE_WEIGHT = 0.45;
const ARTIST_WEIGHT = 0.30;
const ALBUM_WEIGHT = 0.10;
const DURATION_WEIGHT = 0.15;

export function scoreLyricsCandidate(
    query: TrackLyricsQuery,
    candidate: Omit<LyricsCandidate, 'matchScore'>
): number {
    const title = similarity(query.title, candidate.title);
    const artist = bestListSimilarity(query.artists, candidate.artists);
    const album = query.album && candidate.album ? similarity(query.album, candidate.album) : 0.5;
    const duration = durationSimilarity(query.durationMs, candidate.durationMs);
    const qualityBonus = getQualityBonus(candidate);

    return clampScore(Math.round(100 * (
        title * TITLE_WEIGHT
        + artist * ARTIST_WEIGHT
        + album * ALBUM_WEIGHT
        + duration * DURATION_WEIGHT
        + qualityBonus
    )));
}

export function rankLyricsCandidates(
    query: TrackLyricsQuery,
    candidates: Array<Omit<LyricsCandidate, 'matchScore'>>
): LyricsCandidate[] {
    return candidates
        .map(candidate => ({...candidate, matchScore: scoreLyricsCandidate(query, candidate)}))
        .sort((left, right) => {
            const scoreDifference = right.matchScore - left.matchScore;
            if (scoreDifference !== 0) return scoreDifference;
            return getQualityBonus(right) - getQualityBonus(left);
        });
}

function normalize(value: string): string {
    return value
        .normalize('NFKC')
        .toLocaleLowerCase()
        .replace(/[\s_'"“”‘’·・.()[\]{}（）【】]/g, '')
        .replace(/(?:feat\.?|ft\.?).*$/i, '')
        .trim();
}

function similarity(left: string, right: string): number {
    const normalizedLeft = normalize(left);
    const normalizedRight = normalize(right);
    if (!normalizedLeft || !normalizedRight) return 0;
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

function getQualityBonus(candidate: Omit<LyricsCandidate, 'matchScore'>): number {
    const capabilities = candidate.capabilities;
    if (capabilities?.ttml) return 0.05;
    if (capabilities?.wordTimed) return 0.03;
    return 0;
}

function clampScore(score: number): number {
    return Math.max(0, Math.min(100, score));
}
