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
            {providerId: 'test', candidateId: 'candidate', title: 'Song', artists: ['Artist'], identityScore: 100, qualityScore: 0},
            true,
            new AbortController().signal
        );

        expect(normalizer.fromPayload).toHaveBeenCalledWith(
            {kind: 'ttml', ttml: '<tt/>'},
            expect.objectContaining({source})
        );
        expect(gateway.saveCanonical).toHaveBeenCalledWith('track-1', '<tt/>', source);
    });

    it('预览候选时返回实际获取的原始格式', async () => {
        const provider = {
            id: 'test',
            displayName: 'Test',
            search: vi.fn(),
            fetch: vi.fn().mockResolvedValue({kind: 'qrc', lyrics: '[0,100]S(0,100)'})
        };
        const registry = new LyricsProviderRegistry();
        registry.register(provider);
        const service = new LyricsService({
            providers: registry,
            localSource: {find: vi.fn()} as never,
            normalizer: normalizer as never
        });

        const result = await service.previewCandidate(
            {trackId: 'track-1', title: 'Song', artists: ['Artist']},
            {providerId: 'test', candidateId: 'candidate', title: 'Song', artists: ['Artist'], identityScore: 100, qualityScore: 0},
            new AbortController().signal
        );

        expect(result).toEqual({document, format: 'qrc'});
    });

    it('应用候选预览时直接保存已解析文档而不再请求来源', async () => {
        const provider = {id: 'test', displayName: 'Test', search: vi.fn(), fetch: vi.fn()};
        const registry = new LyricsProviderRegistry();
        registry.register(provider);
        const service = new LyricsService({
            providers: registry,
            localSource: {find: vi.fn()} as never,
            normalizer: normalizer as never
        });

        const result = await service.applyPreview(
            {trackId: 'track-1', title: 'Song', artists: ['Artist']},
            {document, format: 'qrc'}
        );

        expect(result.document).toBe(document);
        expect(provider.fetch).not.toHaveBeenCalled();
        expect(gateway.saveCanonical).toHaveBeenCalledWith('track-1', '<tt/>', source);
    });

    it('高匹配在线逐字歌词优先于本地逐行歌词', async () => {
        gateway.readCanonical.mockResolvedValue({success: false});
        const localDocument = {
            ...document,
            ttml: {metadata: {timingMode: 'Line'}, lines: []},
            source: {kind: 'local', path: 'Song.lrc'}
        };
        const onlineDocument = {
            ...document,
            ttml: {metadata: {timingMode: 'Word'}, lines: []},
            source: {kind: 'provider', providerId: 'test', candidateId: 'word', manuallySelected: false}
        };
        const testNormalizer = {
            fromLrc: vi.fn(() => localDocument),
            fromPayload: vi.fn(() => onlineDocument)
        };
        const provider = {
            id: 'test', displayName: 'Test',
            search: vi.fn().mockResolvedValue([{
                providerId: 'test', candidateId: 'word', title: 'Song', artists: ['Artist'], identityScore: 90, qualityScore: 40
            }]),
            fetch: vi.fn().mockResolvedValue({kind: 'yrc', lyrics: '[0,100]S(0,100) Artist'})
        };
        const registry = new LyricsProviderRegistry();
        registry.register(provider);
        const service = new LyricsService({
            providers: registry,
            localSource: {find: vi.fn().mockResolvedValue({kind: 'lrc', path: 'Song.lrc', content: '[00:00]Song'})} as never,
            embeddedSource: {find: vi.fn().mockResolvedValue(null)} as never,
            normalizer: testNormalizer as never
        });

        const result = await service.load(track, new AbortController().signal);

        expect(result.document).toBe(onlineDocument);
        expect(gateway.saveCanonical).toHaveBeenCalledWith('track-1', '<tt/>', onlineDocument.source);
    });

    it('同一 identity 分箱内优先尝试高质量逐字候选', async () => {
        gateway.readCanonical.mockResolvedValue({success: false});
        const lineDocument = {
            ...document,
            ttml: {metadata: {timingMode: 'Line'}, lines: []},
            source: {kind: 'provider', providerId: 'test', candidateId: 'line', manuallySelected: false}
        };
        const wordDocument = {
            ...document,
            ttml: {metadata: {timingMode: 'Word'}, lines: []},
            source: {kind: 'provider', providerId: 'test', candidateId: 'word', manuallySelected: false}
        };
        const provider = {
            id: 'test', displayName: 'Test',
            search: vi.fn().mockResolvedValue([
                {providerId: 'test', candidateId: 'line', title: 'Song', artists: ['Artist'], identityScore: 95, qualityScore: 0},
                {providerId: 'test', candidateId: 'word', title: 'Song', artists: ['Artist'], identityScore: 90, qualityScore: 40}
            ]),
            fetch: vi.fn((candidate: {candidateId: string}) => Promise.resolve(candidate.candidateId === 'line'
                ? {kind: 'lrc', lyrics: '[00:00]Song'}
                : {kind: 'qrc', lyrics: '[0,100]S(0,100)'}))
        };
        const registry = new LyricsProviderRegistry();
        registry.register(provider);
        const service = new LyricsService({
            providers: registry,
            localSource: {find: vi.fn().mockResolvedValue(null)} as never,
            embeddedSource: {find: vi.fn().mockResolvedValue(null)} as never,
            normalizer: {
                fromPayload: vi.fn((payload: {kind: string}) => payload.kind === 'lrc' ? lineDocument : wordDocument)
            } as never
        });

        const result = await service.load(track, new AbortController().signal);

        expect(result.document).toBe(wordDocument);
        expect(provider.fetch).toHaveBeenCalledTimes(1);
    });

    it('低匹配在线候选不会覆盖本地歌词', async () => {
        gateway.readCanonical.mockResolvedValue({success: false});
        const localDocument = {
            ...document,
            ttml: {metadata: {timingMode: 'Line'}, lines: []},
            source: {kind: 'local', path: 'Song.lrc'}
        };
        const provider = {
            id: 'test', displayName: 'Test',
            search: vi.fn().mockResolvedValue([{
                providerId: 'test', candidateId: 'weak', title: 'Other', artists: ['Other'], identityScore: 54, qualityScore: 100
            }]),
            fetch: vi.fn()
        };
        const registry = new LyricsProviderRegistry();
        registry.register(provider);
        const service = new LyricsService({
            providers: registry,
            localSource: {find: vi.fn().mockResolvedValue({kind: 'lrc', path: 'Song.lrc', content: '[00:00]Song'})} as never,
            embeddedSource: {find: vi.fn().mockResolvedValue(null)} as never,
            normalizer: {fromLrc: vi.fn(() => localDocument)} as never
        });

        const result = await service.load(track, new AbortController().signal);

        expect(result.document).toBe(localDocument);
        expect(provider.fetch).not.toHaveBeenCalled();
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
