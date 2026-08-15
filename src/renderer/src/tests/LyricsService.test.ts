import {beforeEach, describe, expect, it, vi} from 'vitest';
import {LyricsProviderRegistry} from '@/features/lyrics/providers/LyricsProviderRegistry';
import {LyricsSearchService} from '@/features/lyrics/service/LyricsSearchService';
import {LyricsService} from '@/features/lyrics/service/LyricsService';

const gateway = vi.hoisted(() => ({
    readCanonical: vi.fn(),
    saveCanonical: vi.fn(),
    clearBinding: vi.fn(),
    getEmbedded: vi.fn(),
    searchLocalFiles: vi.fn(),
    readLocalFile: vi.fn()
}));

vi.mock('@/infrastructure/electron', () => ({lyricsGateway: gateway}));

const track = {
    fileId: 'track-1',
    title: 'Song',
    artist: 'Artist',
    album: 'Album',
    duration: 180,
    filePath: 'C:\\Music\\Song.flac'
};
const source = {kind: 'provider', providerId: 'test', candidateId: 'candidate', manuallySelected: true} as const;
const document = {ttmlText: '<tt/>', ttml: {metadata: {}, lines: []}, render: {metadata: [], lines: []}, source};
const normalizer = {
    fromTtml: vi.fn(() => document),
    fromPayload: vi.fn(() => document),
    fromLrc: vi.fn(() => document)
};

describe('LyricsService', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        gateway.saveCanonical.mockResolvedValue({success: true, binding: {trackId: 'track-1', source}});
        gateway.clearBinding.mockResolvedValue({success: true, cleared: true});
    });

    it('优先读取持久化 manual binding，不被自动搜索覆盖', async () => {
        gateway.readCanonical.mockResolvedValue({
            success: true,
            ttml: '<tt/>',
            binding: {trackId: 'track-1', canonicalTtmlPath: 'canonical.ttml', source, updatedAt: 1}
        });
        const provider = {id: 'test', displayName: 'Test', search: vi.fn(), fetch: vi.fn()};
        const registry = new LyricsProviderRegistry();
        registry.register(provider);
        const service = new LyricsService({
            providers: registry,
            localSource: {find: vi.fn()} as never,
            embeddedSource: {find: vi.fn()} as never,
            normalizer: normalizer as never
        });

        const result = await service.load(track, new AbortController().signal);

        expect(result.document).toBe(document);
        expect(provider.search).not.toHaveBeenCalled();
    });

    it('手动应用候选后保存 canonical TTML 与 manual provenance', async () => {
        const provider = {
            id: 'test',
            displayName: 'Test',
            search: vi.fn(),
            fetch: vi.fn().mockResolvedValue({kind: 'ttml', ttml: '<tt/>'})
        };
        const registry = new LyricsProviderRegistry();
        registry.register(provider);
        const service = new LyricsService({
            providers: registry,
            localSource: {find: vi.fn()} as never,
            normalizer: normalizer as never
        });

        await service.applyCandidate(
            {trackId: 'track-1', title: 'Song', artists: ['Artist']},
            {providerId: 'test', candidateId: 'candidate', title: 'Song', artists: ['Artist'], matchScore: 100},
            true,
            new AbortController().signal
        );

        expect(normalizer.fromPayload).toHaveBeenCalledWith(
            {kind: 'ttml', ttml: '<tt/>'},
            expect.objectContaining({source})
        );
        expect(gateway.saveCanonical).toHaveBeenCalledWith('track-1', '<tt/>', source);
    });

    it('provider 搜索状态彼此隔离', async () => {
        const registry = new LyricsProviderRegistry();
        registry.register({
            id: 'ok', displayName: 'OK', fetch: vi.fn(),
            search: vi.fn().mockResolvedValue([])
        });
        registry.register({
            id: 'failed', displayName: 'Failed', fetch: vi.fn(),
            search: vi.fn().mockRejectedValue(new Error('timeout'))
        });

        const results = await new LyricsSearchService(registry).searchAll(
            {trackId: 'track-1', title: 'Song', artists: ['Artist']},
            new AbortController().signal
        );

        expect(results.map(result => result.state)).toEqual(['success', 'error']);
    });
});
