import {describe, expect, it, vi} from 'vitest';
import type {Track} from '../api/types/track';
import type {
    PlaybackState,
    PlaybackStoreChange,
    PlaybackStoreListener
} from '../features/playback/PlaybackStore';
import {SystemMediaSessionController} from '../features/playback/SystemMediaSessionController';

const track: Track = {
    filePath: 'C:\\Music\\track.flac',
    title: '测试歌曲',
    artist: '测试歌手',
    album: '测试专辑',
    duration: 180
};

function createHarness(overrides: Partial<PlaybackState> = {}) {
    let state: PlaybackState = {
        currentTrack: track,
        currentIndex: 0,
        playlist: [track],
        isPlaying: true,
        position: 20,
        duration: 180,
        volume: 0.7,
        playMode: 'sequence',
        ...overrides
    };
    let listener: PlaybackStoreListener | null = null;
    const actionHandlers = new Map<MediaSessionAction, MediaSessionActionHandler | null>();
    const mediaSession = {
        metadata: null,
        playbackState: 'none',
        setActionHandler: vi.fn((action, handler) => {
            actionHandlers.set(action, handler);
        }),
        setPositionState: vi.fn()
    } as unknown as MediaSession;
    const playback = {
        getState: vi.fn(() => state),
        subscribe: vi.fn((nextListener: PlaybackStoreListener) => {
            listener = nextListener;
            return () => {
                listener = null;
            };
        }),
        play: vi.fn(async () => true),
        pause: vi.fn(async () => true),
        previousTrack: vi.fn(async () => true),
        nextTrack: vi.fn(async () => true),
        seek: vi.fn(async () => true)
    };
    const controller = new SystemMediaSessionController({
        playback,
        mediaSession,
        createMetadata: (init) => init as unknown as MediaMetadata,
        defaultArtwork: 'app://default-cover.svg'
    });

    return {
        actionHandlers,
        controller,
        mediaSession,
        playback,
        emit(change: PlaybackStoreChange, patch: Partial<PlaybackState> = {}) {
            state = {...state, ...patch};
            listener?.(state, change);
        }
    };
}

describe('SystemMediaSessionController', () => {
    it('注册系统媒体动作并转发到统一播放端口', async () => {
        const harness = createHarness();
        harness.controller.start();

        harness.actionHandlers.get('pause')?.({action: 'pause'});
        await vi.waitFor(() => expect(harness.playback.pause).toHaveBeenCalledOnce());

        harness.actionHandlers.get('play')?.({action: 'play'});
        await vi.waitFor(() => expect(harness.playback.play).toHaveBeenCalledOnce());

        harness.actionHandlers.get('previoustrack')?.({action: 'previoustrack'});
        await vi.waitFor(() => expect(harness.playback.previousTrack).toHaveBeenCalledOnce());

        harness.actionHandlers.get('nexttrack')?.({action: 'nexttrack'});
        await vi.waitFor(() => expect(harness.playback.nextTrack).toHaveBeenCalledOnce());

        harness.actionHandlers.get('seekto')?.({action: 'seekto', seekTime: 75});
        await vi.waitFor(() => expect(harness.playback.seek).toHaveBeenCalledWith(75));
    });

    it('同步歌曲元数据、播放状态和合法进度', () => {
        const harness = createHarness();
        harness.controller.start();

        expect(harness.mediaSession.metadata).toEqual({
            title: '测试歌曲',
            artist: '测试歌手',
            album: '测试专辑',
            artwork: [{src: 'app://default-cover.svg'}]
        });
        expect(harness.mediaSession.playbackState).toBe('playing');
        expect(harness.mediaSession.setPositionState).toHaveBeenLastCalledWith({
            duration: 180,
            playbackRate: 1,
            position: 20
        });

        harness.emit(
            {type: 'playbackStateChanged', payload: 'paused'},
            {isPlaying: false}
        );
        expect(harness.mediaSession.playbackState).toBe('paused');
    });

    it('忽略短时间内重复的切歌信号', async () => {
        const harness = createHarness();
        harness.controller.start();

        harness.controller.handleAction('nexttrack');
        harness.controller.handleAction('nexttrack');

        await vi.waitFor(() => expect(harness.playback.nextTrack).toHaveBeenCalledOnce());
    });

    it('阻止过期封面请求覆盖当前歌曲', async () => {
        const artworkResolvers: Array<(value: string | null) => void> = [];
        const harness = createHarness({currentTrack: {...track, cover: null}});
        const controller = new SystemMediaSessionController({
            playback: harness.playback,
            mediaSession: harness.mediaSession,
            createMetadata: (init) => init as unknown as MediaMetadata,
            resolveArtwork: () => new Promise((resolve) => {
                artworkResolvers.push(resolve);
            })
        });
        controller.start();

        const nextTrack = {...track, filePath: 'C:\\Music\\next.flac', title: '下一首'};
        harness.emit({type: 'trackChanged', payload: nextTrack}, {currentTrack: nextTrack});
        artworkResolvers[0]?.('app://stale-cover.jpg');
        await Promise.resolve();

        expect(harness.mediaSession.metadata).toMatchObject({title: '下一首'});
        expect(harness.mediaSession.metadata).not.toMatchObject({
            artwork: [{src: 'app://stale-cover.jpg'}]
        });
    });

    it('销毁时注销动作并清理系统媒体状态', () => {
        const harness = createHarness();
        harness.controller.start();
        harness.controller.dispose();

        expect(harness.mediaSession.metadata).toBeNull();
        expect(harness.mediaSession.playbackState).toBe('none');
        expect(harness.mediaSession.setActionHandler).toHaveBeenCalledWith('nexttrack', null);
        expect(harness.mediaSession.setPositionState).toHaveBeenLastCalledWith();
    });
});
