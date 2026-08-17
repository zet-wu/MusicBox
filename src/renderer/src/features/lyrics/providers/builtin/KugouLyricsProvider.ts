import type {LyricsCandidate, ProviderLyricsPayload, TrackLyricsQuery} from '../../domain/types';
import type {LyricsProvider} from '../LyricsProvider';
import {
    decodeBase64Bytes,
    fetchJson,
    providerFetch,
    rankProviderCandidates,
    splitArtists,
    type LyricsFetch
} from './shared';

interface KugouSearchResponse {
    data?: {lists?: KugouWebSong[]};
}

interface KugouMobileSearchResponse {
    data?: {info?: KugouMobileSong[]};
}

interface KugouMobileSong {
    hash: string;
    songname?: string;
    singername?: string;
    album_name?: string;
    duration?: number;
    album_audio_id?: number;
}

interface KugouWebSong {
    FileHash: string;
    SongName?: string;
    FileName?: string;
    SingerName?: string;
    AlbumName?: string;
    Duration?: number;
}

interface KugouLyricsCandidate {
    id: string;
    accesskey: string;
    duration?: number;
}

interface KugouLyricsSearchResponse {
    candidates?: KugouLyricsCandidate[];
}

interface KugouDownloadResponse {
    content?: string;
    fmt?: string;
}

interface KugouProviderData {
    hash: string;
    keyword: string;
    durationMs?: number;
}

export class KugouLyricsProvider implements LyricsProvider {
    readonly id = 'kugou';
    readonly displayName = '酷狗音乐';

    constructor(private readonly request: LyricsFetch = providerFetch) {}

    async search(query: TrackLyricsQuery, signal: AbortSignal): Promise<LyricsCandidate[]> {
        try {
            return await this.searchMobile(query, signal);
        } catch (error) {
            if (signal.aborted) throw error;
            console.warn('⚠️ Lyrics: 酷狗移动搜索失败，尝试网页接口', error);
            return this.searchWeb(query, signal);
        }
    }

    private async searchMobile(query: TrackLyricsQuery, signal: AbortSignal): Promise<LyricsCandidate[]> {
        const url = new URL('https://mobiles.kugou.com/api/v3/search/song');
        url.search = new URLSearchParams({
            format: 'json',
            keyword: [query.title, ...query.artists].join(' '),
            page: '1',
            pagesize: '30',
            showtype: '14',
            plat: '0',
            sver: '5',
            correct: '1',
            api_ver: '1',
            version: '9108'
        }).toString();
        const response = await fetchJson<KugouMobileSearchResponse>(this.request, url.toString(), signal, {
            headers: {Accept: 'application/json', Referer: 'https://www.kugou.com/'}
        });
        return rankProviderCandidates(query, (response.data?.info ?? []).map(song => this.toCandidate(query, {
            hash: song.hash,
            title: song.songname,
            artist: song.singername,
            album: song.album_name,
            duration: song.duration,
            candidateId: song.album_audio_id ? String(song.album_audio_id) : song.hash
        })));
    }

    private async searchWeb(query: TrackLyricsQuery, signal: AbortSignal): Promise<LyricsCandidate[]> {
        const url = new URL('https://songsearch.kugou.com/song_search_v2');
        url.search = new URLSearchParams({
            keyword: [query.title, ...query.artists].join(' '),
            page: '1',
            pagesize: '20'
        }).toString();
        const response = await fetchJson<KugouSearchResponse>(this.request, url.toString(), signal, {
            headers: {Accept: 'application/json', Referer: 'https://www.kugou.com/'}
        });

        return rankProviderCandidates(query, (response.data?.lists ?? []).map(song => this.toCandidate(query, {
            hash: song.FileHash,
            title: song.SongName ?? song.FileName,
            artist: song.SingerName,
            album: song.AlbumName,
            duration: song.Duration
        })));
    }

    private toCandidate(query: TrackLyricsQuery, song: {
        hash: string;
        title?: string;
        artist?: string;
        album?: string;
        duration?: number;
        candidateId?: string;
    }): Omit<LyricsCandidate, 'identityScore' | 'qualityScore'> {
        const durationMs = song.duration ? normalizeDuration(song.duration) : undefined;
        return {
            providerId: this.id,
            candidateId: song.candidateId ?? song.hash,
            title: song.title ?? query.title,
            artists: splitArtists(song.artist),
            album: song.album,
            durationMs,
            capabilities: {lineTimed: true, wordTimed: true, translation: true, romanization: true},
            providerData: {
                hash: song.hash,
                keyword: [song.artist, song.title].filter(Boolean).join(' - '),
                durationMs
            } satisfies KugouProviderData
        };
    }

    async fetch(candidate: LyricsCandidate, signal: AbortSignal): Promise<ProviderLyricsPayload> {
        const data = candidate.providerData as KugouProviderData | undefined;
        if (!data?.hash) throw new Error('酷狗候选缺少歌曲 hash');

        const searchUrl = new URL('https://lyrics.kugou.com/search');
        searchUrl.search = new URLSearchParams({
            ver: '1', man: 'yes', client: 'pc', keyword: data.keyword,
            duration: String(data.durationMs ?? ''), hash: data.hash
        }).toString();
        const headers = {Accept: 'application/json', Referer: 'https://www.kugou.com/'};
        const search = await fetchJson<KugouLyricsSearchResponse>(this.request, searchUrl.toString(), signal, {headers});
        const lyricCandidate = selectClosestLyric(search.candidates ?? [], data.durationMs);
        if (!lyricCandidate) throw new Error('酷狗候选不包含歌词文件');

        const downloadUrl = new URL('https://lyrics.kugou.com/download');
        downloadUrl.search = new URLSearchParams({
            ver: '1', client: 'pc', id: lyricCandidate.id,
            accesskey: lyricCandidate.accesskey, fmt: 'krc', charset: 'utf8'
        }).toString();
        const download = await fetchJson<KugouDownloadResponse>(this.request, downloadUrl.toString(), signal, {headers});
        if (!download.content) throw new Error('酷狗歌词内容为空');
        if (download.fmt?.toLowerCase() === 'lrc') {
            return {
                kind: 'lrc',
                lyrics: new TextDecoder().decode(decodeBase64Bytes(download.content)),
                fallbackFrom: 'krc',
                fallbackReason: 'source-unavailable'
            };
        }
        return {kind: 'krc', bytes: decodeBase64Bytes(download.content)};
    }
}

function normalizeDuration(value: number): number {
    return value < 10_000 ? value * 1000 : value;
}

function selectClosestLyric(
    candidates: KugouLyricsCandidate[],
    durationMs: number | undefined
): KugouLyricsCandidate | undefined {
    if (!durationMs) return candidates[0];
    return candidates.reduce<KugouLyricsCandidate | undefined>((best, candidate) => {
        if (!best) return candidate;
        const candidateDifference = Math.abs(normalizeDuration(candidate.duration ?? durationMs) - durationMs);
        const bestDifference = Math.abs(normalizeDuration(best.duration ?? durationMs) - durationMs);
        return candidateDifference < bestDifference ? candidate : best;
    }, undefined);
}
