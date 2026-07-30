import type {Track} from '@api/types/track';
import type {PlaybackQueueSnapshot} from '@api/types/playback';
import type {AppComponentPort} from '../AppRuntimePorts';

export class QueueUIFacade {
    constructor(private readonly app: AppComponentPort) {}

    syncQueueTracks(tracks: Track[], currentIndex = 0): void {
        this.app.components.playlist?.setTracks(tracks, currentIndex);
    }

    syncQueueEntries(snapshot: PlaybackQueueSnapshot): void {
        this.app.components.playlist?.setEntries(snapshot.entries, snapshot.currentQueueId);
    }

    setQueueCurrentTrack(index: number): void {
        this.app.components.playlist?.setCurrentTrack(index);
    }

    toggleQueue(): void {
        this.app.components.playlist?.toggle();
    }
}
