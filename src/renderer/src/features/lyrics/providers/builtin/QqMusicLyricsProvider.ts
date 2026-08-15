import {decryptQrcHex} from '@applemusic-like-lyrics/lyric';
import type {LyricsCandidate, ProviderLyricsPayload, TrackLyricsQuery} from '../../domain/types';
import type {LyricsProvider} from '../LyricsProvider';
import {decodeBase64Text, fetchJson, rankProviderCandidates, type LyricsFetch} from './shared';

interface QqSong {
    songmid: string;
    songname: string;
    singer?: Array<{name: string}>;
    albumname?: string;
    interval?: number;
}

interface QqSearchResponse {
    data?: {song?: {list?: QqSong[]}};
}

interface QqLyricResponse {
    qrc?: string;
    lyric?: string;
    trans?: string;
    roma?: string;
}

export class QqMusicLyricsProvider implements LyricsProvider {
    readonly id = 'qqmusic';
    readonly displayName = 'QQ 音乐';

    constructor(private readonly request: LyricsFetch = fetch) {}

    async search(query: TrackLyricsQuery, signal: AbortSignal): Promise<LyricsCandidate[]> {
        const url = new URL('https://c.y.qq.com/soso/fcgi-bin/client_search_cp');
        url.search = new URLSearchParams({format: 'json', p: '1', n: '20', w: query.title}).toString();
        const response = await fetchJson<QqSearchResponse>(this.request, url.toString(), signal, {
            headers: {Accept: 'application/json'}
        });

        return rankProviderCandidates(query, (response.data?.song?.list ?? []).map(song => ({
            providerId: this.id,
            candidateId: song.songmid,
            title: song.songname,
            artists: song.singer?.map(artist => artist.name) ?? [],
            album: song.albumname,
            durationMs: song.interval ? song.interval * 1000 : undefined,
            capabilities: {lineTimed: true, wordTimed: true, translation: true, romanization: true},
            providerData: {songmid: song.songmid}
        })));
    }

    async fetch(candidate: LyricsCandidate, signal: AbortSignal): Promise<ProviderLyricsPayload> {
        const songmid = (candidate.providerData as {songmid?: string} | undefined)?.songmid ?? candidate.candidateId;
        const url = new URL('https://c.y.qq.com/lyric/fcgi-bin/fcg_query_lyric_new.fcg');
        url.search = new URLSearchParams({songmid, format: 'json', nobase64: '0'}).toString();
        const result = await fetchJson<QqLyricResponse>(this.request, url.toString(), signal, {
            headers: {Accept: 'application/json'}
        });
        const translation = decodeOptional(result.trans);
        const romanization = decodeOptional(result.roma);

        if (result.qrc) {
            const decoded = decodeOptional(result.qrc) ?? result.qrc;
            return {kind: 'qrc', lyrics: normalizeQrc(decoded), translation, romanization};
        }
        if (result.lyric) {
            return {kind: 'lrc', lyrics: decodeOptional(result.lyric) ?? result.lyric, translation, romanization};
        }
        throw new Error('QQ 音乐候选不包含可用歌词');
    }
}

function decodeOptional(value: string | undefined): string | undefined {
    if (!value) return undefined;
    try {
        return decodeBase64Text(value);
    } catch {
        return value;
    }
}

function normalizeQrc(value: string): string {
    const trimmed = value.trim();
    const decrypted = /^[0-9a-f]+$/i.test(trimmed) ? decryptQrcHex(trimmed) : trimmed;
    const attribute = decrypted.match(/LyricContent="([\s\S]*?)"\s*\/>/i)?.[1];
    return (attribute ?? decrypted)
        .replace(/&#39;/g, "'")
        .replace(/&quot;/g, '"')
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>');
}
