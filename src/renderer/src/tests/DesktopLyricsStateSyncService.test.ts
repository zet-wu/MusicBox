import {beforeEach, describe, expect, it, vi} from 'vitest';
import {DesktopLyricsStateSyncService} from '@/features/desktopLyrics/service/DesktopLyricsStateSyncService';

const gateway = vi.hoisted(() => ({
    updateSettings: vi.fn(),
    updatePlaybackState: vi.fn(),
    updatePosition: vi.fn(),
    updateTimelinePreview: vi.fn(),
    updateTrack: vi.fn(),
    updateLyrics: vi.fn()
}));
const loadLyrics = vi.hoisted(() => vi.fn());

vi.mock('@/infrastructure/electron/DesktopLyricsGateway', () => ({desktopLyricsGateway: gateway}));
vi.mock('@/features/lyrics/service/defaultLyricsServices', () => ({
    getLyricsService: () => ({load: loadLyrics})
}));

describe('DesktopLyricsStateSyncService', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        for (const method of Object.values(gateway)) method.mockResolvedValue({success: true});
        loadLyrics.mockResolvedValue({document: null});
    });

    it('桌面窗口打开时先同步播放详情页歌词字体设置', async () => {
        const settings = {
            lyricsFontFamily: 'serif',
            lyricsFontSize: 40,
            lyricsCustomLatinFont: '',
            lyricsCustomCjkFont: ''
        };
        const service = new DesktopLyricsStateSyncService({
            getCurrentState: () => ({currentTrack: null, isPlaying: false, position: 12}),
            getCurrentSettings: () => settings
        });

        await service.syncCurrentStateToDesktopLyrics();

        expect(gateway.updateSettings).toHaveBeenCalledWith(settings);
        expect(gateway.updateSettings.mock.invocationCallOrder[0])
            .toBeLessThan(gateway.updatePlaybackState.mock.invocationCallOrder[0]);
        expect(gateway.updateTimelinePreview).toHaveBeenCalledWith(0);
    });

    it('仅同步桌面歌词预览偏移数字', async () => {
        const service = new DesktopLyricsStateSyncService({
            getCurrentState: () => ({currentTrack: null, isPlaying: false, position: 0}),
            getCurrentSettings: () => ({})
        });

        await service.syncToDesktopLyrics('timelinePreview', -500);

        expect(gateway.updateTimelinePreview).toHaveBeenCalledWith(-500);
        expect(gateway.updateLyrics).not.toHaveBeenCalled();
    });

    it('切歌不等待联网歌词，旧请求返回后也不会覆盖新歌词', async () => {
        let resolveFirst!: (value: unknown) => void;
        loadLyrics
            .mockImplementationOnce(() => new Promise(resolve => { resolveFirst = resolve; }))
            .mockResolvedValueOnce({document: {render: {lines: ['第二首']}}});
        const service = new DesktopLyricsStateSyncService({
            getCurrentState: () => ({currentTrack: null, isPlaying: true, position: 0}),
            getCurrentSettings: () => ({})
        });
        const first = {fileId: 'first', filePath: 'first.flac', title: '第一首', artist: '歌手'};
        const second = {fileId: 'second', filePath: 'second.flac', title: '第二首', artist: '歌手'};

        await service.syncToDesktopLyrics('track', first);
        expect(loadLyrics).toHaveBeenCalledTimes(1);
        await service.syncToDesktopLyrics('track', second);
        expect(loadLyrics).toHaveBeenCalledTimes(2);
        expect((loadLyrics.mock.calls[0][1] as AbortSignal).aborted).toBe(true);
        resolveFirst({document: {render: {lines: ['第一首']}}});
        await vi.waitFor(() => expect(gateway.updateLyrics).toHaveBeenCalledTimes(1));
        expect(gateway.updateLyrics).toHaveBeenCalledWith(['第二首']);
    });
});
