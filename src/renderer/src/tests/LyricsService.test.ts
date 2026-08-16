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
const source = {kind: 'provider', providerId: 'test', candidateId: 'candidate'} as const;
const document = {ttmlText: '<tt/>', ttml: {metadata: {}, lines: []}, render: {metadata: [], lines: []}, source};
const normalizer = {
    fromTtml: vi.fn(() => document),
    fromPayload: vi.fn(() => document),
    fromLrc: vi.fn(() => document)
};
const manualSources = [
    source,
    {kind: 'local', path: 'Song.lrc'},
    {kind: 'embedded', trackId: 'track-1'}
] as const;

describe('LyricsService', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        gateway.saveCanonical.mockResolvedValue({success: true, binding: {trackId: 'track-1', source, selectionMode: 'manual'}});
        gateway.clearBinding.mockResolvedValue({success: true, cleared: true});
    });

    it.each(manualSources)('优先读取持久化 manual $kind binding，不被自动搜索覆盖', async manualSource => {
        gateway.readCanonical.mockResolvedValue({
            success: true,
            ttml: '<tt/>',
            binding: {
                trackId: 'track-1', canonicalTtmlPath: 'canonical.ttml', source: manualSource,
                selectionMode: 'manual', updatedAt: 1
            }
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
            new AbortController().signal
        );

        expect(normalizer.fromPayload).toHaveBeenCalledWith(
            {kind: 'ttml', ttml: '<tt/>'},
            expect.objectContaining({source})
        );
        expect(gateway.saveCanonical).toHaveBeenCalledWith('track-1', '<tt/>', source, 'manual');
    });

    it('本地歌词存在时只使用 find 返回项生成预览并手动应用', async () => {
        const localDocument = {...document, source: {kind: 'local', path: 'Song.lrc'} as const};
        const localSource = {
            find: vi.fn().mockResolvedValue({kind: 'lrc', path: 'Song.lrc', content: '[00:00]Song'})
        };
        const localNormalizer = {fromLrc: vi.fn(() => localDocument)};
        const registry = new LyricsProviderRegistry();
        const service = new LyricsService({
            providers: registry,
            localSource: localSource as never,
            normalizer: localNormalizer as never
        });

        const preview = await service.previewLocal({trackId: 'track-1', title: 'Song', artists: ['Artist']});
        expect(preview).toEqual({document: localDocument, format: 'lrc'});
        expect(localSource.find).toHaveBeenCalledTimes(1);
        expect(localNormalizer.fromLrc).toHaveBeenCalledWith(
            '[00:00]Song',
            expect.objectContaining({source: {kind: 'local', path: 'Song.lrc'}})
        );

        await service.applyPreview({trackId: 'track-1', title: 'Song', artists: ['Artist']}, preview!);
        expect(gateway.saveCanonical).toHaveBeenCalledWith(
            'track-1', '<tt/>', {kind: 'local', path: 'Song.lrc'}, 'manual'
        );
    });

    it('本地歌词不存在时返回空预览', async () => {
        const service = new LyricsService({
            providers: new LyricsProviderRegistry(),
            localSource: {find: vi.fn().mockResolvedValue(null)} as never,
            normalizer: normalizer as never
        });

        await expect(service.previewLocal({trackId: 'track-1', title: 'Song', artists: []})).resolves.toBeNull();
    });

    it('内嵌歌词存在时生成预览并以 manual binding 应用', async () => {
        const embeddedDocument = {...document, source: {kind: 'embedded', trackId: 'track-1'} as const};
        const embeddedSource = {find: vi.fn().mockResolvedValue({kind: 'lrc', lyrics: '[00:00]Song'})};
        const embeddedNormalizer = {fromPayload: vi.fn(() => embeddedDocument)};
        const service = new LyricsService({
            providers: new LyricsProviderRegistry(),
            localSource: {find: vi.fn()} as never,
            embeddedSource: embeddedSource as never,
            normalizer: embeddedNormalizer as never
        });

        const preview = await service.previewEmbedded({trackId: 'track-1', title: 'Song', artists: []});
        expect(preview).toEqual({document: embeddedDocument, format: 'lrc'});
        expect(embeddedSource.find).toHaveBeenCalledTimes(1);
        expect(embeddedNormalizer.fromPayload).toHaveBeenCalledWith(
            {kind: 'lrc', lyrics: '[00:00]Song'},
            expect.objectContaining({source: {kind: 'embedded', trackId: 'track-1'}})
        );

        await service.applyPreview({trackId: 'track-1', title: 'Song', artists: []}, preview!);
        expect(gateway.saveCanonical).toHaveBeenCalledWith(
            'track-1', '<tt/>', {kind: 'embedded', trackId: 'track-1'}, 'manual'
        );
    });

    it('内嵌歌词不存在时返回空预览', async () => {
        const service = new LyricsService({
            providers: new LyricsProviderRegistry(),
            localSource: {find: vi.fn()} as never,
            embeddedSource: {find: vi.fn().mockResolvedValue(null)} as never,
            normalizer: normalizer as never
        });

        await expect(service.previewEmbedded({trackId: 'track-1', title: 'Song', artists: []})).resolves.toBeNull();
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
        expect(gateway.saveCanonical).toHaveBeenCalledWith('track-1', '<tt/>', source, 'manual');
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
            source: {kind: 'provider', providerId: 'test', candidateId: 'word'}
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
        expect(gateway.saveCanonical).toHaveBeenCalledWith('track-1', '<tt/>', onlineDocument.source, 'auto');
    });

    it('同一 identity 分箱内优先尝试高质量逐字候选', async () => {
        gateway.readCanonical.mockResolvedValue({success: false});
        const lineDocument = {
            ...document,
            ttml: {metadata: {timingMode: 'Line'}, lines: []},
            source: {kind: 'provider', providerId: 'test', candidateId: 'line'}
        };
        const wordDocument = {
            ...document,
            ttml: {metadata: {timingMode: 'Word'}, lines: []},
            source: {kind: 'provider', providerId: 'test', candidateId: 'word'}
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
