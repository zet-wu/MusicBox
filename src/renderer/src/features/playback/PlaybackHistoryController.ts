import {appEventService} from "@/features/events/service/AppEventService";
import {
    recentPlaybackHistoryService,
    type RecentPlaybackHistoryService
} from "@/features/playback/service/RecentPlaybackHistoryService";
import type {PlaybackStartedEvent} from "@api/types/events";

export class PlaybackHistoryController {
    private readonly historyService: RecentPlaybackHistoryService;
    private unsubscribe: (() => void) | null = null;

    constructor(historyService: RecentPlaybackHistoryService = recentPlaybackHistoryService) {
        this.historyService = historyService;
    }

    start(): void {
        if (this.unsubscribe) {
            return;
        }

        this.unsubscribe = appEventService.on('playbackStarted', (event: PlaybackStartedEvent) => {
            this.historyService.recordPlaybackStarted(event);
        });
    }

    dispose(): void {
        this.unsubscribe?.();
        this.unsubscribe = null;
    }
}
