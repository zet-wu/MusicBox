import {cacheManager} from "@/shared/cache";
import {localCoverManager} from "@/features/mediaAssets/service/LocalCoverManager";
import type {MusicBoxAPIEvents} from "@api/types/events";
import type {Track} from "@api/types/track";
import {libraryDataService} from "../service/LibraryDataService";
import {libraryService} from "../service/LibraryService";

interface LibraryConfirmOptions {
    title: string;
    message: string;
    type?: 'default' | 'danger' | 'warning';
    confirmText?: string;
    cancelText?: string;
}

export interface LibraryAppHost {
    currentView: string;
    library: Track[];
    filteredLibrary: Track[];
    coversPreloadedByApp?: boolean;
    addManagedAPIEventListener<K extends keyof MusicBoxAPIEvents>(
        event: K,
        handler: (payload: MusicBoxAPIEvents[K]) => void | Promise<void>
    ): void;
    confirm(options: LibraryConfirmOptions): Promise<boolean>;
    showSuccess(message: string): void;
    showError(message: string): void;
    showInfo(message: string): void;
    showCacheLoadingStatus(): void;
    hideCacheLoadingStatus(): void;
    showWelcomeScreen(): void;
    handleViewChange(view: string, options?: {preserveSearch?: boolean}): Promise<void>;
    syncDesktopLyricsButtonState(): Promise<void>;
}

interface LibraryAppUI {
    removeTrackFromPlaylistDetail(track: Track, index: number): Promise<boolean>;
    removeSelectedTracksFromPlaylistDetail(): Promise<boolean>;
    clearPlaylistDetailSelection(): void;
    updatePlayerTrackInfo(track: Track): Promise<void>;
    isPlaylistDetailVisible(): boolean;
    updatePlaylistDetailTrack(filePath: string, updatedData: Partial<Track>): boolean;
    applySystemCollectionSearchResults(results: Track[] | null): boolean;
    reloadPlaylistDetailTracks(): Promise<void>;
}

interface LibraryAppIntegrations {
    getCurrentPlaybackTrack(): Track | null;
    getPlaybackPlaylist(): Track[];
    getCurrentPlaybackIndex(): number;
    setPlaybackPlaylist(tracks: Track[], startIndex?: number): Promise<boolean>;
}

interface LibraryAppControllerOptions {
    app: LibraryAppHost;
    integrations: LibraryAppIntegrations;
    ui: LibraryAppUI;
}

interface TrackInfoUpdateData {
    track: Track;
    updatedData: Partial<Track> & {
        cover?: unknown;
    };
}

export class LibraryAppController {
    private readonly app: LibraryAppHost;
    private readonly integrations: LibraryAppIntegrations;
    private readonly ui: LibraryAppUI;
    private activeSearchQuery = '';
    private searchGeneration = 0;

    constructor({app, integrations, ui}: LibraryAppControllerOptions) {
        this.app = app;
        this.integrations = integrations;
        this.ui = ui;
    }

    async loadInitialData(): Promise<void> {
        const app = this.app;

        try {
            const hasCachedLibrary = await libraryDataService.hasCachedLibrary();
            if (hasCachedLibrary) {
                app.showCacheLoadingStatus();

                app.library = await libraryService.loadCachedTracks();
                if (app.library.length > 0) {
                    app.filteredLibrary = [...app.library];
                    if (app.currentView === 'library') {
                        await this.refreshActiveCollection();
                    }
                    app.hideCacheLoadingStatus();

                    await this.preloadTrackCovers();
                    await this.validateCacheInBackground();
                    return;
                }
            }

            app.library = await libraryDataService.getTracks();
            if (app.library.length === 0) {
                app.showWelcomeScreen();
            } else {
                app.filteredLibrary = [...app.library];
                if (app.currentView === 'library') {
                    await this.refreshActiveCollection();
                }

                await this.preloadTrackCovers();
            }

            await app.syncDesktopLyricsButtonState();
        } catch (error) {
            app.showError('加载音乐库失败');
        }
    }

    async preloadTrackCovers(): Promise<void> {
        const app = this.app;

        try {
            const settings = (cacheManager.getLocalCache('musicbox-settings') || {}) as Record<string, unknown>;
            const showTrackCovers = Object.prototype.hasOwnProperty.call(settings, 'showTrackCovers')
                ? settings.showTrackCovers
                : true;
            if (!showTrackCovers) {
                return;
            }

            if (app.coversPreloadedByApp) {
                return;
            }

            const tracksToPreload = app.library.slice(0, 6);
            await localCoverManager.preloadCovers(tracksToPreload);
            app.coversPreloadedByApp = true;
        } catch (error) {
            console.warn('⚠️ App: 封面预加载失败:', error);
        }
    }

    async validateCacheInBackground(): Promise<void> {
        const app = this.app;

        try {
            app.addManagedAPIEventListener('cacheValidationCompleted', async (result: MusicBoxAPIEvents['cacheValidationCompleted']) => {
                if (result.invalid > 0) {
                    app.showInfo(`已清理 ${result.invalid} 个无效的音乐文件`);
                }
            });

            app.addManagedAPIEventListener('cacheValidationError', (error: MusicBoxAPIEvents['cacheValidationError']) => {
                console.warn('⚠️ 后台缓存验证失败:', error);
            });

            await libraryService.validateCache();
        } catch (error) {
            console.warn('⚠️ 后台缓存验证失败:', error);
        }
    }

    async refreshLibrary(tracks?: Track[]): Promise<void> {
        const app = this.app;

        try {
            app.library = Array.isArray(tracks)
                ? tracks
                : await libraryDataService.getTracks();
            await this.reapplyActiveSearch();
            await this.refreshActiveCollection();
        } catch (error) {
            console.error('❌ [App] refreshLibrary 失败:', error);
        }
    }

    async handleSearchQuery(query: string): Promise<void> {
        const normalizedQuery = query.trim();
        const generation = ++this.searchGeneration;
        this.activeSearchQuery = normalizedQuery;

        if (!normalizedQuery) {
            this.app.filteredLibrary = [...this.app.library];
            this.ui.applySystemCollectionSearchResults(null);
            return;
        }

        if (!this.isTrackCollectionView()) {
            await this.app.handleViewChange('library', {preserveSearch: true});
            if (generation !== this.searchGeneration) return;
        }

        try {
            const results = await libraryDataService.searchLibrary(normalizedQuery);
            if (generation !== this.searchGeneration || normalizedQuery !== this.activeSearchQuery) return;
            this.app.filteredLibrary = results;
            this.ui.applySystemCollectionSearchResults(results);
        } catch (error) {
            if (generation === this.searchGeneration) {
                console.error('❌ 搜索音乐库失败:', error);
                this.app.showError('搜索失败，请重试');
            }
        }
    }

    clearSearchState(): void {
        this.searchGeneration++;
        this.activeSearchQuery = '';
        this.app.filteredLibrary = [...this.app.library];
        this.ui.applySystemCollectionSearchResults(null);
    }

    updateLibraryTrackDuration(filePath: string, duration: number): void {
        const app = this.app;
        const libraryTrack = app.library.find(track => track.filePath === filePath);
        if (libraryTrack) {
            libraryTrack.duration = duration;
        }

        const filteredTrack = app.filteredLibrary.find(track => track.filePath === filePath);
        if (filteredTrack) {
            filteredTrack.duration = duration;
        }

        void this.updatePlaybackPlaylistTrack(filePath, {duration});

        this.applySearchToActiveCollection();
    }

    async handleDeleteTrack(track: Track, index: number): Promise<void> {
        const app = this.app;

        if (app.currentView === 'playlist-detail' && await this.ui.removeTrackFromPlaylistDetail(track, index)) {
            return;
        }

        if (app.currentView === 'network-drive-detail') {
            app.showError('网络磁盘中的歌曲无法单独删除，请通过移除整个网络磁盘来删除');
            return;
        }

        if (!track.fileId) {
            app.showError('该歌曲缺少可用标识，无法从音乐库删除');
            return;
        }

        const confirmed = await app.confirm({
            title: '删除歌曲',
            message: `确定要从音乐库中删除 "${track.title}" 吗？\n\n此操作将从音乐库和所有歌单中移除该歌曲，但不会删除本地文件。`,
            type: 'danger',
            confirmText: '删除'
        });

        if (!confirmed) {
            return;
        }

        try {
            const result = await libraryDataService.removeTrack(track.fileId);
            if (result.success) {
                const libraryIndex = app.library.findIndex(t => t.fileId === track.fileId);
                if (libraryIndex !== -1) {
                    app.library.splice(libraryIndex, 1);
                }

                const filteredIndex = app.filteredLibrary.findIndex(t => t.fileId === track.fileId);
                if (filteredIndex !== -1) {
                    app.filteredLibrary.splice(filteredIndex, 1);
                }

                await this.removeTrackFromPlaybackPlaylist(track);

                this.applySearchToActiveCollection();
                libraryService.emitLibraryUpdated(app.library);
                app.showInfo(`已从音乐库删除 "${track.title}"`);
            } else {
                app.showError(result.error || '删除失败');
            }
        } catch (error) {
            console.error('❌ 删除歌曲失败:', error);
            app.showError('删除失败，请重试');
        }
    }

    async handleBatchDelete(selectedTracks: Track[] | null | undefined, track: Track, index: number): Promise<void> {
        const app = this.app;

        if (!selectedTracks || selectedTracks.length === 0) {
            await this.handleDeleteTrack(track, index);
            return;
        }

        if (app.currentView === 'playlist-detail' && await this.ui.removeSelectedTracksFromPlaylistDetail()) {
            return;
        }

        const tracksById = new Map<string, Track>();
        for (const selectedTrack of selectedTracks) {
            if (selectedTrack.fileId) tracksById.set(selectedTrack.fileId, selectedTrack);
        }
        const tracksToDelete = Array.from(tracksById.values());
        if (tracksToDelete.length === 0) {
            app.showError('选中的歌曲缺少可用标识，无法删除');
            return;
        }

        const count = tracksToDelete.length;
        const confirmed = await app.confirm({
            title: '批量删除',
            message: `确定要从音乐库中删除选中的 ${count} 首歌曲吗？\n\n此操作不会删除本地文件。`,
            type: 'danger',
            confirmText: '删除'
        });

        if (!confirmed) return;

        let successCount = 0;
        const removedFileIds = new Set<string>();

        for (const t of tracksToDelete) {
            try {
                const result = await libraryDataService.removeTrack(t.fileId!);
                if (result.success) {
                    successCount++;
                    removedFileIds.add(t.fileId!);
                    const libIdx = app.library.findIndex(x => x.fileId === t.fileId);
                    if (libIdx !== -1) app.library.splice(libIdx, 1);
                    const filtIdx = app.filteredLibrary.findIndex(x => x.fileId === t.fileId);
                    if (filtIdx !== -1) app.filteredLibrary.splice(filtIdx, 1);
                }
            } catch (e) {
                console.error('❌ 批量删除失败:', t.title, e);
            }
        }

        await this.removeTracksFromPlaybackPlaylist(removedFileIds);
        this.ui.clearPlaylistDetailSelection();

        this.applySearchToActiveCollection();
        libraryService.emitLibraryUpdated(app.library);
        app.showInfo(`已从音乐库删除 ${successCount} 首歌曲`);
    }

    async handleTrackInfoUpdated(data: TrackInfoUpdateData): Promise<void> {
        const app = this.app;
        const {track, updatedData} = data;

        if (updatedData.cover && typeof updatedData.cover !== 'string') {
            updatedData.cover = null;
        }

        try {
            const libraryTrack = app.library.find(t => t.filePath === track.filePath);
            if (libraryTrack) {
                Object.assign(libraryTrack, {
                    title: updatedData.title,
                    artist: updatedData.artist,
                    album: updatedData.album,
                    year: updatedData.year,
                    genre: updatedData.genre,
                    cover: updatedData.cover
                });
            }

            const filteredTrack = app.filteredLibrary.find(t => t.filePath === track.filePath);
            if (filteredTrack) {
                Object.assign(filteredTrack, {
                    title: updatedData.title,
                    artist: updatedData.artist,
                    album: updatedData.album,
                    year: updatedData.year,
                    genre: updatedData.genre,
                    cover: updatedData.cover
                });
            }

            await this.updatePlaybackPlaylistTrack(track.filePath, {
                title: updatedData.title,
                artist: updatedData.artist,
                album: updatedData.album,
                year: updatedData.year,
                genre: updatedData.genre,
                cover: updatedData.cover
            });

            const currentTrack = this.integrations.getCurrentPlaybackTrack();
            if (currentTrack && currentTrack.filePath === track.filePath) {
                Object.assign(currentTrack, {
                    title: updatedData.title,
                    artist: updatedData.artist,
                    album: updatedData.album,
                    year: updatedData.year,
                    genre: updatedData.genre,
                    cover: updatedData.cover
                });
                await this.ui.updatePlayerTrackInfo(currentTrack);
            }

            this.applySearchToActiveCollection();

            if (this.ui.isPlaylistDetailVisible()) {
                this.ui.updatePlaylistDetailTrack(track.filePath, {
                    title: updatedData.title,
                    artist: updatedData.artist,
                    album: updatedData.album,
                    year: updatedData.year,
                    genre: updatedData.genre
                });
            }
            app.showInfo(`歌曲信息已更新：${updatedData.title}`);
        } catch (error) {
            console.error('❌ 更新歌曲信息失败:', error);
            app.showError('更新歌曲信息失败，请重试');
        }
    }

    private async removeTrackFromPlaybackPlaylist(track: Track): Promise<void> {
        if (!track.fileId) {
            return;
        }

        await this.removeTracksFromPlaybackPlaylist(new Set([track.fileId]));
    }

    private isTrackCollectionView(): boolean {
        return ['library', 'favorites', 'playlist-detail'].includes(this.app.currentView);
    }

    private applySearchToActiveCollection(): void {
        if (!this.isTrackCollectionView() || !this.ui.isPlaylistDetailVisible()) return;
        if (!this.activeSearchQuery) return;
        this.ui.applySystemCollectionSearchResults(
            this.app.filteredLibrary
        );
    }

    private async reapplyActiveSearch(): Promise<void> {
        if (!this.activeSearchQuery) {
            this.app.filteredLibrary = [...this.app.library];
            return;
        }

        const query = this.activeSearchQuery;
        const generation = ++this.searchGeneration;
        const results = await libraryDataService.searchLibrary(query);
        if (generation === this.searchGeneration && query === this.activeSearchQuery) {
            this.app.filteredLibrary = results;
        }
    }

    private async refreshActiveCollection(): Promise<void> {
        if (!this.isTrackCollectionView() || !this.ui.isPlaylistDetailVisible()) return;
        await this.ui.reloadPlaylistDetailTracks();
        this.applySearchToActiveCollection();
    }

    private async removeTracksFromPlaybackPlaylist(fileIds: Set<string>): Promise<void> {
        if (fileIds.size === 0) {
            return;
        }

        const currentPlaylist = this.integrations.getPlaybackPlaylist();
        const removedIndexes = currentPlaylist
            .map((track, index) => ({track, index}))
            .filter(({track}) => !!track.fileId && fileIds.has(track.fileId))
            .map(({index}) => index);

        if (removedIndexes.length === 0) {
            return;
        }

        const removedIndexSet = new Set(removedIndexes);
        const nextPlaylist = currentPlaylist.filter((_candidate, index) => !removedIndexSet.has(index));
        const currentIndex = this.integrations.getCurrentPlaybackIndex();
        const nextIndex = this.resolveIndexAfterRemovals(removedIndexes, currentIndex, nextPlaylist.length);
        await this.integrations.setPlaybackPlaylist(nextPlaylist, nextIndex);
    }

    private async updatePlaybackPlaylistTrack(filePath: string, updatedData: Partial<Track>): Promise<void> {
        const currentPlaylist = this.integrations.getPlaybackPlaylist();
        const trackIndex = currentPlaylist.findIndex((track) => track.filePath === filePath);
        if (trackIndex === -1) {
            return;
        }

        const currentTrack = currentPlaylist[trackIndex];
        const changed = Object.entries(updatedData).some(([key, value]) => (
            currentTrack[key as keyof Track] !== value
        ));
        if (!changed) {
            return;
        }

        const nextPlaylist = currentPlaylist.map((track, index) => (
            index === trackIndex
                ? {...track, ...updatedData}
                : track
        ));
        await this.integrations.setPlaybackPlaylist(nextPlaylist, this.integrations.getCurrentPlaybackIndex());
    }

    private resolveIndexAfterRemovals(removedIndexes: number[], currentIndex: number, nextLength: number): number {
        if (nextLength === 0) {
            return -1;
        }

        const sortedIndexes = [...removedIndexes].sort((a, b) => a - b);
        const removedBeforeCurrent = sortedIndexes.filter((index) => index < currentIndex).length;

        if (sortedIndexes.includes(currentIndex)) {
            const removedAtOrBeforeCurrent = sortedIndexes.filter((index) => index <= currentIndex).length;
            return Math.min(currentIndex - removedAtOrBeforeCurrent + 1, nextLength - 1);
        }

        return Math.max(0, currentIndex - removedBeforeCurrent);
    }
}
