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
        const url = new URL('https://songsearch.kugou.com/song_search_v2');
        url.search = new URLSearchParams({
            keyword: [query.title, ...query.artists].join(' '),
            page: '1',
            pagesize: '20'
        }).toString();
        const response = await fetchJson<KugouSearchResponse>(this.request, url.toString(), signal, {
            headers: {Accept: 'application/json', Referer: 'https://www.kugou.com/'}
        });

        return rankProviderCandidates(query, (response.data?.lists ?? []).map(song => ({
            providerId: this.id,
            candidateId: song.FileHash,
            title: song.SongName ?? song.FileName ?? query.title,
            artists: splitArtists(song.SingerName),
            album: song.AlbumName,
            durationMs: song.Duration ? normalizeDuration(song.Duration) : undefined,
            capabilities: {lineTimed: true, wordTimed: true, translation: true, romanization: true},
            providerData: {
                hash: song.FileHash,
                keyword: [song.SingerName, song.SongName ?? song.FileName].filter(Boolean).join(' - '),
                durationMs: song.Duration ? normalizeDuration(song.Duration) : undefined
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
        const headers = {Accept: 'application/json', Referer: 'https://www.kugou.com/'};
        const search = await fetchJson<KugouLyricsSearchResponse>(this.request, searchUrl.toString(), signal, {headers});
        const lyricCandidate = search.candidates?.[0];
        if (!lyricCandidate) throw new Error('酷狗候选不包含歌词文件');

        const downloadUrl = new URL('https://lyrics.kugou.com/download');
        downloadUrl.search = new URLSearchParams({
            ver: '1', client: 'pc', id: lyricCandidate.id,
            accesskey: lyricCandidate.accesskey, fmt: 'krc', charset: 'utf8'
        }).toString();
        const download = await fetchJson<KugouDownloadResponse>(this.request, downloadUrl.toString(), signal, {headers});
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
