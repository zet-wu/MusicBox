import type {LyricsCandidate, ProviderLyricsPayload, TrackLyricsQuery} from '../../domain/types';
import type {LyricsProvider} from '../LyricsProvider';
import {fetchJson, providerFetch, rankProviderCandidates, splitArtists, type LyricsFetch} from './shared';

interface NeteaseSong {
    id: number;
    name: string;
    duration?: number;
    dt?: number;
    artists?: Array<{name: string}>;
    ar?: Array<{name: string}>;
    album?: {name?: string};
    al?: {name?: string};
}

interface NeteaseSearchResponse {
    result?: {songs?: NeteaseSong[]};
}

interface LyricTrack {
    lyric?: string;
}

interface NeteaseLyricResponse {
    yrc?: LyricTrack;
    lrc?: LyricTrack;
    tlyric?: LyricTrack;
    romalrc?: LyricTrack;
    ytlrc?: LyricTrack;
    yromalrc?: LyricTrack;
}

export class NeteaseLyricsProvider implements LyricsProvider {
    readonly id = 'netease';
    readonly displayName = '网易云音乐';

    constructor(private readonly request: LyricsFetch = providerFetch) {}

    async search(query: TrackLyricsQuery, signal: AbortSignal): Promise<LyricsCandidate[]> {
        const url = new URL('https://music.163.com/api/search/get/web');
        url.search = new URLSearchParams({s: query.title, type: '1', offset: '0', total: 'true', limit: '20'}).toString();
        const response = await fetchJson<NeteaseSearchResponse>(this.request, url.toString(), signal, {
            headers: {Accept: 'application/json', Referer: 'https://music.163.com/'}
        });
        const songs = response.result?.songs ?? [];

        return rankProviderCandidates(query, songs.map(song => ({
            providerId: this.id,
            candidateId: String(song.id),
            title: song.name,
            artists: (song.ar ?? song.artists)?.map(artist => artist.name) ?? splitArtists(undefined),
            album: song.al?.name ?? song.album?.name,
            durationMs: song.dt ?? song.duration,
            capabilities: {lineTimed: true, wordTimed: true, translation: true, romanization: true},
            providerData: {songId: song.id}
        })));
    }

    async fetch(candidate: LyricsCandidate, signal: AbortSignal): Promise<ProviderLyricsPayload> {
        const songId = (candidate.providerData as {songId?: number} | undefined)?.songId ?? candidate.candidateId;
        const url = new URL('https://music.163.com/api/song/lyric');
        url.search = new URLSearchParams({id: String(songId), lv: '-1', kv: '-1', tv: '-1', rv: '-1', yv: '-1'}).toString();
        const result = await fetchJson<NeteaseLyricResponse>(this.request, url.toString(), signal, {
            headers: {Accept: 'application/json', Referer: 'https://music.163.com/'}
        });
        if (result.yrc?.lyric?.trim()) {
            return {
                kind: 'yrc',
                lyrics: result.yrc.lyric,
                translation: preferTrack(result.ytlrc, result.tlyric),
                romanization: preferTrack(result.yromalrc, result.romalrc)
            };
        }
        if (result.lrc?.lyric?.trim()) {
            return {
                kind: 'lrc',
                lyrics: result.lrc.lyric,
                translation: result.tlyric?.lyric,
                romanization: result.romalrc?.lyric,
                fallbackFrom: 'yrc',
                fallbackReason: 'source-unavailable'
            };
        }
        throw new Error('网易云音乐候选不包含可用歌词');
    }
}

function preferTrack(primary: LyricTrack | undefined, fallback: LyricTrack | undefined): string | undefined {
    return primary?.lyric?.trim() ? primary.lyric : fallback?.lyric;
}
