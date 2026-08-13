import {beforeEach, describe, expect, it, vi} from 'vitest';

const parse = vi.fn();
const getLyrics = vi.fn();

vi.mock('../features/mediaAssets/service/LyricsLookupService', () => ({
    lyricsLookupService: {
        parse,
        parseLRC: vi.fn(),
        parseTTML: vi.fn(),
        getLyrics
    }
}));

describe('LyricsContentService', () => {
    beforeEach(() => {
        parse.mockReset();
        getLyrics.mockReset();
    });

    it('元数据不完整时仍优先读取歌曲自带歌词', async () => {
        const {LyricsContentService} = await import('../features/mediaAssets/service/LyricsContentService');
        const lyrics = [{time: 1, content: '内嵌歌词', type: 'line'}];
        const service = new LyricsContentService();

        const result = await service.loadTrackLyrics({
            filePath: 'embedded.flac',
            title: '只有标题',
            artist: '',
            lyrics
        });

        expect(result).toMatchObject({success: true, lyrics, source: 'track'});
        expect(getLyrics).not.toHaveBeenCalled();
    });
});
