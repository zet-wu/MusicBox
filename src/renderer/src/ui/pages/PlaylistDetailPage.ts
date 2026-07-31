/**
 * 歌单页组件
 */

import {Component} from "@ui/base/Component";
import {appNotificationService} from "@/features/appShell/service";
import {
    FAVORITES_PLAYLIST_ID,
    favoriteService
} from "@/features/library/service/FavoriteService";
import {libraryDataService} from "@/features/library/service/LibraryDataService";
import {CoverLoadQueue} from "@/features/mediaAssets/service/CoverLoadQueue";
import {coverLookupService} from "@/features/mediaAssets/service/CoverLookupService";
import {
    playlistInfoAlignmentPreferenceService,
    trackCoverDisplayPreferenceService,
    trackCoverNetworkPreferenceService
} from "@/features/settings/service";
import {playlistCoverActionService} from "@/features/playlists/service/PlaylistCoverActionService";
import {
    getCollectionCapabilities,
    type CollectionType
} from "@/features/playlists/domain/CollectionCapabilities";
import {playlistDataService} from "@/features/playlists/service/PlaylistDataService";
import {playlistFileImportService} from "@/features/playlists/service/PlaylistFileImportService";
import {playlistPlaybackActionService} from "@/features/playlists/service/PlaylistPlaybackActionService";
import {playlistTrackMutationService} from "@/features/playlists/service/PlaylistTrackMutationService";
import type {Unsubscribe} from "@api/types/common";
import type {Playlist, Track} from "@api/types/library";
import type {PlaylistInfoAlignment} from "@api/types/settings";
import {ElementVirtualizer} from "@ui/virtualization/ElementVirtualizer";
import type {VirtualItem} from "@tanstack/virtual-core";

type PlaylistDetailTrack = Track & {
    fileId?: string;
    fileName?: string;
};

type PlaylistDetail = Partial<Playlist> & {
    id: string;
    name: string;
    description?: string;
    createdAt?: number | string | Date;
    trackIds?: string[];
    trackCount?: number;
    coverImage?: string | null;
    collectionType?: CollectionType;
};

interface CoverResult {
    success?: boolean;
    imageUrl?: string;
    type?: string;
    filePath?: string;
    error?: string;
}

class PlaylistDetailPage extends Component {
    public isVisible: boolean;
    public currentPlaylist: PlaylistDetail | null;
    public tracks: PlaylistDetailTrack[];
    private sourceTracks: PlaylistDetailTrack[];
    private searchTrackIds: Set<string> | null;
    public selectedTracks: Set<number>;
    private container: HTMLElement | null;
    private isMultiSelectMode: boolean;
    private lastSelectedIndex: number;
    private showCovers: boolean;
    private playlistInfoAlignment: PlaylistInfoAlignment;
    private documentClickHandler: ((event: Event) => void) | null;
    private listenersSetup = false;
    private coverDisplayPreferenceUnsubscribe: Unsubscribe | null = null;
    private playlistInfoAlignmentUnsubscribe: Unsubscribe | null = null;
    private favoriteUnsubscribe: Unsubscribe | null = null;
    private networkCoverPreferenceUnsubscribe: Unsubscribe | null = null;
    private trackVirtualizer: ElementVirtualizer | null = null;
    private readonly coverLoadQueue = new CoverLoadQueue(4);
    private viewGeneration = 0;

    constructor(container: string | Element | null) {
        super(container);
        this.isVisible = false;
        this.currentPlaylist = null;
        this.tracks = [];
        this.sourceTracks = [];
        this.searchTrackIds = null;
        this.selectedTracks = new Set();
        this.isMultiSelectMode = false;
        this.lastSelectedIndex = -1;
        this.container = this.element instanceof HTMLElement ? this.element : null;
        this.documentClickHandler = null;

        // 获取封面显示设置
        this.showCovers = this.getShowCoversSettings();
        this.playlistInfoAlignment = playlistInfoAlignmentPreferenceService.getAlignment();

        this.setupElements();
        this.setupSettingsListener();
        this.networkCoverPreferenceUnsubscribe = trackCoverNetworkPreferenceService.onChanged(() => {
            if (this.isVisible) {
                this.render();
            }
        });
        this.favoriteUnsubscribe = favoriteService.onChanged(({trackIds}) => {
            if (!this.isVisible) {
                return;
            }

            if (this.getCollectionType() === 'favorites') {
                void this.refreshFavoritesInPlace();
            } else if (this.sourceTracks.some((track) => track.fileId && trackIds.includes(track.fileId))) {
                this.updateFavoriteButtons(trackIds);
            }
        });
    }

    async show(playlist: PlaylistDetail): Promise<void> {
        const viewGeneration = ++this.viewGeneration;
        this.isVisible = true;
        this.currentPlaylist = playlist;
        this.searchTrackIds = null;
        this.clearSelection();

        if (this.element instanceof HTMLElement) {
            // 预设样式，减少可见的样式变换
            this.element.style.display = 'block';
            this.element.style.opacity = '0';
            this.element.style.transform = 'translateY(10px)';
        }

        // 每次显示新歌单时刷新数据和视图，事件由容器级委托保持稳定
        await this.loadPlaylistCover(viewGeneration);
        if (!this.isCurrentView(viewGeneration, playlist)) {
            return;
        }
        await this.loadPlaylistTracks(false, viewGeneration);
        if (!this.isCurrentView(viewGeneration, playlist)) {
            return;
        }
        this.render();

        // 平滑显示页面
        if (this.element instanceof HTMLElement) {
            const element = this.element;
            this.requestAnimationFrameManaged(() => {
                element.style.transition = 'opacity 0.3s ease, transform 0.3s ease';
                element.style.opacity = '1';
                element.style.transform = 'translateY(0)';
            });
        }
    }

    async showSystemCollection(collectionType: Exclude<CollectionType, 'playlist'>): Promise<void> {
        const playlist: PlaylistDetail = collectionType === 'favorites'
            ? {
                id: FAVORITES_PLAYLIST_ID,
                name: '收藏',
                description: '珍藏您喜爱的歌曲',
                systemType: 'favorites',
                collectionType
            }
            : {
                id: 'system:all-tracks',
                name: '全部歌曲',
                collectionType
            };
        await this.show(playlist);
    }

    hide(): void {
        this.viewGeneration += 1;
        this.isVisible = false;
        this.coverLoadQueue.beginBatch();
        this.destroyTrackVirtualizer();
        this.currentPlaylist = null;
        this.tracks = [];
        this.sourceTracks = [];
        this.searchTrackIds = null;

        this.hideCoverContextMenu();

        if (this.container) {
            this.container.innerHTML = '';
        }
    }

    destroy(): void {
        this.viewGeneration += 1;
        this.coverLoadQueue.destroy();
        this.destroyTrackVirtualizer();
        if (this.coverDisplayPreferenceUnsubscribe) {
            this.coverDisplayPreferenceUnsubscribe();
            this.coverDisplayPreferenceUnsubscribe = null;
        }
        if (this.playlistInfoAlignmentUnsubscribe) {
            this.playlistInfoAlignmentUnsubscribe();
            this.playlistInfoAlignmentUnsubscribe = null;
        }
        if (this.favoriteUnsubscribe) {
            this.favoriteUnsubscribe();
            this.favoriteUnsubscribe = null;
        }
        if (this.networkCoverPreferenceUnsubscribe) {
            this.networkCoverPreferenceUnsubscribe();
            this.networkCoverPreferenceUnsubscribe = null;
        }
        this.hideCoverContextMenu();
        super.destroy();
    }

    setupElements(): void {
        this.container = this.element instanceof HTMLElement ? this.element : null;
        this.setupEventListeners();
    }

    getShowCoversSettings(): boolean {
        return trackCoverDisplayPreferenceService.isEnabled();
    }

    setupSettingsListener(): void {
        this.coverDisplayPreferenceUnsubscribe = trackCoverDisplayPreferenceService.onChanged((enabled) => {
            this.showCovers = enabled;
            if (this.isVisible) {
                this.render();
            }
        });
        this.playlistInfoAlignmentUnsubscribe = playlistInfoAlignmentPreferenceService.onChanged((alignment) => {
            this.playlistInfoAlignment = alignment;
            this.updatePlaylistInfoAlignment();
        });
    }

    private updatePlaylistInfoAlignment(): void {
        const info = this.container?.querySelector('.playlist-detail-info');
        if (!info) {
            return;
        }

        info.classList.remove('align-left', 'align-center', 'align-right');
        info.classList.add(`align-${this.playlistInfoAlignment}`);
    }

    updatePlaylistInfo(playlist: Pick<PlaylistDetail, 'id' | 'name' | 'description'>): boolean {
        if (
            !this.isVisible
            || !this.currentPlaylist
            || this.currentPlaylist.id !== playlist.id
            || this.getCollectionType() !== 'playlist'
        ) {
            return false;
        }

        this.currentPlaylist.name = playlist.name;
        this.currentPlaylist.description = playlist.description || '';
        this.render();
        return true;
    }

    applySearchResults(results: Track[] | null): boolean {
        if (!this.isVisible || this.getCollectionType() === 'playlist') {
            return false;
        }

        this.searchTrackIds = results
            ? new Set(results.map((track) => this.getTrackIdentity(track)).filter(Boolean))
            : null;
        this.applySourceTracks();
        this.clearSelection();
        this.render();
        return true;
    }

    async reloadSystemCollection(): Promise<boolean> {
        if (!this.isVisible || this.getCollectionType() === 'playlist') {
            return false;
        }

        await this.loadPlaylistTracks();
        return true;
    }

    isSystemCollectionVisible(): boolean {
        return this.isVisible && this.getCollectionType() !== 'playlist';
    }

    render(): void {
        if (!this.currentPlaylist || !this.container) return;

        this.coverLoadQueue.beginBatch();
        const capabilities = getCollectionCapabilities(this.getCollectionType());
        const createdDate = new Date(this.currentPlaylist.createdAt || Date.now());
        // 使用实际加载的tracks数量，确保UI状态与数据一致
        const trackCount = this.tracks ? this.tracks.length : (this.currentPlaylist.resolvedTrackCount ?? 0);
        const totalDuration = this.calculateTotalDuration();

        this.container.innerHTML = `
            <div class="page-content playlist-page">
                <!-- 现代化Hero区域 -->
                <div class="playlist-hero">
                    <div class="hero-background">
                        <div class="gradient-overlay"></div>
                    </div>
                    <div class="hero-content">
                        <div class="playlist-cover-container">
                            <div class="playlist-cover" id="playlist-cover" data-playlist-id="${this.currentPlaylist.id}">
                                ${this.renderPlaylistCover()}
                                <div class="cover-shadow"></div>
                            </div>
                        </div>
                        <div class="playlist-detail-info align-${this.playlistInfoAlignment}">
                            <h1 class="playlist-title">${this.escapeHtml(this.currentPlaylist.name)}</h1>
                            ${this.currentPlaylist.description ? `
                            <p class="playlist-description">${this.escapeHtml(this.currentPlaylist.description)}</p>
                            ` : ''}
                            <div class="playlist-meta">
                                <span class="meta-item">
                                    <svg class="meta-icon" viewBox="0 0 24 24">
                                        <path d="M12,3V12.26C11.5,12.09 11,12 10.5,12C8.01,12 6,14.01 6,16.5S8.01,21 10.5,21S15,18.99 15,16.5V6H19V3H12Z"/>
                                    </svg>
                                    <span class="meta-track-count">${trackCount} 首歌曲</span>
                                </span>
                                <span class="meta-item">
                                    <svg class="meta-icon" viewBox="0 0 24 24">
                                        <path d="M12,2A10,10 0 0,0 2,12A10,10 0 0,0 12,22A10,10 0 0,0 22,12A10,10 0 0,0 12,2M16.2,16.2L11,13V7H12.5V12.2L17,14.9L16.2,16.2Z"/>
                                    </svg>
                                    <span class="meta-total-duration">${this.formatTotalDuration(totalDuration)}</span>
                                </span>
                                ${capabilities.showCreatedDate ? `<span class="meta-item">
                                    <svg class="meta-icon" viewBox="0 0 24 24">
                                        <path d="M19,3H5C3.89,3 3,3.89 3,5V19A2,2 0 0,0 5,21H19A2,2 0 0,0 21,19V5C21,3.89 20.1,3 19,3M19,5V19H5V5H19Z"/>
                                    </svg>
                                    <span>创建于 ${createdDate.toLocaleDateString('zh-CN')}</span>
                                </span>` : ''}
                            </div>
                        </div>
                    </div>
                </div>

                <!-- 现代化操作按钮区域 -->
                <div class="playlist-actions">
                    <div class="actions-primary">
                        <button class="play-btn primary" id="playlist-play-all" ${trackCount === 0 ? 'disabled' : ''}>
                            <div class="btn-content">
                                <svg class="play-icon" viewBox="0 0 24 24">
                                    <path d="M8,5.14V19.14L19,12.14L8,5.14Z"/>
                                </svg>
                                <span class="btn-text">播放全部</span>
                            </div>
                        </button>
                        <button class="play-btn primary" id="playlist-add-all" ${trackCount === 0 ? 'disabled' : ''}>
                            <div class="btn-content">
                                <svg class="play-icon" viewBox="0 0 24 24">
                                    <path d="M19,13H13V19H11V13H5V11H11V5H13V11H19V13Z"/>
                                </svg>
                                <span class="btn-text">添加到播放列表</span>
                            </div>
                        </button>
                    </div>
                    ${capabilities.canAddSongs || capabilities.canClear ? `<div class="actions-secondary">
                        ${capabilities.canAddSongs ? `
                        <button class="action-btn add-songs" id="playlist-add-songs">
                            <svg class="icon" viewBox="0 0 24 24">
                                <path d="M19,13H13V19H11V13H5V11H11V5H13V11H19V13Z"/>
                            </svg>
                            <span>从文件添加歌曲</span>
                        </button>
                        <button class="action-btn add-from-folder" id="playlist-add-from-folder">
                            <svg class="icon" viewBox="0 0 24 24">
                                <path d="M10,4H4C2.89,4 2,4.89 2,6V18A2,2 0 0,0 4,20H20A2,2 0 0,0 22,18V8C22,6.89 21.1,6 20,6H12L10,4M14,12H12V14H10V12H8V10H10V8H12V10H14V12Z"/>
                            </svg>
                            <span>管理绑定文件夹</span>
                        </button>
                        ` : ''}
                        ${capabilities.canClear ? `
                        <div class="action-menu">
                            <button class="action-btn menu-trigger" id="playlist-menu">
                                <svg class="icon" viewBox="0 0 24 24">
                                    <path d="M12,16A2,2 0 0,1 14,18A2,2 0 0,1 12,20A2,2 0 0,1 10,18A2,2 0 0,1 12,16M12,10A2,2 0 0,1 14,12A2,2 0 0,1 12,14A2,2 0 0,1 10,12A2,2 0 0,1 12,10M12,4A2,2 0 0,1 14,6A2,2 0 0,1 12,8A2,2 0 0,1 10,6A2,2 0 0,1 12,4Z"/>
                                </svg>
                            </button>
                            <div class="menu-dropdown" id="playlist-menu-dropdown">
                                <button class="menu-item" id="playlist-clear" ${trackCount === 0 ? 'disabled' : ''}>
                                    <svg class="menu-icon" viewBox="0 0 24 24">
                                        <path d="M19,4H15.5L14.5,3H9.5L8.5,4H5V6H19M6,19A2,2 0 0,0 8,21H16A2,2 0 0,0 18,19V7H6V19Z"/>
                                    </svg>
                                    <span>${this.getCollectionType() === 'favorites' ? '清空收藏' : '清空歌单'}</span>
                                </button>
                            </div>
                        </div>
                        ` : ''}
                    </div>` : ''}
                </div>

                ${this.renderTracksSection()}
            </div>
        `;

        this.mountTrackVirtualizer();
    }

    setupEventListeners(): void {
        if (!this.container || this.listenersSetup) {
            return;
        }

        this.addEventListenerManaged(this.container, 'click', (event: Event) => {
            void this.handleContainerClick(event);
        });
        this.addEventListenerManaged(this.container, 'dblclick', (event: Event) => {
            void this.handleContainerDoubleClick(event);
        });
        this.addEventListenerManaged(this.container, 'contextmenu', (event: Event) => {
            this.handleContainerContextMenu(event as MouseEvent);
        });

        this.documentClickHandler = (event: Event) => {
            this.handleDocumentClick(event);
        };
        this.addEventListenerManaged(document, 'click', this.documentClickHandler);
        this.listenersSetup = true;
    }

    private async handleContainerClick(event: Event): Promise<void> {
        if (!this.isVisible) {
            return;
        }

        const target = event.target instanceof Element ? event.target : null;
        if (!target) {
            return;
        }

        const coverMenuItem = target.closest<HTMLElement>('.cover-context-menu .context-menu-item');
        if (coverMenuItem) {
            await this.handleCoverContextMenuAction(coverMenuItem.id);
            return;
        }

        const menuTrigger = target.closest<HTMLElement>('#playlist-menu');
        if (menuTrigger) {
            event.stopPropagation();
            this.togglePlaylistMenu();
            return;
        }

        const actionButton = target.closest<HTMLElement>(
            '#playlist-play-all, #playlist-add-all, #playlist-add-songs, #playlist-add-from-folder, #select-all-tracks, #clear-selection, #playlist-clear, .empty-action-btn'
        );
        if (actionButton) {
            await this.handleActionButtonClick(actionButton);
            return;
        }

        const actionTrackRow = target.closest<HTMLElement>('.track-row');
        if (!actionTrackRow) {
            return;
        }

        const index = this.getTrackIndexFromRow(actionTrackRow);
        if (index === null) {
            return;
        }

        const track = this.tracks[index];
        if (!track) {
            return;
        }

        const trackAction = target.closest<HTMLElement>('.track-action-btn')?.dataset.action;
        if (trackAction === 'like') {
            await this.toggleTrackLike(track, index);
            return;
        }

        if (trackAction === 'remove') {
            if (this.selectedTracks.size > 1 && this.selectedTracks.has(index)) {
                await this.removeSelectedTracks();
            } else {
                await this.removeTrackFromPlaylist(track, index);
            }
            return;
        }

        const mouseEvent = event as MouseEvent;
        if (mouseEvent.ctrlKey || mouseEvent.metaKey) {
            this.toggleTrackSelection(index);
        } else if (mouseEvent.shiftKey && this.selectedTracks.size > 0) {
            this.selectTrackRange(index);
        } else if (this.isMultiSelectMode) {
            this.toggleTrackSelection(index);
        }
    }

    private async handleActionButtonClick(button: HTMLElement): Promise<void> {
        if (button.hasAttribute('disabled')) {
            return;
        }

        switch (button.id) {
            case 'playlist-play-all':
                await this.playAllTracks();
                break;
            case 'playlist-add-all':
                await this.appendAllTracks();
                break;
            case 'playlist-add-songs':
                await this.addFromFiles();
                break;
            case 'playlist-add-from-folder':
                this.manageFolderBindings();
                break;
            case 'select-all-tracks':
                this.toggleSelectAllTracks();
                break;
            case 'clear-selection':
                this.clearSelection();
                break;
            case 'playlist-clear':
                this.hidePlaylistMenu();
                await this.clearPlaylist();
                break;
            default:
                if (button.classList.contains('empty-action-btn')) {
                    await this.addFromFiles();
                }
        }
    }

    private async handleContainerDoubleClick(event: Event): Promise<void> {
        if (!this.isVisible) {
            return;
        }

        const target = event.target instanceof Element ? event.target : null;
        if (!target || target.closest('.track-action-btn')) {
            return;
        }

        const cover = target.closest<HTMLElement>('#playlist-cover');
        if (cover && getCollectionCapabilities(this.getCollectionType()).canEditCover) {
            this.showCoverContextMenuFromEvent(event as MouseEvent);
            return;
        }

        const row = target.closest<HTMLElement>('.track-row');
        const index = this.getTrackIndexFromRow(row);
        const track = index === null ? null : this.tracks[index];
        if (track && index !== null) {
            await this.playTrack(track, index);
        }
    }

    private handleContainerContextMenu(event: MouseEvent): void {
        if (!this.isVisible) {
            return;
        }

        const target = event.target instanceof Element ? event.target : null;
        if (!target) {
            return;
        }

        const cover = target.closest<HTMLElement>('#playlist-cover');
        if (cover && getCollectionCapabilities(this.getCollectionType()).canEditCover) {
            event.preventDefault();
            this.showCoverContextMenu(event.clientX, event.clientY);
            return;
        }

        const row = target.closest<HTMLElement>('.track-row');
        const index = this.getTrackIndexFromRow(row);
        const track = index === null ? null : this.tracks[index];
        if (!track || index === null) {
            return;
        }

        event.preventDefault();
        if (!this.selectedTracks.has(index)) {
            this.selectedTracks.clear();
            this.selectedTracks.add(index);
            this.lastSelectedIndex = index;
            this.updateMultiSelectMode();
            this.updateTrackSelectionUI();
        }
        this.showTrackContextMenu(event.clientX, event.clientY, track, index);
    }

    private handleDocumentClick(event: Event): void {
        if (!this.isVisible) {
            return;
        }

        const targetElement = event.target instanceof Element ? event.target : null;
        const coverMenuItem = targetElement?.closest<HTMLElement>('.cover-context-menu .context-menu-item');
        if (coverMenuItem) {
            void this.handleCoverContextMenuAction(coverMenuItem.id);
            return;
        }

        const target = event.target as Node | null;
        const playlistMenu = this.container?.querySelector('#playlist-menu-dropdown');
        if (playlistMenu && target && !playlistMenu.contains(target)) {
            this.hidePlaylistMenu();
        }

        const coverMenu = document.querySelector('.cover-context-menu');
        if (coverMenu && target && !coverMenu.contains(target)) {
            this.hideCoverContextMenu();
        }
    }

    private togglePlaylistMenu(): void {
        this.container?.querySelector('#playlist-menu-dropdown')?.classList.toggle('show');
    }

    private hidePlaylistMenu(): void {
        this.container?.querySelector('#playlist-menu-dropdown')?.classList.remove('show');
    }

    private async handleCoverContextMenuAction(actionId: string): Promise<void> {
        this.hideCoverContextMenu();
        if (actionId === 'add-cover') {
            await this.selectAndSetCover();
        } else if (actionId === 'remove-cover') {
            await this.removeCover();
        }
    }

    private showCoverContextMenuFromEvent(event: MouseEvent): void {
        this.showCoverContextMenu(event.clientX, event.clientY);
    }

    private getTrackIndexFromRow(row: HTMLElement | null): number | null {
        if (!row) {
            return null;
        }

        const index = Number.parseInt(row.dataset.trackIndex || '', 10);
        return Number.isInteger(index) && index >= 0 ? index : null;
    }

    async loadPlaylistCover(viewGeneration = this.viewGeneration): Promise<void> {
        const playlist = this.currentPlaylist;
        if (!playlist) return;
        if (!getCollectionCapabilities(this.getCollectionType()).canEditCover) {
            playlist.coverImage = null;
            return;
        }

        try {
            const result = await playlistDataService.getPlaylistCover(playlist.id);
            if (!this.isCurrentView(viewGeneration, playlist)) {
                return;
            }
            if (result.success && result.coverPath) {
                playlist.coverImage = result.coverPath;
            } else {
                playlist.coverImage = null;
            }
        } catch (error) {
            if (!this.isCurrentView(viewGeneration, playlist)) {
                return;
            }
            console.error('❌ PlaylistDetailPage: 加载歌单封面失败', error);
            playlist.coverImage = null;
        }
    }

    async loadPlaylistTracks(renderPage = true, viewGeneration = this.viewGeneration): Promise<void> {
        const playlist = this.currentPlaylist;
        if (!playlist) return;
        const collectionType = this.getCollectionType();
        try {
            if (collectionType === 'all-tracks') {
                const tracks = await libraryDataService.getTracks();
                if (!this.isCurrentView(viewGeneration, playlist)) {
                    return;
                }
                this.sourceTracks = tracks;
                this.applySourceTracks();
                playlist.trackIds = this.sourceTracks
                    .map((track) => track.fileId)
                    .filter((fileId): fileId is string => Boolean(fileId));
                playlist.trackCount = this.tracks.length;
                if (renderPage) this.render();
                return;
            }

            const result = await playlistDataService.getPlaylistDetail(playlist.id);
            if (!this.isCurrentView(viewGeneration, playlist)) {
                return;
            }
            if (result.success) {
                this.sourceTracks = (result.tracks || result.playlist?.tracks || []) as PlaylistDetailTrack[];
                this.applySourceTracks();

                // 同步更新currentPlaylist对象，确保UI状态正确
                if (result.playlist) {
                    const playlistDetail = result.playlist as PlaylistDetail;
                    playlist.trackIds = playlistDetail.trackIds || [];
                    playlist.trackCount = this.tracks.length;
                    // 如果有其他需要同步的属性，也在这里更新
                    if (collectionType === 'playlist') {
                        if (playlistDetail.name) playlist.name = playlistDetail.name;
                        if (playlistDetail.description !== undefined) playlist.description = playlistDetail.description;
                    }
                }

                if (renderPage) this.render();
            } else {
                console.error('❌ PlaylistDetailPage: 加载歌单歌曲失败', result.error);
                this.sourceTracks = [];
                this.tracks = [];
                // 同步更新空状态
                playlist.trackIds = [];
                playlist.trackCount = 0;
                if (renderPage) this.render();
            }
        } catch (error) {
            if (!this.isCurrentView(viewGeneration, playlist)) {
                return;
            }
            console.error('❌ PlaylistDetailPage: 加载歌单歌曲失败', error);
            this.sourceTracks = [];
            this.tracks = [];
            // 同步更新空状态
            playlist.trackIds = [];
            playlist.trackCount = 0;
            if (renderPage) this.render();
        }
    }

    private isCurrentView(viewGeneration: number, playlist: PlaylistDetail): boolean {
        return this.isVisible
            && this.viewGeneration === viewGeneration
            && this.currentPlaylist === playlist;
    }

    private renderTracksSection(): string {
        const trackCount = this.tracks.length;
        return `
            <div class="tracks-section">
                ${trackCount > 0 ? `
                <div class="tracks-header">
                    <div class="header-left">
                        <h3 class="tracks-title">歌曲列表</h3>
                        <span class="tracks-count">${trackCount} 首歌曲</span>
                    </div>
                    <div class="header-right">
                        <div class="tracks-controls">
                            <button class="control-btn" id="select-all-tracks">
                                <svg class="icon" viewBox="0 0 24 24">
                                    <path d="M9,20.42L2.79,14.21L5.62,11.38L9,14.77L18.88,4.88L21.71,7.71L9,20.42Z"/>
                                </svg>
                                <span>全选</span>
                            </button>
                            <button class="control-btn" id="clear-selection" style="display: none;">
                                <svg class="icon" viewBox="0 0 24 24">
                                    <path d="M19,6.41L17.59,5L12,10.59L6.41,5L5,6.41L10.59,12L5,17.59L6.41,19L12,13.41L17.59,19L19,6.41Z"/>
                                </svg>
                                <span>取消选择</span>
                            </button>
                        </div>
                    </div>
                </div>
                ` : ''}
                <div class="tracks-container" id="playlist-track-list">
                    ${this.renderTrackList()}
                </div>
            </div>
        `;
    }

    renderTrackList(): string {
        if (this.tracks.length === 0) {
            const capabilities = getCollectionCapabilities(this.getCollectionType());
            const emptyTitle = this.getCollectionType() === 'favorites'
                ? '还没有收藏歌曲'
                : this.getCollectionType() === 'all-tracks'
                    ? '音乐库还是空的'
                    : '歌单还是空的';
            const emptyDescription = this.getCollectionType() === 'favorites'
                ? '点击歌曲旁的心形按钮，或添加歌曲到收藏'
                : this.getCollectionType() === 'all-tracks'
                    ? '导入音乐后，歌曲会显示在这里'
                    : '添加一些您喜欢的音乐，开始您的音乐之旅';
            return `
                <div class="playlist-empty-state">
                    <div class="empty-content">
                        <div class="empty-illustration">
                            <svg class="empty-icon" viewBox="0 0 24 24">
                                <path d="M12,3V12.26C11.5,12.09 11,12 10.5,12C8.01,12 6,14.01 6,16.5S8.01,21 10.5,21S15,18.99 15,16.5V6H19V3H12Z"/>
                            </svg>
                            <div class="empty-waves">
                                <div class="wave wave-1"></div>
                                <div class="wave wave-2"></div>
                                <div class="wave wave-3"></div>
                            </div>
                        </div>
                        <h3 class="empty-title">${emptyTitle}</h3>
                        <p class="empty-description">${emptyDescription}</p>
                        ${capabilities.canAddSongs ? `
                        <button class="empty-action-btn" type="button">
                            <svg class="icon" viewBox="0 0 24 24">
                                <path d="M19,13H13V19H11V13H5V11H11V5H13V11H19V13Z"/>
                            </svg>
                            <span>添加歌曲</span>
                        </button>
                        ` : ''}
                    </div>
                </div>
            `;
        }

        return `
            <div class="modern-tracks-table ${this.showCovers ? 'with-covers' : ''}">
                <div class="tracks-table-header">
                    <div class="header-cell cell-number">#</div>
                    ${this.showCovers ? '<div class="header-cell cell-cover">封面</div>' : ''}
                    <div class="header-cell cell-title">歌曲</div>
                    <div class="header-cell cell-album">专辑</div>
                    <div class="header-cell cell-duration">
                        <svg class="duration-icon" viewBox="0 0 24 24">
                            <path d="M12,2A10,10 0 0,0 2,12A10,10 0 0,0 12,22A10,10 0 0,0 22,12A10,10 0 0,0 12,2M16.2,16.2L11,13V7H12.5V12.2L17,14.9L16.2,16.2Z"/>
                        </svg>
                    </div>
                    <div class="header-cell cell-actions"></div>
                </div>
                <div class="tracks-table-body virtual-track-body"></div>
            </div>
        `;
    }

    private renderTrackRow(track: PlaylistDetailTrack, index: number, virtualItem: VirtualItem, scrollMargin: number): string {
        const capabilities = getCollectionCapabilities(this.getCollectionType());
        const translateY = virtualItem.start - scrollMargin;
        return `
                        <div class="track-row ${this.selectedTracks.has(index) ? 'selected' : ''} ${index === this.tracks.length - 1 ? 'is-last-track' : ''}"
                             data-index="${index}"
                             data-track-index="${index}"
                             style="transform: translateY(${translateY}px);">
                            <div class="track-cell cell-number">
                                <div class="track-number-container">
                                    <span class="track-number">${index + 1}</span>
                                    <div class="play-indicator">
                                        <svg class="play-icon" viewBox="0 0 24 24">
                                            <path d="M8,5.14V19.14L19,12.14L8,5.14Z"/>
                                        </svg>
                                    </div>
                                </div>
                            </div>
                            ${this.showCovers ? `
                            <div class="track-cell cell-cover">
                                <img class="track-cover" src="${this.getTrackCover(track, index)}" alt="封面" loading="lazy" onerror="this.src='assets/images/default-cover.svg'">
                            </div>
                            ` : ''}
                            <div class="track-cell cell-title">
                                <div class="track-main-info">
                                    <div class="track-name">${this.escapeHtml(track.title || track.fileName)}</div>
                                    <div class="track-artist">${this.escapeHtml(track.artist || '未知艺术家')}</div>
                                </div>
                            </div>
                            <div class="track-cell cell-album">
                                <span class="album-name">${this.escapeHtml(track.album || '未知专辑')}</span>
                            </div>
                            <div class="track-cell cell-duration">
                                <span class="duration-text">${this.formatDuration(track.duration)}</span>
                            </div>
                            <div class="track-cell cell-actions">
                                <div class="track-actions">
                                    <button class="track-action-btn like-btn ${favoriteService.isFavorite(track) ? 'active' : ''}"
                                            data-action="like"
                                            type="button"
                                            aria-pressed="${favoriteService.isFavorite(track)}"
                                            title="${favoriteService.isFavorite(track) ? '取消收藏' : '收藏'}">
                                        <svg class="icon" viewBox="0 0 24 24">
                                            <path d="M12,21.35L10.55,20.03C5.4,15.36 2,12.27 2,8.5 2,5.41 4.42,3 7.5,3C9.24,3 10.91,3.81 12,5.08C13.09,3.81 14.76,3 16.5,3C19.58,3 22,5.41 22,8.5C22,12.27 18.6,15.36 13.45,20.03L12,21.35Z"/>
                                        </svg>
                                    </button>
                                    ${capabilities.canRemoveTracks ? `<button class="track-action-btn remove-btn" data-action="remove">
                                        <svg class="icon" viewBox="0 0 24 24">
                                            <path d="M19,6.41L17.59,5L12,10.59L6.41,5L5,6.41L10.59,12L5,17.59L6.41,19L12,13.41L17.59,19L19,17.59L13.41,12L19,6.41Z"/>
                                        </svg>
                                    </button>` : ''}
                                </div>
                            </div>
                        </div>
        `;
    }

    private mountTrackVirtualizer(): void {
        this.destroyTrackVirtualizer();
        if (!this.container || this.tracks.length === 0) {
            return;
        }

        const body = this.container.querySelector<HTMLElement>('.virtual-track-body');
        const scrollElement = document.querySelector<HTMLElement>('.main-content');
        if (!body || !scrollElement) {
            return;
        }

        const scrollMargin = this.getScrollMargin(body, scrollElement);
        this.trackVirtualizer = new ElementVirtualizer({
            count: this.tracks.length,
            estimateSize: () => this.showCovers ? 73 : 65,
            getItemKey: (index) => this.getTrackIdentity(this.tracks[index]) || index,
            getScrollElement: () => scrollElement,
            scrollMargin,
            overscan: 8,
            onChange: (items, totalSize) => {
                if (!this.isVisible || !this.trackVirtualizer) {
                    return;
                }

                body.style.height = `${totalSize}px`;
                body.innerHTML = items
                    .map((item) => {
                        const track = this.tracks[item.index];
                        return track ? this.renderTrackRow(track, item.index, item, scrollMargin) : '';
                    })
                    .join('');

                body.querySelectorAll<HTMLElement>('.track-row').forEach((row) => {
                    this.trackVirtualizer?.measureElement(row);
                });
            }
        });
        this.trackVirtualizer.mount();
    }

    private destroyTrackVirtualizer(): void {
        this.trackVirtualizer?.destroy();
        this.trackVirtualizer = null;
    }

    private getScrollMargin(body: HTMLElement, scrollElement: HTMLElement): number {
        const bodyRect = body.getBoundingClientRect();
        const scrollRect = scrollElement.getBoundingClientRect();
        return bodyRect.top - scrollRect.top + scrollElement.scrollTop;
    }

    async playTrack(track: PlaylistDetailTrack, index: number): Promise<void> {
        try {
            this.emit(
                'trackPlayed',
                track,
                index,
                this.tracks,
                playlistPlaybackActionService.getDoubleClickMode()
            );
        } catch (error) {
            console.error('❌ PlaylistDetailPage: 播放歌曲失败', error);
        }
    }

    async playAllTracks(): Promise<void> {
        const tracks = playlistPlaybackActionService.getPlayableTracks(this.tracks);
        if (tracks) this.emit('playAllTracks', tracks);
    }

    async appendAllTracks(): Promise<void> {
        const tracks = playlistPlaybackActionService.getPlayableTracks(this.tracks);
        if (tracks) this.emit('appendAllTracks', tracks);
    }

    async addFromFiles(): Promise<void> {
        if (
            !this.currentPlaylist
            || !getCollectionCapabilities(this.getCollectionType()).canAddSongs
        ) {
            return;
        }

        const result = await playlistFileImportService.addFromFiles(this.currentPlaylist.id);
        if (result.changed) {
            await this.loadPlaylistTracks();
            this.emit('playlistUpdated', this.currentPlaylist);
        }
    }

    manageFolderBindings(): void {
        if (!this.currentPlaylist || !getCollectionCapabilities(this.getCollectionType()).canAddSongs) {
            return;
        }
        this.emit('manageFolderBindings', this.currentPlaylist);
    }

    async clearPlaylist(): Promise<void> {
        if (
            !this.currentPlaylist
            || !this.sourceTracks.length
            || !getCollectionCapabilities(this.getCollectionType()).canClear
        ) return;

        const changed = await playlistTrackMutationService.clearPlaylist(this.currentPlaylist, this.sourceTracks);
        if (changed) {
            await this.loadPlaylistTracks();
            this.emit('playlistUpdated', this.currentPlaylist);
        }
    }

    // 多选功能方法
    toggleTrackSelection(index: number): void {
        if (this.selectedTracks.has(index)) {
            this.selectedTracks.delete(index);
        } else {
            this.selectedTracks.add(index);
        }
        this.lastSelectedIndex = index;
        this.updateMultiSelectMode();
        this.updateTrackSelectionUI();
    }

    selectTrackRange(endIndex: number): void {
        const startIndex = this.lastSelectedIndex >= 0 ? this.lastSelectedIndex : endIndex;
        const min = Math.min(startIndex, endIndex);
        const max = Math.max(startIndex, endIndex);
        for (let i = min; i <= max; i++) {
            this.selectedTracks.add(i);
        }
        this.updateMultiSelectMode();
        this.updateTrackSelectionUI();
    }

    selectAllTracks(): void {
        this.selectedTracks.clear();
        for (let i = 0; i < this.tracks.length; i++) {
            this.selectedTracks.add(i);
        }
        this.updateMultiSelectMode();
        this.updateTrackSelectionUI();
    }

    toggleSelectAllTracks(): void {
        if (this.selectedTracks.size === this.tracks.length && this.tracks.length > 0) {
            this.clearSelection();
            return;
        }

        this.selectAllTracks();
    }

    clearSelection(): void {
        this.selectedTracks.clear();
        this.lastSelectedIndex = -1;
        this.updateMultiSelectMode();
        this.updateTrackSelectionUI();
    }

    updateMultiSelectMode(): void {
        if (!this.container) return;
        this.isMultiSelectMode = this.selectedTracks.size > 0;

        // 更新清除选择按钮的显示状态
        const clearSelectionBtn = this.container.querySelector('#clear-selection');
        if (clearSelectionBtn) {
            (clearSelectionBtn as HTMLElement).style.display = this.isMultiSelectMode ? 'block' : 'none';
        }

        // 更新全选按钮文本
        const selectAllBtn = this.container.querySelector('#select-all-tracks');
        if (selectAllBtn) {
            const textElement = selectAllBtn.querySelector('span');
            const label = this.selectedTracks.size === this.tracks.length && this.tracks.length > 0 ? '取消全选' : '全选';
            if (this.selectedTracks.size === this.tracks.length && this.tracks.length > 0) {
                selectAllBtn.classList.add('is-all-selected');
            } else {
                selectAllBtn.classList.remove('is-all-selected');
            }

            if (textElement) {
                textElement.textContent = label;
            }
        }
    }

    updateTrackSelectionUI(): void {
        if (!this.container) return;
        const trackItems = this.container.querySelectorAll('.track-row');
        trackItems.forEach((item) => {
            const row = item as HTMLElement;
            const index = parseInt(row.dataset.trackIndex || '0');
            if (this.selectedTracks.has(index)) {
                row.classList.add('selected');
            } else {
                row.classList.remove('selected');
            }
        });
    }

    async removeSelectedTracks(): Promise<void> {
        if (
            this.selectedTracks.size === 0
            || !getCollectionCapabilities(this.getCollectionType()).canRemoveTracks
        ) return;

        if (!this.currentPlaylist) return;

        const selectedTracks = Array.from(this.selectedTracks)
            .sort((a, b) => b - a)
            .map((index) => this.tracks[index])
            .filter((track): track is PlaylistDetailTrack => Boolean(track));
        const result = await playlistTrackMutationService.removeSelectedTracks(this.currentPlaylist.id, selectedTracks);
        if (result.completed) {
            this.clearSelection();
            await this.loadPlaylistTracks();
            this.emit('playlistUpdated', this.currentPlaylist);
        }
    }

    async toggleTrackLike(track: PlaylistDetailTrack, _index: number): Promise<void> {
        const result = await favoriteService.toggle(track);
        if (!result.success) {
            appNotificationService.showError(result.error || '更新收藏状态失败');
        }
    }

    async removeTrackFromPlaylist(track: PlaylistDetailTrack, _index: number): Promise<void> {
        if (!this.currentPlaylist || !getCollectionCapabilities(this.getCollectionType()).canRemoveTracks) return;

        const changed = await playlistTrackMutationService.removeTrack(this.currentPlaylist.id, track);
        if (changed) {
            await this.loadPlaylistTracks();
            this.emit('playlistUpdated', this.currentPlaylist);
        }
    }

    calculateTotalDuration(): number {
        if (!this.tracks || this.tracks.length === 0) return 0;

        return this.tracks.reduce((total, track) => {
            return total + (track.duration || 0);
        }, 0);
    }

    formatTotalDuration(totalSeconds: number): string {
        if (!totalSeconds || totalSeconds <= 0) return '0 分钟';

        const hours = Math.floor(totalSeconds / 3600);
        const minutes = Math.floor((totalSeconds % 3600) / 60);

        if (hours > 0) {
            return `${hours} 小时 ${minutes} 分钟`;
        } else {
            return `${minutes} 分钟`;
        }
    }

    formatDuration(duration?: number): string {
        if (!duration || duration <= 0) return '--:--';

        const minutes = Math.floor(duration / 60);
        const seconds = Math.floor(duration % 60);
        return `${minutes}:${seconds.toString().padStart(2, '0')}`;
    }

    escapeHtml(text: unknown): string {
        const div = document.createElement('div');
        div.textContent = String(text ?? '');
        return div.innerHTML;
    }

    getTrackCover(track: PlaylistDetailTrack, index: number): string {
        // 优先使用已缓存的封面
        if (track.cover && typeof track.cover === 'string') {
            return track.cover;
        }

        // 异步获取封面，先返回默认封面
        this.loadTrackCoverAsync(track, index);
        return 'assets/images/default-cover.svg';
    }

    loadTrackCoverAsync(track: PlaylistDetailTrack, index: number): void {
        const coverKey = track.filePath || this.getTrackIdentity(track);
        if (!coverKey) {
            return;
        }

        this.coverLoadQueue.schedule(coverKey, async (signal) => {
            try {
                const coverResult = await coverLookupService.getCover(
                    track.title,
                    track.artist,
                    track.album,
                    track.filePath,
                    false,
                    {
                        allowNetwork: trackCoverNetworkPreferenceService.isEnabled(),
                        signal
                    }
                ) as CoverResult;

                if (signal.aborted || !this.isVisible || this.tracks[index] !== track) {
                    return;
                }

                if (coverResult.success && coverResult.imageUrl && typeof coverResult.imageUrl === 'string') {
                    let coverUrl = coverResult.imageUrl;

                    // 处理本地文件路径格式
                    if (coverResult.type === 'local-file' && coverResult.filePath) {
                        if (!coverUrl.startsWith('file://')) {
                            coverUrl = coverResult.filePath.replace(/\\/g, '/');
                            if (!coverUrl.startsWith('/')) {
                                coverUrl = '/' + coverUrl;
                            }
                            coverUrl = `file://${coverUrl}`;
                        }
                    }

                    // 更新track对象的封面信息
                    track.cover = coverUrl;

                    // 使用requestAnimationFrame确保DOM更新在下一帧进行
                    this.requestAnimationFrameManaged(() => {
                        if (!this.container || signal.aborted || this.tracks[index] !== track) return;
                        const trackRow = this.container.querySelector<HTMLElement>(
                            `.track-row[data-track-index="${index}"]`
                        );
                        const coverImg = trackRow?.querySelector<HTMLImageElement>('.track-cover');
                        if (coverImg) {
                            coverImg.src = track.cover || 'assets/images/default-cover.svg';
                        }
                    });
                } else if (coverResult.error !== '列表自动联网获取封面已关闭') {
                    console.warn(`⚠️ PlaylistDetailPage: 封面加载失败 - ${track.title}:`, coverResult.error || '未知错误');
                }
            } catch (error) {
                if (!signal.aborted) {
                    console.warn('PlaylistDetailPage: 加载封面失败:', error);
                }
            }
        });
    }

    // 渲染歌单封面
    renderPlaylistCover(): string {
        if (this.getCollectionType() === 'favorites') {
            return `
                <div class="cover-placeholder system-collection-cover favorites-cover">
                    <svg class="cover-icon" viewBox="0 0 24 24">
                        <path d="M12,21.35L10.55,20.03C5.4,15.36 2,12.27 2,8.5 2,5.41 4.42,3 7.5,3C9.24,3 10.91,3.81 12,5.08C13.09,3.81 14.76,3 16.5,3C19.58,3 22,5.41 22,8.5C22,12.27 18.6,15.36 13.45,20.03L12,21.35Z"/>
                    </svg>
                </div>
            `;
        }
        if (this.getCollectionType() === 'all-tracks') {
            return `
                <div class="cover-placeholder system-collection-cover library-cover">
                    <svg class="cover-icon" viewBox="0 0 24 24">
                        <path d="M12,3V12.26C11.5,12.09 11,12 10.5,12C8.01,12 6,14.01 6,16.5S8.01,21 10.5,21S15,18.99 15,16.5V6H19V3H12Z"/>
                    </svg>
                </div>
            `;
        }

        if (this.currentPlaylist && this.currentPlaylist.coverImage) {
            // 如果有自定义封面，显示自定义封面
            return `
                <img class="cover-image" src="file://${this.currentPlaylist.coverImage}" alt="歌单封面" />
            `;
        } else {
            // 显示默认占位符
            return `
                <div class="cover-placeholder">
                    <svg class="cover-icon" viewBox="0 0 24 24">
                        <path d="M15,6H3V8H15V6M15,10H3V12H15V10M3,16H11V14H3V16M17,6V14.18C16.69,14.07 16.35,14 16,14A3,3 0 0,0 13,17A3,3 0 0,0 16,20A3,3 0 0,0 19,17V8H22V6H17Z"/>
                    </svg>
                </div>
            `;
        }
    }

    // 显示封面右键菜单
    showCoverContextMenu(x: number, y: number): void {
        if (!getCollectionCapabilities(this.getCollectionType()).canEditCover) {
            return;
        }

        // 移除现有的菜单
        this.hideCoverContextMenu();

        const hasCustomCover = this.currentPlaylist && this.currentPlaylist.coverImage;

        const menu = document.createElement('div');
        menu.className = 'cover-context-menu';
        menu.innerHTML = `
            <div class="context-menu-item" id="add-cover">
                <svg class="menu-icon" viewBox="0 0 24 24">
                    <path d="M9,16V10H5L12,3L19,10H15V16H9M5,20V18H19V20H5Z"/>
                </svg>
                <span>${hasCustomCover ? '更换封面' : '添加封面'}</span>
            </div>
            ${hasCustomCover ? `
            <div class="context-menu-item" id="remove-cover">
                <svg class="menu-icon" viewBox="0 0 24 24">
                    <path d="M19,4H15.5L14.5,3H9.5L8.5,4H5V6H19M6,19A2,2 0 0,0 8,21H16A2,2 0 0,0 18,19V7H6V19Z"/>
                </svg>
                <span>移除封面</span>
            </div>
            ` : ''}
        `;

        // 设置菜单位置
        menu.style.position = 'fixed';
        menu.style.left = `${x}px`;
        menu.style.top = `${y}px`;
        menu.style.zIndex = '10000';

        document.body.appendChild(menu);

        // 调整菜单位置，确保不超出屏幕
        const rect = menu.getBoundingClientRect();
        if (rect.right > window.innerWidth) {
            menu.style.left = `${window.innerWidth - rect.width - 10}px`;
        }
        if (rect.bottom > window.innerHeight) {
            menu.style.top = `${window.innerHeight - rect.height - 10}px`;
        }
    }

    // 隐藏封面右键菜单
    hideCoverContextMenu(): void {
        const existingMenu = document.querySelector('.cover-context-menu');
        if (existingMenu) {
            existingMenu.remove();
        }
    }

    // 选择并设置封面
    async selectAndSetCover(): Promise<void> {
        if (!this.currentPlaylist || !getCollectionCapabilities(this.getCollectionType()).canEditCover) return;

        const result = await playlistCoverActionService.selectAndSetCover(this.currentPlaylist.id);
        if (result.changed) {
            this.currentPlaylist.coverImage = result.coverImage || null;
            this.updateCoverDisplay();
            this.emit('playlistUpdated', this.currentPlaylist);
            this.emit('playlistCoverUpdated', this.currentPlaylist);
        }
    }

    // 设置歌单封面
    async setCover(imagePath: string): Promise<void> {
        if (!this.currentPlaylist || !getCollectionCapabilities(this.getCollectionType()).canEditCover) return;

        const result = await playlistCoverActionService.setCover(this.currentPlaylist.id, imagePath);
        if (result.changed) {
            this.currentPlaylist.coverImage = result.coverImage || null;
            this.updateCoverDisplay();
            this.emit('playlistUpdated', this.currentPlaylist);
            this.emit('playlistCoverUpdated', this.currentPlaylist);
        }
    }

    // 移除歌单封面
    async removeCover(): Promise<void> {
        if (!this.currentPlaylist || !getCollectionCapabilities(this.getCollectionType()).canEditCover) return;

        const result = await playlistCoverActionService.removeCover(this.currentPlaylist.id);
        if (result.changed) {
            this.currentPlaylist.coverImage = result.coverImage || null;
            this.updateCoverDisplay();
            this.emit('playlistUpdated', this.currentPlaylist);
            this.emit('playlistCoverUpdated', this.currentPlaylist);
        }
    }

    // 更新封面显示
    updateCoverDisplay(): void {
        if (!this.container) return;
        const coverElement = this.container.querySelector('#playlist-cover');
        if (coverElement) {
            coverElement.innerHTML = this.renderPlaylistCover() + '<div class="cover-shadow"></div>';
        }
    }

    showTrackContextMenu(x: number, y: number, track: PlaylistDetailTrack, index: number): void {
        const selectedTrackItems = Array.from(this.selectedTracks)
            .sort((left, right) => left - right)
            .map((selectedIndex) => this.tracks[selectedIndex])
            .filter((item): item is PlaylistDetailTrack => Boolean(item));
        this.emit('trackRightClick', track, index, x, y, new Set(this.selectedTracks), selectedTrackItems);
    }

    private async refreshFavoritesInPlace(): Promise<void> {
        if (!this.isVisible || this.getCollectionType() !== 'favorites') {
            return;
        }

        await this.loadPlaylistTracks(false);
        if (this.isVisible && this.getCollectionType() === 'favorites') {
            this.updateCollectionContent();
        }
    }

    private updateFavoriteButtons(trackIds: string[]): void {
        if (!this.container || trackIds.length === 0) {
            return;
        }

        const changedIds = new Set(trackIds);
        this.container.querySelectorAll<HTMLElement>('.track-row').forEach((row) => {
            const index = this.getTrackIndexFromRow(row);
            const track = index === null ? null : this.tracks[index];
            if (!track?.fileId || !changedIds.has(track.fileId)) {
                return;
            }

            const button = row.querySelector<HTMLButtonElement>('.track-action-btn.like-btn');
            if (!button) {
                return;
            }

            const favorite = favoriteService.isFavorite(track);
            button.classList.toggle('active', favorite);
            button.setAttribute('aria-pressed', String(favorite));
            button.title = favorite ? '取消收藏' : '收藏';
        });
    }

    private updateCollectionContent(): void {
        if (!this.container) {
            return;
        }

        this.selectedTracks.clear();
        this.lastSelectedIndex = -1;
        this.isMultiSelectMode = false;

        const existingSection = this.container.querySelector('.tracks-section');
        if (existingSection) {
            const template = document.createElement('template');
            template.innerHTML = this.renderTracksSection().trim();
            const nextSection = template.content.firstElementChild;
            if (nextSection) {
                existingSection.replaceWith(nextSection);
            }
        }
        this.mountTrackVirtualizer();

        const trackCount = this.tracks.length;
        const countElement = this.container.querySelector('.meta-track-count');
        if (countElement) {
            countElement.textContent = `${trackCount} 首歌曲`;
        }
        const durationElement = this.container.querySelector('.meta-total-duration');
        if (durationElement) {
            durationElement.textContent = this.formatTotalDuration(this.calculateTotalDuration());
        }

        ['#playlist-play-all', '#playlist-add-all', '#playlist-clear'].forEach((selector) => {
            const button = this.container?.querySelector<HTMLButtonElement>(selector);
            if (button) {
                button.disabled = trackCount === 0;
            }
        });
    }

    private getCollectionType(): CollectionType {
        return this.currentPlaylist?.collectionType || 'playlist';
    }

    private applySourceTracks(): void {
        this.tracks = this.searchTrackIds
            ? this.sourceTracks.filter((track) => this.searchTrackIds?.has(this.getTrackIdentity(track)))
            : [...this.sourceTracks];
        if (this.currentPlaylist) {
            this.currentPlaylist.trackCount = this.tracks.length;
        }
    }

    private getTrackIdentity(track: Pick<Track, 'fileId' | 'filePath'>): string {
        return track.fileId || track.filePath || '';
    }
}

export { PlaylistDetailPage };
