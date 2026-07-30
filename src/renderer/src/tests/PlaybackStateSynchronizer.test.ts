import {describe, expect, it, vi} from 'vitest';
import type {Track} from '../api/types/track';
import type {AudioEngineManagerBridge} from '../features/playback/service/AudioEngineAdapter';
import {PlaybackRuntimeState} from '../features/playback/service/PlaybackRuntimeState';
import {PlaybackStateSynchronizer} from '../features/playback/service/PlaybackStateSynchronizer';

const playlistTrack: Track = {
    id: 'library-track-1',
    fileId: 'track-1',
    filePath: 'C:\\Music\\track-1.flac',
    title: '队列标题',
    artist: '艺术家'
};

const engineTrack = {
    filePath: 'C:\\Music\\track-1.flac',
    title: '引擎标题',
    artist: '艺术家',
    duration: 180
};

function createRuntimeState() {
    return new PlaybackRuntimeState({
        playlist: [playlistTrack],
        currentIndex: 0,
        currentTrack: playlistTrack
    });
}

describe('PlaybackStateSynchronizer', () => {
    it('处理曲目切换时保留队列歌曲的稳定身份', () => {
        const runtimeState = createRuntimeState();
        const synchronizer = new PlaybackStateSynchronizer({
            getAudioEngine: () => null,
            runtimeState
        });

        const result = synchronizer.applyTrackChangedState(engineTrack, {
            volume: 0.7,
            playlist: [],
            currentIndex: 0,
            position: 0,
            duration: 180,
            isPlaying: true,
            gaplessEnabled: true,
            currentTrack: engineTrack
        });

        expect(result.playbackState.currentTrack).toMatchObject({
            id: 'library-track-1',
            fileId: 'track-1',
            title: '引擎标题'
        });
        expect(runtimeState.currentTrack?.fileId).toBe('track-1');
    });

    it('从引擎同步状态时保留队列歌曲的稳定身份', async () => {
        const runtimeState = createRuntimeState();
        const audioEngine = {
            getStateSnapshot: vi.fn(async () => ({
                volume: 0.7,
                playlist: [],
                currentIndex: 0,
                position: 20,
                duration: 180,
                isPlaying: true,
                gaplessEnabled: true,
                currentTrack: engineTrack
            }))
        } as unknown as AudioEngineManagerBridge;
        const synchronizer = new PlaybackStateSynchronizer({
            getAudioEngine: () => audioEngine,
            runtimeState
        });

        const result = await synchronizer.syncFromEngine();

        expect(result?.currentTrack).toMatchObject({
            id: 'library-track-1',
            fileId: 'track-1',
            title: '引擎标题'
        });
        expect(runtimeState.currentTrack?.fileId).toBe('track-1');
    });
});
