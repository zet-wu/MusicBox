import {describe, expect, it, vi} from 'vitest';
import {fetchJson, LyricsHttpError, providerRequestPolicy} from '@/features/lyrics/providers/builtin/shared';

describe('lyrics provider transport', () => {
    it('对可重试 HTTP 错误做有界重试', async () => {
        const request = vi.fn()
            .mockResolvedValueOnce(new Response('', {status: 503}))
            .mockResolvedValueOnce(new Response(JSON.stringify({ok: true}), {status: 200}));

        const result = await fetchJson<{ok: boolean}>(
            request,
            'https://example.test/lyrics',
            new AbortController().signal
        );

        expect(result).toEqual({ok: true});
        expect(request).toHaveBeenCalledTimes(2);
    });

    it('不重试不可恢复的 HTTP 错误', async () => {
        const request = vi.fn().mockResolvedValue(new Response('', {status: 404}));

        await expect(fetchJson(request, 'https://example.test/lyrics', new AbortController().signal))
            .rejects.toEqual(expect.objectContaining<LyricsHttpError>({status: 404, retryable: false}));
        expect(request).toHaveBeenCalledTimes(1);
    });

    it('为 QQ 使用严格于其他来源的串行调度', () => {
        expect(providerRequestPolicy('qqmusic')).toEqual({concurrency: 1, minimumIntervalMs: 220});
        expect(providerRequestPolicy('netease').concurrency).toBe(2);
        expect(providerRequestPolicy('kugou').concurrency).toBe(2);
        expect(providerRequestPolicy('amll').concurrency).toBe(2);
    });
});
