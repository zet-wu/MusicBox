import type {Playlist} from "@api/types/playlist";
import type {Track} from "@api/types/track";

interface ComponentEventSource {
    on(event: string, handler: (...args: any[]) => void | Promise<void>): void;
}

interface PlaylistBindingComponents {
    createPlaylistDialog: ComponentEventSource;
    addToPlaylistDialog: ComponentEventSource;
    renamePlaylistDialog: ComponentEventSource;
    playlistBindingDialog: ComponentEventSource;
    editTrackInfoDialog: ComponentEventSource;
    playlistDetailPage: ComponentEventSource;
}

interface PlaylistBindingUI {
    showCreatePlaylistDialog(tracks?: Track | Track[]): void;
    showPlaylistBindingDialog(playlist: Playlist): Promise<void>;
    showContextMenu(
        x: number,
        y: number,
        track: Track,
        index: number,
        selectedTracks?: Set<number>,
        selectedTrackItems?: Track[]
    ): void;
}

export interface PlaylistComponentBindingHost {
    handlePlaylistCreated(playlist?: Playlist): Promise<void>;
    handleTrackAddedToPlaylist(playlist?: Playlist, track?: Track): Promise<void>;
    handlePlaylistRenamed(playlist?: Playlist): Promise<void>;
    handleTrackInfoUpdated(data: unknown): Promise<void>;
    handleTrackPlayed(track: Track, index: number): Promise<void>;
    handlePlayAllTracks(tracks: Track[]): Promise<void>;
    handleShuffleAllTracks(tracks: Track[]): Promise<void>;
    addTracksToQueue(tracks: Track[]): Promise<void>;
    playTrackFromPlaylist(
        track: Track,
        index: number,
        tracks?: Track[],
        mode?: 'shuffle' | 'sequence'
    ): Promise<void>;
    handlePlaylistUpdated(playlist?: Playlist): Promise<void>;
    handlePlaylistBindingsChanged(): Promise<void>;
    handlePlaylistCoverUpdated(playlist: Playlist): Promise<void>;
}

interface ComponentNotificationPayload {
    message: string;
    type?: 'info' | 'success' | 'error' | 'warning';
}

interface PlaylistTracksAddedPayload {
    playlist: Playlist;
    tracks: Track[];
}

interface PlaylistComponentBindingContext {
    app: PlaylistComponentBindingHost;
    components: PlaylistBindingComponents;
    notify(data: ComponentNotificationPayload): void;
    ui: PlaylistBindingUI;
}

export function bindPlaylistComponentEvents({
    app,
    components,
    notify,
    ui
}: PlaylistComponentBindingContext): void {
    components.createPlaylistDialog.on('playlistCreated', async (playlist: Playlist) => {
        await app.handlePlaylistCreated(playlist);
    });
    components.createPlaylistDialog.on('notification', (data: ComponentNotificationPayload) => {
        notify(data);
    });

    components.addToPlaylistDialog.on('createNewPlaylist', (tracks: Track[]) => {
        ui.showCreatePlaylistDialog(tracks);
    });

    components.addToPlaylistDialog.on('tracksAdded', async ({playlist, tracks}: PlaylistTracksAddedPayload) => {
        await app.handleTrackAddedToPlaylist(playlist, tracks[0]);
    });
    components.addToPlaylistDialog.on('notification', (data: ComponentNotificationPayload) => {
        notify(data);
    });

    components.renamePlaylistDialog.on('playlistRenamed', async (playlist: Playlist) => {
        await app.handlePlaylistRenamed(playlist);
    });
    components.renamePlaylistDialog.on('notification', (data: ComponentNotificationPayload) => {
        notify(data);
    });

    components.playlistBindingDialog.on('bindingsChanged', async () => {
        await app.handlePlaylistBindingsChanged();
    });

    components.editTrackInfoDialog.on('trackUpdated', async (data: unknown) => {
        await app.handleTrackInfoUpdated(data);
    });

    components.playlistDetailPage.on(
        'trackPlayed',
        async (track: Track, index: number, tracks?: Track[], mode?: 'shuffle' | 'sequence') => {
        if (tracks && tracks.length > 0) {
            await app.playTrackFromPlaylist(track, index, tracks, mode);
            return;
        }

        await app.handleTrackPlayed(track, index);
        }
    );

    components.playlistDetailPage.on(
        'trackRightClick',
        (
            track: Track,
            index: number,
            x: number,
            y: number,
            selectedTracks?: Set<number>,
            selectedTrackItems?: Track[]
        ) => {
            ui.showContextMenu(x, y, track, index, selectedTracks, selectedTrackItems);
        }
    );

    components.playlistDetailPage.on('playAllTracks', async (tracks: Track[]) => {
        await app.handlePlayAllTracks(tracks);
    });

    components.playlistDetailPage.on('appendAllTracks', async (tracks: Track[]) => {
        await app.addTracksToQueue(tracks);
    });

    components.playlistDetailPage.on('playlistUpdated', async (playlist: Playlist) => {
        await app.handlePlaylistUpdated(playlist);
    });

    components.playlistDetailPage.on('manageFolderBindings', async (playlist: Playlist) => {
        await ui.showPlaylistBindingDialog(playlist);
    });

    components.playlistDetailPage.on('playlistCoverUpdated', async (playlist: Playlist) => {
        await app.handlePlaylistCoverUpdated(playlist);
    });
}
