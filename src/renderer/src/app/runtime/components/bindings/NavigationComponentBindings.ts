import type {Playlist} from "@api/types/playlist";
import type {AppView} from "@/shared/types/AppContracts";

import type {NavigationComponentBindingContext} from "./ComponentBindingTypes";

export function bindNavigationComponentEvents({
    app,
    components,
    dialogs
}: NavigationComponentBindingContext): void {
    components.search.on('queryChanged', async (query: string) => {
        await app.handleSearchQuery(query);
    });

    components.navigation.on('viewChanged', async (view: AppView) => {
        await app.handleViewChange(view);
    });

    components.navigation.on('showSettings', async () => {
        await dialogs.toggleSettings();
    });

    components.navigation.on('playlistSelected', async (playlist: Playlist) => {
        await app.handlePlaylistSelected(playlist);
    });

    components.navigation.on('playlistsChanged', async (playlists: Playlist[]) => {
        await components.playlistsPage?.refresh(playlists);
    });

    components.navigation.on('networkDriveSelected', async (drive: unknown) => {
        await app.handleNetworkDriveSelected(drive);
    });

    components.navigation.on('showRenameDialog', (playlist: Playlist) => {
        dialogs.showRenamePlaylistDialog(playlist);
    });

    components.contextMenu.on('editPlaylist', (playlist: Playlist) => {
        dialogs.showRenamePlaylistDialog(playlist);
    });

    components.contextMenu.on('deletePlaylist', async (playlist: Playlist) => {
        await components.navigation.deletePlaylist(playlist);
    });
}
