import {decryptQrcHex} from '@applemusic-like-lyrics/lyric';
import type {LyricsCandidate, ProviderLyricsPayload, TrackLyricsQuery} from '../../domain/types';
import type {LyricsProvider} from '../LyricsProvider';
import {decodeBase64Text, fetchJson, providerFetch, rankProviderCandidates, type LyricsFetch} from './shared';

interface QqSong {
    mid?: string;
    songmid?: string;
    id?: number;
    songid?: number;
    name?: string;
    songname?: string;
    singer?: Array<{name: string}>;
    album?: {name?: string};
    albumname?: string;
    interval?: number;
}

interface QqSearchResponse {
    code?: number;
    'music.search.SearchCgiService'?: {
        code?: number;
        data?: {body?: {song?: {list?: QqSong[]}}};
    };
}

interface QqLegacySearchResponse {
    code?: number;
    data?: {song?: {list?: QqSong[]}};
}

interface QqLyricResponse {
    qrc?: number;
    crypt?: number;
    lyric?: string;
    trans?: string;
    roma?: string;
    lyric_t?: number;
    trans_t?: number;
    roma_t?: number;
}

interface QqMusicuResponse {
    code?: number;
    req_0?: {code?: number; data?: QqLyricResponse};
}

interface QqProviderData {
    songmid: string;
    songid?: number;
}

export class QqMusicLyricsProvider implements LyricsProvider {
    readonly id = 'qqmusic';
    readonly displayName = 'QQ 音乐';

    constructor(private readonly request: LyricsFetch = providerFetch) {}

    async search(query: TrackLyricsQuery, signal: AbortSignal): Promise<LyricsCandidate[]> {
        const keywords = [query.title, ...query.artists].join(' ');
        let musicuError: unknown;
        try {
            const songs = await this.searchMusicu(keywords, signal);
            const candidates = this.toCandidates(query, songs);
            if (candidates.length) return candidates;
        } catch (error) {
            if (signal.aborted) throw error;
            musicuError = error;
        }

        try {
            return this.toCandidates(query, await this.searchLegacy(keywords, signal));
        } catch (error) {
            if (signal.aborted) throw error;
            if (musicuError) {
                throw new Error(`QQ 音乐搜索失败: ${String(musicuError)}；备用接口: ${String(error)}`);
            }
            throw error;
        }
    }

    private async searchMusicu(keywords: string, signal: AbortSignal): Promise<QqSong[]> {
        const body = {
            'music.search.SearchCgiService': {
                module: 'music.search.SearchCgiService',
                method: 'DoSearchForQQMusicDesktop',
                param: {
                    query: keywords,
                    search_type: 0,
                    page_num: 1,
                    num_per_page: 20
                }
            }
        };
        const response = await fetchJson<QqSearchResponse>(this.request, 'https://u.y.qq.com/cgi-bin/musicu.fcg', signal, {
            method: 'POST',
            headers: {...qqHeaders('https://y.qq.com/'), 'Content-Type': 'application/json'},
            body: JSON.stringify(body)
        });
        const search = response['music.search.SearchCgiService'];
        if (response.code !== 0 || search?.code !== 0) {
            throw new Error(`QQ musicu 搜索请求失败: ${search?.code ?? response.code ?? -1}`);
        }

        return search.data?.body?.song?.list ?? [];
    }

    private async searchLegacy(keywords: string, signal: AbortSignal): Promise<QqSong[]> {
        const url = new URL('https://c.y.qq.com/soso/fcgi-bin/search_for_qq_cp');
        url.search = new URLSearchParams({
            w: keywords,
            n: '20',
            p: '1',
            format: 'json',
            remoteplace: 'txt.yqq.song',
            ct: '24',
            qqmusic_ver: '1298',
            platform: 'yqq.json'
        }).toString();
        const response = await fetchJson<QqLegacySearchResponse>(this.request, url.toString(), signal, {
            headers: qqHeaders('https://y.qq.com/')
        });
        if (response.code !== 0) {
            throw new Error(`QQ 备用搜索请求失败: ${response.code ?? -1}`);
        }
        if (!Array.isArray(response.data?.song?.list)) throw new Error('QQ 备用搜索响应缺少歌曲列表');
        return response.data.song.list;
    }

    private toCandidates(query: TrackLyricsQuery, songs: QqSong[]): LyricsCandidate[] {
        return rankProviderCandidates(query, songs.flatMap(song => {
            const mid = song.mid ?? song.songmid;
            const title = song.name ?? song.songname;
            if (!mid || !title) return [];
            return [{
                providerId: this.id,
                candidateId: mid,
                title,
                artists: song.singer?.map(artist => artist.name) ?? [],
                album: song.album?.name ?? song.albumname,
                durationMs: song.interval ? song.interval * 1000 : undefined,
                capabilities: {lineTimed: true, wordTimed: true, translation: true, romanization: true},
                providerData: {songmid: mid, songid: song.id ?? song.songid} satisfies QqProviderData
            }];
        }));
    }

    async fetch(candidate: LyricsCandidate, signal: AbortSignal): Promise<ProviderLyricsPayload> {
        const data = candidate.providerData as QqProviderData | undefined;
        const songmid = data?.songmid ?? candidate.candidateId;
        const musicu = await this.fetchMusicu(songmid, data?.songid, signal);
        if (musicu?.lyric?.trim()) return toQqPayload(musicu);

        console.warn('⚠️ Lyrics: QQ musicu 成功响应未包含歌词，尝试网页 LRC 接口');
        const url = new URL('https://i.y.qq.com/lyric/fcgi-bin/fcg_query_lyric_new.fcg');
        url.search = new URLSearchParams({
            songmid,
            g_tk: '5381',
            format: 'json',
            inCharset: 'utf8',
            outCharset: 'utf-8',
            notice: '0',
            platform: 'yqq.json',
            needNewCode: '0',
            nobase64: '1'
        }).toString();
        const result = await fetchJson<QqLyricResponse>(this.request, url.toString(), signal, {
            headers: qqHeaders('https://y.qq.com/')
        });
        const payload = toQqPayload(result);
        return payload.kind === 'lrc'
            ? {...payload, fallbackFrom: 'qrc', fallbackReason: 'source-unavailable'}
            : payload;
    }

    private async fetchMusicu(songmid: string, songid: number | undefined, signal: AbortSignal): Promise<QqLyricResponse | null> {
        const body = {
            req_0: {
                module: 'music.musichallSong.PlayLyricInfo',
                method: 'GetPlayLyricInfo',
                param: {
                    songMID: songmid,
                    songID: songid ?? 0,
                    crypt: 1,
                    type: 1,
                    lrc_t: 0,
                    qrc: 1,
                    qrc_t: 0,
                    trans: 1,
                    trans_t: 0,
                    roma: 1,
                    roma_t: 0
                }
            },
            loginUin: '0',
            comm: {uin: '0', format: 'json', ct: 24, cv: 0}
        };
        for (let attempt = 0; attempt < 3; attempt++) {
            const response = await fetchJson<QqMusicuResponse>(this.request, 'https://u.y.qq.com/cgi-bin/musicu.fcg', signal, {
                method: 'POST',
                headers: {...qqHeaders('https://y.qq.com/'), 'Content-Type': 'application/json'},
                body: JSON.stringify(body)
            });
            if (response.code === 0 && response.req_0?.code === 0) return response.req_0.data ?? null;
            const code = response.req_0?.code ?? response.code ?? -1;
            if (attempt === 2) throw new Error(`QQ musicu 歌词请求失败: ${code}`);
            await delayRetry(attempt, signal);
        }
        return null;
    }
}

function decodeQqText(value: string | undefined): string | undefined {
    if (!value) return undefined;
    const trimmed = value.trim();
    if (/^[0-9a-f]+$/i.test(trimmed)) return decryptQrcHex(trimmed);
    if (trimmed.startsWith('[') || trimmed.startsWith('<')) return trimmed;
    try {
        return decodeBase64Text(trimmed);
    } catch {
        return trimmed;
    }
}

function toQqPayload(result: QqLyricResponse): ProviderLyricsPayload {
    const translation = decodeQqText(result.trans);
    const decodedRomanization = decodeQqText(result.roma);
    const decoded = decodeQqText(result.lyric);
    if (!decoded?.trim()) throw new Error('QQ 音乐候选不包含可用歌词');
    const lyrics = normalizeQrc(decoded);
    const romanization = decodedRomanization ? normalizeQrc(decodedRomanization) : undefined;
    return looksLikeQrc(lyrics)
        ? {
            kind: 'qrc',
            lyrics,
            translation,
            romanization: romanization && !looksLikeQrc(romanization) ? romanization : undefined,
            romanizationQrc: romanization && looksLikeQrc(romanization) ? romanization : undefined
        }
        : {
            kind: 'lrc',
            lyrics,
            translation,
            romanization,
            fallbackFrom: 'qrc',
            fallbackReason: 'source-unavailable'
        };
}

function looksLikeQrc(value: string): boolean {
    return /^\[\d+,\d+\].*\(\d+,\d+\)/m.test(value);
}

function qqHeaders(referer: string): Record<string, string> {
    return {Accept: 'application/json', Referer: referer, Origin: 'https://y.qq.com'};
}

function normalizeQrc(value: string): string {
    const trimmed = value.trim();
    const decrypted = /^[0-9a-f]+$/i.test(trimmed) ? decryptQrcHex(trimmed) : trimmed;
    const attribute = decrypted.match(/LyricContent="([\s\S]*?)"(?:\s|\/?>)/i)?.[1];
    return (attribute ?? decrypted)
        .replace(/&#39;/g, "'")
        .replace(/&quot;/g, '"')
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>');
}

function delayRetry(attempt: number, signal: AbortSignal): Promise<void> {
    if (signal.aborted) return Promise.reject(signal.reason);
    return new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
            signal.removeEventListener('abort', onAbort);
            resolve();
        }, attempt === 0 ? 300 : 900);
        const onAbort = () => {
            clearTimeout(timer);
            reject(signal.reason);
        };
        signal.addEventListener('abort', onAbort, {once: true});
    });
}
