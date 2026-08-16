import {beforeEach, describe, expect, it, vi} from 'vitest';
import type {Track} from '../api/types/track';

const syncLyrics = vi.fn();

vi.mock('../features/desktopLyrics/service/DesktopLyricsService', () => ({
    desktopLyricsService: {syncLyrics}
}));

const createTrack = (fileId: string, filePath: string): Track => ({
    fileId,
    filePath,
    title: '同名歌曲',
    artist: '同名歌手',
    album: '同名专辑'
});

const createDocument = (text: string) => ({
    ttmlText: '<tt/>',
    ttml: {metadata: {}, lines: []},
    render: {
        metadata: [],
        lines: [{
            words: [{word: text, startTime: 0, endTime: 1000}],
            translatedLyric: '', romanLyric: '', isBG: false, isDuet: false,
            startTime: 0, endTime: 1000
        }]
    },
    source: {kind: 'embedded', trackId: 'track'} as const
});

describe('LyricsLoaderController', () => {
    beforeEach(() => syncLyrics.mockReset());

    it('不同文件即使元数据相同也分别加载歌词', async () => {
        const {LyricsLoaderController} = await import('../ui/widgets/lyrics/LyricsLoaderController');
        const load = vi.fn().mockResolvedValue({document: createDocument('歌词'), binding: {trackId: 'track'}});
        const setDocument = vi.fn();
        const controller = new LyricsLoaderController({
            setDocument,
            showLoading: vi.fn(),
            showNoLyrics: vi.fn(),
            service: {load} as never
        });

        await controller.loadLyrics(createTrack('file-a', 'A.flac'));
        await controller.loadLyrics(createTrack('file-b', 'B.flac'));

        expect(load).toHaveBeenCalledTimes(2);
        expect(setDocument).toHaveBeenCalledTimes(2);
        expect(setDocument).toHaveBeenLastCalledWith(createDocument('歌词'), true);
    });

    it('快速切歌时中止并丢弃较早返回的歌词', async () => {
        const {LyricsLoaderController} = await import('../ui/widgets/lyrics/LyricsLoaderController');
        let resolveFirst!: (value: unknown) => void;
        const load = vi.fn()
            .mockImplementationOnce(() => new Promise(resolve => resolveFirst = resolve))
            .mockResolvedValueOnce({document: createDocument('第二首'), binding: {trackId: 'track'}});
        const setDocument = vi.fn();
        const controller = new LyricsLoaderController({
            setDocument,
            showLoading: vi.fn(),
            showNoLyrics: vi.fn(),
            service: {load} as never
        });

        const firstLoad = controller.loadLyrics(createTrack('file-a', 'A.flac'));
        await controller.loadLyrics(createTrack('file-b', 'B.flac'));
        resolveFirst({document: createDocument('第一首'), binding: {trackId: 'track'}});
        await firstLoad;

        expect(setDocument).toHaveBeenCalledOnce();
        expect(setDocument).toHaveBeenCalledWith(createDocument('第二首'), true);
        const firstSignal = load.mock.calls[0][1] as AbortSignal;
        expect(firstSignal.aborted).toBe(true);
    });

    it('canonical 保存失败时仍显示歌词但标记为不可编辑', async () => {
        const {LyricsLoaderController} = await import('../ui/widgets/lyrics/LyricsLoaderController');
        const setDocument = vi.fn();
        const controller = new LyricsLoaderController({
            setDocument,
            showLoading: vi.fn(),
            showNoLyrics: vi.fn(),
            service: {load: vi.fn().mockResolvedValue({document: createDocument('歌词')})} as never
        });

        await controller.loadLyrics(createTrack('file-a', 'A.flac'));

        expect(setDocument).toHaveBeenCalledWith(createDocument('歌词'), false);
    });
});
