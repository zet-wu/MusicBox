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

vi.mock('@/infrastructure/electron/DesktopLyricsGateway', () => ({desktopLyricsGateway: gateway}));

describe('DesktopLyricsStateSyncService', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        for (const method of Object.values(gateway)) method.mockResolvedValue({success: true});
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
});
