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

interface KugouSong {
    hash: string;
    songname?: string;
    filename?: string;
    singername?: string;
    album_name?: string;
    duration?: number;
}

interface KugouSearchResponse {
    data?: {info?: KugouSong[]};
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
        const url = new URL('https://mobilecdn.kugou.com/api/v3/search/song');
        url.search = new URLSearchParams({format: 'json', keyword: query.title, page: '1', pagesize: '20', showtype: '1'}).toString();
        const response = await fetchJson<KugouSearchResponse>(this.request, url.toString(), signal);

        return rankProviderCandidates(query, (response.data?.info ?? []).map(song => ({
            providerId: this.id,
            candidateId: song.hash,
            title: song.songname ?? song.filename ?? query.title,
            artists: splitArtists(song.singername),
            album: song.album_name,
            durationMs: song.duration ? normalizeDuration(song.duration) : undefined,
            capabilities: {lineTimed: true, wordTimed: true, translation: true, romanization: true},
            providerData: {
                hash: song.hash,
                keyword: song.songname ?? song.filename ?? query.title,
                durationMs: song.duration ? normalizeDuration(song.duration) : undefined
            } satisfies KugouProviderData
        })));
    }

    async fetch(candidate: LyricsCandidate, signal: AbortSignal): Promise<ProviderLyricsPayload> {
        const data = candidate.providerData as KugouProviderData | undefined;
        if (!data?.hash) throw new Error('酷狗候选缺少歌曲 hash');

        const searchUrl = new URL('https://lyrics.kugou.com/search');
        searchUrl.search = new URLSearchParams({
            ver: '1', man: 'yes', client: 'pc', keyword: data.keyword,
            duration: String(data.durationMs ?? ''), hash: data.hash
        }).toString();
        const search = await fetchJson<KugouLyricsSearchResponse>(this.request, searchUrl.toString(), signal);
        const lyricCandidate = search.candidates?.[0];
        if (!lyricCandidate) throw new Error('酷狗候选不包含歌词文件');

        const downloadUrl = new URL('https://lyrics.kugou.com/download');
        downloadUrl.search = new URLSearchParams({
            ver: '1', client: 'pc', id: lyricCandidate.id,
            accesskey: lyricCandidate.accesskey, fmt: 'krc', charset: 'utf8'
        }).toString();
        const download = await fetchJson<KugouDownloadResponse>(this.request, downloadUrl.toString(), signal);
        if (!download.content) throw new Error('酷狗歌词内容为空');
        if (download.fmt?.toLowerCase() === 'lrc') {
            return {kind: 'lrc', lyrics: new TextDecoder().decode(decodeBase64Bytes(download.content))};
        }
        return {kind: 'krc', bytes: decodeBase64Bytes(download.content)};
    }
}

function normalizeDuration(value: number): number {
    return value < 10_000 ? value * 1000 : value;
}
