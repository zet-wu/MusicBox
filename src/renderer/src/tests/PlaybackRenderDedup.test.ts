import {describe, expect, it, vi} from 'vitest';
import {PlaybackStore, type PlaybackState} from '../features/playback/PlaybackStore';
import type {Track} from '../api/types/track';

function createState(): PlaybackState {
    return {
        currentTrack: null,
        currentIndex: -1,
        playlist: [],
        isPlaying: false,
        position: 0,
        duration: 0,
        volume: 1,
        playMode: 'sequence'
    };
}

describe('播放状态渲染去重', () => {
    it('重复提交标量状态时不发布变更', () => {
        const store = new PlaybackStore(createState());
        const listener = vi.fn();
        store.subscribe(listener);

        store.setTrackIndex(-1);
        store.setPlaybackState('paused');
        store.setPosition(0);
        store.setDuration(0);
        store.setVolume(1);
        store.setPlayMode('sequence');

        expect(listener).not.toHaveBeenCalled();
    });

    it('真实变更发布一次，相同曲目引用不重复发布', () => {
        const store = new PlaybackStore(createState());
        const listener = vi.fn();
        const track = {fileId: 'track-1', filePath: 'track-1.mp3'} as Track;
        store.subscribe(listener);

        store.setTrack(track);
        store.setTrack(track);

        expect(listener).toHaveBeenCalledOnce();
        expect(listener.mock.calls[0][1]).toEqual({type: 'trackChanged', payload: track});
    });
});
