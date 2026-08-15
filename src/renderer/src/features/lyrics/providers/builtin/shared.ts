import type {LyricsCandidate, TrackLyricsQuery} from '../../domain/types';
import {rankLyricsCandidates} from '../../domain/candidateMatching';
import {lyricsGateway} from '@/infrastructure/electron';

export type LyricsFetch = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;
export const providerFetch: LyricsFetch = (input, init) => lyricsGateway.providerRequest(input, init);

export async function fetchJson<T>(
    request: LyricsFetch,
    url: string,
    signal: AbortSignal,
    init: RequestInit = {}
): Promise<T> {
    const response = await request(url, {...init, signal});
    if (!response.ok) throw new Error(`歌词请求失败: HTTP ${response.status}`);
    return response.json() as Promise<T>;
}

export async function fetchText(
    request: LyricsFetch,
    url: string,
    signal: AbortSignal,
    init: RequestInit = {}
): Promise<string> {
    const response = await request(url, {...init, signal});
    if (!response.ok) throw new Error(`歌词请求失败: HTTP ${response.status}`);
    return response.text();
}

export function rankProviderCandidates(
    query: TrackLyricsQuery,
    candidates: Array<Omit<LyricsCandidate, 'matchScore'>>
): LyricsCandidate[] {
    return rankLyricsCandidates(query, candidates);
}

export function splitArtists(value: string | undefined): string[] {
    return value?.split(/[、/&;,，]+/).map(item => item.trim()).filter(Boolean) ?? [];
}

export function decodeBase64Text(value: string): string {
    const bytes = decodeBase64Bytes(value);
    return new TextDecoder().decode(bytes);
}

export function decodeBase64Bytes(value: string): Uint8Array {
    const binary = atob(value.replace(/\s/g, ''));
    return Uint8Array.from(binary, character => character.charCodeAt(0));
}
