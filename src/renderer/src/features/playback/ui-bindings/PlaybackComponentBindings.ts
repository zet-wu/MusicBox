import type {Track} from "@api/types/track";
import {getLyricsSourcePicker} from '@/features/lyrics/ui/LyricsSourcePicker';

interface ComponentEventSource {
    on(event: string, handler: (...args: any[]) => void | Promise<void>): void;
}

interface PlaybackBindingComponents {
    player: ComponentEventSource;
    playlist: ComponentEventSource;
    contextMenu: ComponentEventSource;
}

interface PlaybackBindingUI {
    showContextMenu(
        x: number,
        y: number,
        track: Track,
        index: number,
        selectedTracks?: Set<number>,
        selectedTrackItems?: Track[],
        sourceTracks?: Track[]
    ): void;
    toggleQueue(): void;
    toggleLyricsForTrack(track: Track | null): Promise<void>;
}

interface PlaybackBindingIntegrations {
    getCurrentTrackSnapshot(): Track | null;
}

export interface PlaybackComponentBindingHost {
    handleTrackPlayed(track: Track, index: number, tracks?: Track[]): Promise<void>;
    handleTrackIndexChanged(index: number): void;
    handlePlaylistTrackSelected(track: Track, index: number): void;
    handlePlaylistTrackPlayed(track: Track, index: number): Promise<void>;
    handlePlaylistTrackRemoved(track: Track, index: number): Promise<void>;
    handlePlaylistCleared(): Promise<void>;
    addToPlaylist(track: Track): void | Promise<void>;
    addTracksToQueue(tracks: Track[]): Promise<void>;
    playTracksNext(tracks: Track[]): Promise<void>;
    handleAddToCustomPlaylist(tracks: Track[], index: number): Promise<void>;
    handleDeleteTrack(track: Track, index: number): Promise<void>;
    handleBatchDelete(selectedTracks: Track[] | null | undefined, track: Track, index: number): Promise<void>;
    handleEditTrackInfo(track: Track, index: number): Promise<void>;
    moveQueueEntry(queueId: string, targetIndex: number): boolean;
}

interface PlaybackComponentBindingContext {
    app: PlaybackComponentBindingHost;
    components: PlaybackBindingComponents;
    integrations: PlaybackBindingIntegrations;
    ui: PlaybackBindingUI;
}

interface TrackEventPayload {
    track: Track;
    index: number;
}

interface ContextMenuPayload extends TrackEventPayload {
    selectedTracks?: Track[];
    tracks?: Track[];
    _index?: number;
}

export function bindPlaybackComponentEvents({
    app,
    components,
    integrations,
    ui
}: PlaybackComponentBindingContext): void {
    components.player.on('togglePlaylist', () => {
        ui.toggleQueue();
    });

    components.player.on('toggleLyrics', async () => {
        await ui.toggleLyricsForTrack(integrations.getCurrentTrackSnapshot());
    });

    components.player.on('trackIndexChanged', (index: number) => {
        app.handleTrackIndexChanged(index);
    });

    components.playlist.on('trackSelected', ({track, index}: TrackEventPayload) => {
        app.handlePlaylistTrackSelected(track, index);
    });

    components.playlist.on('trackPlayed', async ({track, index}: TrackEventPayload) => {
        await app.handlePlaylistTrackPlayed(track, index);
    });

    components.playlist.on('trackRemoved', async ({track, index}: TrackEventPayload) => {
        await app.handlePlaylistTrackRemoved(track, index);
    });

    components.playlist.on('playlistCleared', async () => {
        await app.handlePlaylistCleared();
    });

    components.playlist.on('queueReordered', ({queueId, targetIndex}: {queueId: string; targetIndex: number}) => {
        app.moveQueueEntry(queueId, targetIndex);
    });

    components.contextMenu.on('play', async ({track, index, tracks}: ContextMenuPayload) => {
        await app.handleTrackPlayed(track, index, tracks);
    });

    components.contextMenu.on('addToPlaylist', ({track, tracks}: ContextMenuPayload) => {
        void app.addTracksToQueue(tracks?.length ? tracks : [track]);
    });

    components.contextMenu.on('playNext', ({track, tracks}: ContextMenuPayload) => {
        void app.playTracksNext(tracks?.length ? tracks : [track]);
    });

    components.contextMenu.on('addToCustomPlaylist', async ({track, tracks, index}: ContextMenuPayload) => {
        await app.handleAddToCustomPlaylist(tracks?.length ? tracks : [track], index);
    });

    components.contextMenu.on('delete', async ({track, index}: ContextMenuPayload) => {
        await app.handleDeleteTrack(track, index);
    });

    components.contextMenu.on('batchDelete', async ({selectedTracks, track, index}: ContextMenuPayload) => {
        await app.handleBatchDelete(selectedTracks, track, index);
    });

    components.contextMenu.on('editInfo', async ({track, index}: ContextMenuPayload) => {
        await app.handleEditTrackInfo(track, index);
    });

    components.contextMenu.on('selectLyrics', async ({track}: ContextMenuPayload) => {
        if (track) await getLyricsSourcePicker().open(track);
    });
}
