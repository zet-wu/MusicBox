import {beforeEach, describe, expect, it, vi} from 'vitest';
import type {Track} from '../api/types/track';

const loadTrackLyrics = vi.fn();
const syncLyrics = vi.fn();

vi.mock('../features/mediaAssets/service/LyricsContentService', () => ({
    lyricsContentService: {loadTrackLyrics}
}));

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

describe('LyricsLoaderController', () => {
    beforeEach(() => {
        loadTrackLyrics.mockReset();
        syncLyrics.mockReset();
    });

    it('不同文件即使元数据相同也分别加载歌词', async () => {
        const {LyricsLoaderController} = await import('../ui/widgets/lyrics/LyricsLoaderController');
        loadTrackLyrics.mockResolvedValue({
            success: true,
            lyrics: [{time: 0, content: '歌词'}]
        });
        const setLyrics = vi.fn();
        const controller = new LyricsLoaderController({
            setLyrics,
            renderLyrics: vi.fn(),
            showLoading: vi.fn(),
            showNoLyrics: vi.fn()
        });

        await controller.loadLyrics(createTrack('file-a', 'A.flac'));
        await controller.loadLyrics(createTrack('file-b', 'B.flac'));

        expect(loadTrackLyrics).toHaveBeenCalledTimes(2);
        expect(setLyrics).toHaveBeenCalledTimes(2);
    });

    it('快速切歌时丢弃较早返回的歌词', async () => {
        const {LyricsLoaderController} = await import('../ui/widgets/lyrics/LyricsLoaderController');
        let resolveFirst!: (value: unknown) => void;
        loadTrackLyrics
            .mockImplementationOnce(() => new Promise(resolve => {
                resolveFirst = resolve;
            }))
            .mockResolvedValueOnce({
                success: true,
                lyrics: [{time: 0, content: '第二首'}]
            });
        const setLyrics = vi.fn();
        const controller = new LyricsLoaderController({
            setLyrics,
            renderLyrics: vi.fn(),
            showLoading: vi.fn(),
            showNoLyrics: vi.fn()
        });

        const firstLoad = controller.loadLyrics(createTrack('file-a', 'A.flac'));
        await controller.loadLyrics(createTrack('file-b', 'B.flac'));
        resolveFirst({
            success: true,
            lyrics: [{time: 0, content: '第一首'}]
        });
        await firstLoad;

        expect(setLyrics).toHaveBeenCalledOnce();
        expect(setLyrics).toHaveBeenCalledWith([{time: 0, content: '第二首'}]);
    });
});
