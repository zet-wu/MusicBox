import type {Playlist} from '@api/types/playlist';
import type {Track} from '@api/types/track';
import type {AppComponentPort} from '../AppRuntimePorts';
import type {CollectionType} from '@/features/playlists/domain/CollectionCapabilities';
import {ContentMountManager, type ContentViewKey} from '../components/ContentMountManager';

export class ContentUIFacade {
    constructor(
        private readonly app: AppComponentPort,
        private readonly contentMounts: ContentMountManager
    ) {}

    clearPlaylistDetailSelection(): void {
        this.app.components.playlistDetailPage?.clearSelection();
    }

    showContextMenu(
        x: number,
        y: number,
        track: Track,
        index: number,
        selectedTracks?: Set<number>,
        selectedTrackItems?: Track[],
        sourceTracks?: Track[]
    ): void {
        this.app.components.contextMenu?.show(
            x,
            y,
            track,
            index,
            selectedTracks,
            selectedTrackItems,
            {sourceTracks}
        );
    }

    showCollectionContextMenu(x: number, y: number, tracks: Track[], playlist?: Playlist): void {
        if (tracks.length === 0 && !playlist) return;
        this.app.components.contextMenu?.show(
            x,
            y,
            tracks[0] || null,
            0,
            null,
            tracks,
            {collectionActionsOnly: true, playlist, sourceTracks: tracks}
        );
    }

    async showPlaylistDetail(playlist: Playlist): Promise<void> {
        this.activate('playlist-detail');
        await this.app.components.playlistDetailPage?.show(playlist);
    }

    async showSystemCollection(collectionType: Exclude<CollectionType, 'playlist'>): Promise<void> {
        this.activate('playlist-detail');
        await this.app.components.playlistDetailPage?.showSystemCollection(collectionType);
    }

    applySystemCollectionSearchResults(results: Track[] | null): boolean {
        return this.app.components.playlistDetailPage?.applySearchResults(results) ?? false;
    }

    async showNetworkDriveDetail(drive: unknown): Promise<void> {
        this.activate('network-drive-detail');
        await this.app.components.networkDriveDetailPage?.show(drive as any);
    }

    async removeTrackFromPlaylistDetail(track: Track, index: number): Promise<boolean> {
        const playlistDetailPage = this.app.components.playlistDetailPage;
        if (!playlistDetailPage) {
            return false;
        }

        await playlistDetailPage.removeTrackFromPlaylist(track, index);
        return true;
    }

    async removeSelectedTracksFromPlaylistDetail(): Promise<boolean> {
        const playlistDetailPage = this.app.components.playlistDetailPage;
        if (!playlistDetailPage) {
            return false;
        }

        await playlistDetailPage.removeSelectedTracks();
        return true;
    }

    isPlaylistDetailVisible(): boolean {
        return Boolean(this.app.components.playlistDetailPage?.isVisible);
    }

    updatePlaylistDetailTrack(filePath: string, updatedData: Partial<Track>): boolean {
        const playlistDetailPage = this.app.components.playlistDetailPage;
        const playlistTrack = playlistDetailPage?.tracks.find((track) => track.filePath === filePath);
        if (!playlistTrack) {
            return false;
        }

        Object.assign(playlistTrack, updatedData);
        playlistDetailPage.render();
        return true;
    }

    updatePlaylistDetailInfo(playlist: Playlist): boolean {
        return this.app.components.playlistDetailPage?.updatePlaylistInfo(playlist) ?? false;
    }

    async reloadPlaylistDetailTracks(): Promise<void> {
        await this.app.components.playlistDetailPage?.loadPlaylistTracks();
    }

    async showHomePage(): Promise<void> {
        this.activate('home-page');
        await this.app.components.homePage?.show();
    }

    async showRecentPage(): Promise<void> {
        this.activate('recent');
        await this.app.components.recentPage?.show();
    }

    async showArtistsPage(): Promise<void> {
        this.activate('artists');
        await this.app.components.artistsPage?.show();
    }

    async showAlbumsPage(): Promise<void> {
        this.activate('albums');
        await this.app.components.albumsPage?.show();
    }

    async showPlaylistsPage(): Promise<void> {
        this.activate('playlists');
        await this.app.components.playlistsPage?.show();
    }

    async showFolderSourcesPage(): Promise<void> {
        this.activate('folders');
        await this.app.components.folderSourcesPage?.show();
    }

    async refreshPlaylistsPage(): Promise<void> {
        await this.app.components.playlistsPage?.refresh();
    }

    async showStatisticsPage(): Promise<void> {
        this.activate('statistics');
        await this.app.components.statisticsPage?.show();
    }

    hideAllPages(): void {
        this.app.components.homePage?.hide();
        this.app.components.recentPage?.hide();
        this.app.components.artistsPage?.hide();
        this.app.components.albumsPage?.hide();
        this.app.components.playlistsPage?.hide();
        this.app.components.folderSourcesPage?.hide();
        this.app.components.statisticsPage?.hide();
        this.app.components.playlistDetailPage?.hide();
        this.app.components.networkDriveDetailPage?.hide();
        this.contentMounts.hideAllPages();
    }

    updateSidebarSelection(type: string, id: string | null = null): void {
        this.app.components.navigation?.updateSidebarSelection?.(type, id);
    }

    async loadNetworkDrives(): Promise<void> {
        await this.app.components.navigation?.loadNetworkDrives?.();
    }

    updateNavigationPlaylistInfo(playlist: Playlist): void {
        this.app.components.navigation?.updatePlaylistInfo?.(playlist);
    }

    updateStatisticsButtonVisibility(enabled: boolean): void {
        this.app.components.navigation?.updateStatisticsButtonVisibility?.(enabled);
    }

    updateRecentPlayButtonVisibility(enabled: boolean): void {
        this.app.components.navigation?.updateRecentPlayButtonVisibility?.(enabled);
    }

    updateArtistsPageButtonVisibility(enabled: boolean): void {
        this.app.components.navigation?.updateArtistsPageButtonVisibility?.(enabled);
    }

    updateAlbumsPageButtonVisibility(enabled: boolean): void {
        this.app.components.navigation?.updateAlbumsPageButtonVisibility?.(enabled);
    }

    navigateToView(view: string): void {
        this.app.components.navigation?.navigateToView?.(view);
    }

    focusSearchInput(): void {
        this.app.components.search?.focusInput();
    }

    private activate(key: ContentViewKey): void {
        this.contentMounts.activate(key);
    }
}
