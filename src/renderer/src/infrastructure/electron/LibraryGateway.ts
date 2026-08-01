import {ElectronNamespaceAdapter} from './ElectronBridge';
import type {Result, Unsubscribe} from '@api/types/common';
import type {CacheStatistics, GetTracksOptions, Playlist, Track} from '@api/types/library';
import type {CacheValidationResult, ScanProgress} from '@api/types/events';
import type {
    EmbeddedTrackCover,
    FavoritesChangedData,
    LibraryDirectoryOverview,
    LibraryImportResult,
    LibraryIndexRebuildResult,
    LibrarySource,
    PlaylistCoverMutationResult,
    PlaylistSourceBinding
} from '@api/types/electron';

export interface PlaylistResult {
    success: boolean;
    playlist?: Playlist;
    error?: string;
}

class LibraryGateway extends ElectronNamespaceAdapter<'library'> {
    constructor() {
        super('library');
    }

    getTracks(options: GetTracksOptions = {}): Promise<Track[]> {
        return this.call('getTracks', options);
    }

    scanDirectory(path: string): Promise<boolean> {
        return this.call('scanDirectory', path);
    }

    importLibraryFiles(paths: string[], targetPlaylistId?: string): Promise<LibraryImportResult> {
        return this.call('importLibraryFiles', paths, targetPlaylistId);
    }

    getLibraryDirectoryOverviews(): Promise<LibraryDirectoryOverview[]> {
        return this.call('getLibraryDirectoryOverviews');
    }

    getTracksByLibrarySource(sourceId: string): Promise<Track[]> {
        return this.call('getTracksByLibrarySource', sourceId);
    }

    getPlaylistBindings(playlistId: string): Promise<PlaylistSourceBinding[]> {
        return this.call('getPlaylistBindings', playlistId);
    }

    registerLibraryDirectory(directoryPath: string): Promise<Result & {source?: LibrarySource}> {
        return this.call('registerLibraryDirectory', directoryPath);
    }

    removeLibraryDirectory(directoryPath: string): Promise<Result & {removedTrackCount?: number}> {
        return this.call('removeLibraryDirectory', directoryPath);
    }

    removeLibrarySource(sourceId: string): Promise<Result & {removedTrackCount?: number}> {
        return this.call('removeLibrarySource', sourceId);
    }

    rescanLibrarySource(sourceId: string): Promise<Result> {
        return this.call('rescanLibrarySource', sourceId);
    }

    bindDirectoryToPlaylist(
        playlistId: string,
        directoryPath: string
    ): Promise<Result & {binding?: PlaylistSourceBinding}> {
        return this.call('bindDirectoryToPlaylist', playlistId, directoryPath);
    }

    bindLibrarySourceToPlaylist(
        playlistId: string,
        sourceId: string
    ): Promise<Result & {binding?: PlaylistSourceBinding}> {
        return this.call('bindLibrarySourceToPlaylist', playlistId, sourceId);
    }

    unbindDirectoryFromPlaylist(bindingId: string, mode: 'keep' | 'remove'): Promise<Result> {
        return this.call('unbindDirectoryFromPlaylist', bindingId, mode);
    }

    rescanPlaylistBinding(bindingId: string): Promise<Result> {
        return this.call('rescanPlaylistBinding', bindingId);
    }

    restorePlaylistBindingExclusions(bindingId: string): Promise<Result & {restoredCount?: number}> {
        return this.call('restorePlaylistBindingExclusions', bindingId);
    }

    getTracksByDrive(driveId: string): Promise<Track[]> {
        return this.call('getTracksByDrive', driveId);
    }

    getPlaylists(): Promise<Playlist[]> {
        return this.call('getPlaylists');
    }

    search(query: string): Promise<Track[]> {
        return this.call('search', query);
    }

    getTrackMetadata(filePath: string): Promise<Track | null> {
        return this.call('getTrackMetadata', filePath);
    }

    getTrackCover(filePath: string): Promise<EmbeddedTrackCover | null> {
        return this.call('getTrackCover', filePath);
    }

    getTrackPlaybackMetadata(filePath: string): Promise<Track | null> {
        return this.call('getTrackPlaybackMetadata', filePath);
    }

    updateTrackMetadata(data: unknown): Promise<Result & {updatedMetadata?: Track}> {
        return this.call('updateTrackMetadata', data);
    }

    getCacheStatistics(): Promise<CacheStatistics | null> {
        return this.call('getCacheStatistics');
    }

    loadCachedTracks(): Promise<Track[]> {
        return this.call('loadCachedTracks');
    }

    rebuildLibraryIndex(): Promise<LibraryIndexRebuildResult> {
        return this.call('rebuildLibraryIndex');
    }

    clearIgnoreList(): Promise<Result> {
        return this.call('clearIgnoreList');
    }

    createPlaylist(name: string, description = ''): Promise<PlaylistResult> {
        return this.call('createPlaylist', name, description);
    }

    deletePlaylist(playlistId: string): Promise<Result> {
        return this.call('deletePlaylist', playlistId);
    }

    renamePlaylist(playlistId: string, newName: string, description = ''): Promise<PlaylistResult> {
        return this.call('renamePlaylist', playlistId, newName, description);
    }

    addToPlaylist(playlistId: string, trackIds: string | string[]): Promise<Result> {
        return this.call('addToPlaylist', playlistId, trackIds);
    }

    addTrackToLibrary(audioFile: Partial<Track> | unknown): Promise<{success: boolean; track?: Track; error?: string; isNew?: boolean}> {
        return this.call('addTrackToLibrary', audioFile);
    }

    removeTrack(trackFileId: string): Promise<Result> {
        return this.call('removeTrack', trackFileId);
    }

    removeTracksByDrive(driveId: string): Promise<Result> {
        return this.call('removeTracksByDrive', driveId);
    }

    scanNetworkDrive(driveId: string | number, relativePath = '/'): Promise<boolean> {
        return this.call('scanNetworkDrive', driveId, relativePath);
    }

    scanSingleFile(networkPath: string): Promise<{success: boolean; track?: Track; error?: string; isNew?: boolean}> {
        return this.call('scanSingleFile', networkPath);
    }

    removeFromPlaylist(playlistId: string, trackIds: string | string[]): Promise<Result> {
        return this.call('removeFromPlaylist', playlistId, trackIds);
    }

    setTrackFavorite(trackFileId: string, favorite: boolean): Promise<Result & {favorite?: boolean}> {
        return this.call('setTrackFavorite', trackFileId, favorite);
    }

    getPlaylistDetail(playlistId: string): Promise<{success: boolean; playlist?: Playlist; tracks?: Track[]; error?: string}> {
        return this.call('getPlaylistDetail', playlistId);
    }

    updatePlaylistCover(playlistId: string, imagePath: string): Promise<PlaylistCoverMutationResult> {
        return this.call('updatePlaylistCover', playlistId, imagePath);
    }

    setPlaylistCoverFromTrack(playlistId: string, trackId: string): Promise<PlaylistCoverMutationResult> {
        return this.call('setPlaylistCoverFromTrack', playlistId, trackId);
    }

    getPlaylistCover(playlistId: string): Promise<{success: boolean; coverPath?: string; error?: string}> {
        return this.call('getPlaylistCover', playlistId);
    }

    removePlaylistCover(playlistId: string): Promise<Result> {
        return this.call('removePlaylistCover', playlistId);
    }

    validateCache(): Promise<CacheValidationResult> {
        return this.call('validateCache');
    }

    onLibraryUpdated(handler: (tracks: Track[]) => void): Unsubscribe {
        return this.on('onLibraryUpdated', (_event: unknown, tracks: Track[]) => handler(tracks));
    }

    onPlaylistsUpdated(handler: (playlists: Playlist[]) => void): Unsubscribe {
        return this.on('onPlaylistsUpdated', (_event: unknown, playlists: Playlist[]) => handler(playlists));
    }

    onSourcesUpdated(handler: () => void): Unsubscribe {
        return this.on('onSourcesUpdated', () => handler());
    }

    onFavoritesChanged(handler: (data: FavoritesChangedData) => void): Unsubscribe {
        return this.on('onFavoritesChanged', (_event: unknown, data: FavoritesChangedData) => handler(data));
    }

    onScanProgress(handler: (progress: ScanProgress) => void): Unsubscribe {
        return this.on('onScanProgress', (_event: unknown, progress: ScanProgress) => handler(progress));
    }

    onCacheValidationProgress(handler: (progress: ScanProgress) => void): Unsubscribe {
        return this.on('onCacheValidationProgress', handler);
    }

    onCoverUpdated(handler: (data: unknown) => void): Unsubscribe {
        return this.on('onCoverUpdated', handler);
    }
}

export const libraryGateway = new LibraryGateway();
