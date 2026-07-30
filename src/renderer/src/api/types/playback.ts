import type {Track} from './track';

export type PlayMode = 'sequence' | 'shuffle' | 'repeat-one';

export type PlaybackStateName = 'playing' | 'paused' | 'stopped';

export type QueueAdvanceReason = 'track-ended' | 'manual-next' | 'manual-previous';

export interface QueueEntry {
    queueId: string;
    track: Track;
}

export interface QueueMutationResult {
    added: number;
    moved: number;
    skippedExisting: number;
    skippedCurrent: number;
    startedPlayback: boolean;
}

export interface PlaybackQueueSnapshot {
    entries: QueueEntry[];
    currentQueueId: string | null;
    playMode: PlayMode;
}

export interface PlaybackStateSnapshot {
    currentTrack: Track | null;
    position: number;
    isPlaying: boolean;
    playlist: Track[];
    currentIndex: number;
    playMode: PlayMode;
    queue?: PlaybackQueueSnapshot;
    timestamp?: number;
}

export interface DesktopLyricsPlaybackState {
    isPlaying: boolean;
    position: number;
}
