import {describe, expect, it, vi} from 'vitest';
import {
    AmllLyricsProvider,
    KugouLyricsProvider,
    NeteaseLyricsProvider,
    QqMusicLyricsProvider
} from '@/features/lyrics/providers/builtin';

const query = {
    trackId: 'track',
    title: 'Song',
    artists: ['Artist'],
    album: 'Album',
    durationMs: 180_000
};

function jsonResponse(data: unknown): Response {
    return new Response(JSON.stringify(data), {status: 200, headers: {'Content-Type': 'application/json'}});
}

function toBase64(value: string): string {
    const bytes = new TextEncoder().encode(value);
    let binary = '';
    bytes.forEach(byte => binary += String.fromCharCode(byte));
    return btoa(binary);
}

describe('bundled lyrics providers', () => {
    it('AMLL 搜索 metadata 并延迟获取完整 TTML', async () => {
        const request = vi.fn(async (input: RequestInfo | URL) => {
            const url = String(input);
            if (url.endsWith('/api/search-lyrics')) {
                return jsonResponse([{id: 1, title: 'Song', artists: ['Artist'], platform: 'ncm', file: '1.ttml'}]);
            }
            return new Response('<tt></tt>', {status: 200});
        });
        const provider = new AmllLyricsProvider(request, 'https://amll.test');
        const signal = new AbortController().signal;

        const candidates = await provider.search(query, signal);
        expect(candidates[0].capabilities?.ttml).toBe(true);
        expect(request).toHaveBeenCalledTimes(1);
        await expect(provider.fetch(candidates[0], signal)).resolves.toEqual({kind: 'ttml', ttml: '<tt></tt>'});
    });

    it('网易优先返回 YRC 并携带翻译和音译', async () => {
        const request = vi.fn(async (input: RequestInfo | URL) => String(input).includes('/search/')
            ? jsonResponse({result: {songs: [{id: 1, name: 'Song', ar: [{name: 'Artist'}], al: {name: 'Album'}, dt: 180000}]}})
            : jsonResponse({
                yrc: {lyric: '[0,100](0,100,0)Song'},
                tlyric: {lyric: '[00:00.000]旧翻译'},
                romalrc: {lyric: '[00:00.000]old'},
                ytlrc: {lyric: '[00:00.010]歌'},
                yromalrc: {lyric: '[00:00.010]song'}
            }));
        const provider = new NeteaseLyricsProvider(request);
        const signal = new AbortController().signal;
        const candidates = await provider.search(query, signal);

        await expect(provider.fetch(candidates[0], signal)).resolves.toMatchObject({
            kind: 'yrc',
            translation: '[00:00.010]歌',
            romanization: '[00:00.010]song'
        });
    });

    it('QQ 返回 QRC 及 companion tracks', async () => {
        const request = vi.fn(async (input: RequestInfo | URL) => String(input).includes('client_search')
            ? jsonResponse({data: {song: {list: [{songmid: 'mid', songname: 'Song', singer: [{name: 'Artist'}], interval: 180}]}}})
            : jsonResponse({code: 0, req_0: {code: 0, data: {
                qrc: 1,
                lyric: toBase64('<LyricInfo LyricContent="[0,100]S(0,100)"/>'),
                trans: toBase64('[00:00.000]歌'),
                roma: toBase64('<LyricInfo LyricContent="[0,100]Song(0,100)"/>')
            }}}));
        const provider = new QqMusicLyricsProvider(request);
        const signal = new AbortController().signal;
        const candidates = await provider.search(query, signal);

        await expect(provider.fetch(candidates[0], signal)).resolves.toMatchObject({
            kind: 'qrc',
            lyrics: '[0,100]S(0,100)',
            romanizationQrc: '[0,100]Song(0,100)'
        });
    });

    it('QQ 在 musicu 无结果时回退网页 LRC 接口', async () => {
        const request = vi.fn(async (input: RequestInfo | URL) => {
            const url = String(input);
            if (url.includes('client_search')) {
                return jsonResponse({data: {song: {list: [{songmid: 'mid', songname: 'Song', singer: [{name: 'Artist'}]}]}}});
            }
            if (url.includes('musicu.fcg')) return jsonResponse({code: 0, req_0: {code: 1}});
            return jsonResponse({lyric: '[00:00.000]Song'});
        });
        const provider = new QqMusicLyricsProvider(request);
        const candidates = await provider.search(query, new AbortController().signal);
        await expect(provider.fetch(candidates[0], new AbortController().signal))
            .resolves.toMatchObject({kind: 'lrc', lyrics: '[00:00.000]Song'});
    });

    it('酷狗分离 metadata search 与 KRC fetch', async () => {
        const request = vi.fn(async (input: RequestInfo | URL) => {
            const url = String(input);
            if (url.includes('/song_search_v2')) {
                return jsonResponse({data: {lists: [{FileHash: 'hash', SongName: 'Song', SingerName: 'Artist', Duration: 180}]}});
            }
            if (url.includes('/search?')) return jsonResponse({candidates: [{id: 'lyric', accesskey: 'key'}]});
            return jsonResponse({fmt: 'krc', content: toBase64('krc1payload')});
        });
        const provider = new KugouLyricsProvider(request);
        const signal = new AbortController().signal;
        const candidates = await provider.search(query, signal);

        const payload = await provider.fetch(candidates[0], signal);
        expect(payload.kind).toBe('krc');
        expect(request).toHaveBeenCalledTimes(3);
    });
});
