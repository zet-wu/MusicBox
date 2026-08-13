import {beforeEach, describe, expect, it, vi} from 'vitest';
import type {Track} from '../api/types/track';

const loadTrackCover = vi.fn();
const normalizeImageUrl = vi.fn();
const isValidUrl = vi.fn();

vi.mock('../features/mediaAssets/service/LyricsCoverArtService', () => ({
    lyricsCoverArtService: {loadTrackCover, normalizeImageUrl}
}));

vi.mock('../utils/URLValidator', () => ({
    urlValidator: {isValidUrl}
}));

const createTrack = (fileId: string): Track => ({
    fileId,
    filePath: `${fileId}.flac`,
    title: fileId,
    artist: '歌手'
});

describe('歌词页歌曲资源切换', () => {
    beforeEach(() => {
        loadTrackCover.mockReset();
        normalizeImageUrl.mockReset();
        isValidUrl.mockReset();
    });

    it('连续切歌时不会因为旧更新进行中而丢弃最新歌曲', async () => {
        const {LyricsTrackInfoController} = await import('../ui/widgets/lyrics/LyricsTrackInfoController');
        let resolveFirst!: () => void;
        const firstLoad = new Promise<void>(resolve => {
            resolveFirst = resolve;
        });
        const loadLyrics = vi.fn()
            .mockReturnValueOnce(firstLoad)
            .mockResolvedValue(undefined);
        const updateCoverArt = vi.fn().mockResolvedValue(undefined);
        const title = {textContent: ''} as HTMLElement;
        const artist = {textContent: ''} as HTMLElement;
        const controller = new LyricsTrackInfoController({
            elements: {trackTitle: title, trackArtist: artist},
            updateTrackDuration: vi.fn(),
            loadLyrics,
            updateCoverArt
        });

        const updateA = controller.updateTrackInfo(createTrack('A'));
        const updateB = controller.updateTrackInfo(createTrack('B'));
        const updateC = controller.updateTrackInfo(createTrack('C'));
        resolveFirst();
        await Promise.all([updateA, updateB, updateC]);

        expect(loadLyrics).toHaveBeenCalledTimes(3);
        expect(updateCoverArt).toHaveBeenCalledTimes(3);
        expect(title.textContent).toBe('C');
    });

    it('较晚返回的旧封面不会覆盖当前歌曲封面', async () => {
        const {LyricsCoverArtController} = await import('../ui/widgets/lyrics/LyricsCoverArtController');
        let resolveFirst!: (value: unknown) => void;
        loadTrackCover
            .mockImplementationOnce(() => new Promise(resolve => {
                resolveFirst = resolve;
            }))
            .mockResolvedValueOnce({success: true, imageUrl: 'https://example.com/B.jpg'});
        normalizeImageUrl.mockImplementation(async (url: string) => url);
        isValidUrl.mockResolvedValue(true);
        const trackCover = {
            src: '',
            classList: {add: vi.fn(), remove: vi.fn()}
        } as unknown as HTMLImageElement;
        const background = {
            style: {backgroundImage: ''}
        } as HTMLElement;
        const controller = new LyricsCoverArtController({background, trackCover});

        const updateA = controller.updateCoverArt(createTrack('A'));
        await Promise.resolve();
        await controller.updateCoverArt(createTrack('B'));
        resolveFirst({success: true, imageUrl: 'https://example.com/A.jpg'});
        await updateA;

        expect(trackCover.src).toBe('https://example.com/B.jpg');
        expect(background.style.backgroundImage).toContain('B.jpg');
    });
});
