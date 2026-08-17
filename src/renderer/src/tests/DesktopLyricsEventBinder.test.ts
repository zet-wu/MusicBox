import {beforeEach, describe, expect, it, vi} from 'vitest';

const handlers = vi.hoisted(() => new Map<string, (value: unknown) => void>());
const unsubscribes = vi.hoisted(() => Array.from({length: 6}, () => vi.fn()));
const windowService = vi.hoisted(() => {
    let subscriptionIndex = 0;
    const subscribe = (name: string) => vi.fn((handler: (value: unknown) => void) => {
        handlers.set(name, handler);
        return unsubscribes[subscriptionIndex++];
    });
    return {
        close: vi.fn(),
        onLyricsUpdated: subscribe('lyrics'),
        onPositionChanged: subscribe('position'),
        onTimelinePreviewChanged: subscribe('preview'),
        onPlaybackStateChanged: subscribe('playback'),
        onTrackChanged: subscribe('track'),
        onSettingsChanged: subscribe('settings'),
        resetSubscriptions: () => { subscriptionIndex = 0; }
    };
});

vi.mock('@/features/desktopLyrics/service', () => ({
    desktopLyricsWindowService: windowService
}));

describe('DesktopLyricsEventBinder', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        handlers.clear();
        windowService.resetSubscriptions();
    });

    it('转发预览事件并在销毁时卸载全部 IPC 订阅', async () => {
        const {DesktopLyricsEventBinder} = await import('@/features/desktopLyrics/DesktopLyricsEventBinder');
        const lyricsView = {
            updateLyrics: vi.fn(),
            updatePosition: vi.fn(() => 0),
            updateTimelinePreview: vi.fn(),
            setPlaying: vi.fn(),
            reset: vi.fn()
        };
        const binder = new DesktopLyricsEventBinder({
            elements: {
                lockBtn: new EventTarget(),
                closeBtn: new EventTarget()
            } as never,
            lockController: {
                toggle: vi.fn(),
                bindControlHover: vi.fn()
            } as never,
            lyricsView: lyricsView as never,
            settingsController: {updateSettings: vi.fn()} as never,
            setPlaybackState: vi.fn()
        });

        binder.bind();
        handlers.get('preview')?.(-300);
        binder.destroy();

        expect(lyricsView.updateTimelinePreview).toHaveBeenCalledWith(-300);
        for (const unsubscribe of unsubscribes) expect(unsubscribe).toHaveBeenCalledOnce();
    });
});
