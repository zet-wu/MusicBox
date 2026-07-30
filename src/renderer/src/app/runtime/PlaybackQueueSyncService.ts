import type {PlaybackState, PlaybackStoreChange, Unsubscribe} from '@/features/playback';
import type {PlaybackQueueSnapshot} from '@api/types/playback';

interface PlaybackQueueStateSource {
    getState(): Readonly<PlaybackState>;
    getPlaybackQueueSnapshot(): PlaybackQueueSnapshot;
    subscribe(listener: (state: Readonly<PlaybackState>, change: PlaybackStoreChange) => void): Unsubscribe;
}

interface PlaybackQueueUI {
    syncQueueEntries(snapshot: PlaybackQueueSnapshot): void;
    setQueueCurrentTrack(index: number): void;
}

interface PlaybackQueueSyncServiceOptions {
    playback: PlaybackQueueStateSource;
    queue: PlaybackQueueUI;
}

export class PlaybackQueueSyncService {
    private readonly playback: PlaybackQueueStateSource;
    private readonly queue: PlaybackQueueUI;
    private unsubscribe: Unsubscribe | null = null;

    constructor({playback, queue}: PlaybackQueueSyncServiceOptions) {
        this.playback = playback;
        this.queue = queue;
    }

    start(): void {
        if (this.unsubscribe) {
            return;
        }

        this.queue.syncQueueEntries(this.playback.getPlaybackQueueSnapshot());

        this.unsubscribe = this.playback.subscribe((nextState, change) => {
            if (change.type === 'playlistChanged') {
                this.queue.syncQueueEntries(this.playback.getPlaybackQueueSnapshot());
                return;
            }

            if (change.type === 'trackIndexChanged') {
                this.queue.setQueueCurrentTrack(nextState.currentIndex);
            }
        });
    }

    dispose(): void {
        this.unsubscribe?.();
        this.unsubscribe = null;
    }
}
