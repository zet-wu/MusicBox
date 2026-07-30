import type {Track} from '@api/types/track';
import {getTrackPath, isSameTrack} from '../domain/TrackIdentity';
import type {AudioEngineState} from './audioEngine';
import type {AudioEngineManagerBridge} from './AudioEngineAdapter';
import type {PlaybackRuntimeState} from './PlaybackRuntimeState';

type PlaybackState = {
    currentTrack: Track | null;
    duration: number;
    currentIndex: number;
    position: number;
    isPlaying: boolean;
};

type PlaybackStateSynchronizerOptions = {
    getAudioEngine: () => AudioEngineManagerBridge | null;
    runtimeState: PlaybackRuntimeState;
};

export class PlaybackStateSynchronizer {
    private readonly getAudioEngine: () => AudioEngineManagerBridge | null;
    private readonly runtimeState: PlaybackRuntimeState;

    constructor({getAudioEngine, runtimeState}: PlaybackStateSynchronizerOptions) {
        this.getAudioEngine = getAudioEngine;
        this.runtimeState = runtimeState;
    }

    async syncFromEngine(overrides: Partial<AudioEngineState> = {}): Promise<PlaybackState | null> {
        const audioEngine = this.getAudioEngine();
        if (!audioEngine) {
            return null;
        }

        const state = {
            ...await audioEngine.getStateSnapshot(),
            ...overrides
        };

        const playbackState = {
            currentTrack: this.mergeWithPlaylistTrack(state.currentTrack, state.currentIndex),
            duration: state.duration,
            currentIndex: state.currentIndex,
            position: state.position,
            isPlaying: state.isPlaying
        };

        this.runtimeState.patch(playbackState);
        return playbackState;
    }

    applyTrackChangedState(track: unknown, state: AudioEngineState): {
        playbackState: PlaybackState;
        previousIndex: number;
        indexChanged: boolean;
    } {
        const currentState = this.runtimeState.getSnapshot();
        const previousIndex = currentState.currentIndex;
        const playbackState = {
            currentTrack: this.mergeWithPlaylistTrack(track, state.currentIndex),
            duration: state.duration,
            currentIndex: state.currentIndex,
            position: state.position,
            isPlaying: state.isPlaying
        };

        this.runtimeState.patch(playbackState);
        return {
            playbackState,
            previousIndex,
            indexChanged: previousIndex !== playbackState.currentIndex
        };
    }

    private mergeWithPlaylistTrack(track: unknown, currentIndex: number): Track | null {
        if (!track) {
            return null;
        }

        if (typeof track !== 'object') {
            return track as Track;
        }

        const engineTrack = track as Track;
        const playlist = this.runtimeState.playlist;
        const indexedTrack = playlist[currentIndex];
        const enginePath = getTrackPath(engineTrack);
        const playlistTrack = (
            indexedTrack && (!enginePath || isSameTrack(indexedTrack, engineTrack))
                ? indexedTrack
                : playlist.find((candidate) => isSameTrack(candidate, engineTrack))
        );

        if (!playlistTrack) {
            return engineTrack;
        }

        return {
            ...playlistTrack,
            ...engineTrack,
            id: playlistTrack.id || engineTrack.id,
            fileId: playlistTrack.fileId || engineTrack.fileId
        };
    }
}
