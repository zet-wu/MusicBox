import type {Track} from "@api/types/library";
import type {PlaylistDoubleClickMode} from "@api/types/settings";
import type {Unsubscribe} from "@api/types/common";
import {favoriteService} from "@/features/library/service/FavoriteService";
import {libraryPageDataService} from "@/features/library/service/LibraryPageDataService";
import {CoverLoadQueue} from "@/features/mediaAssets/service/CoverLoadQueue";
import {coverLookupService} from "@/features/mediaAssets/service/CoverLookupService";
import {playlistPlaybackActionService} from "@/features/playlists/service/PlaylistPlaybackActionService";
import {
    trackCoverDisplayPreferenceService,
    trackCoverNetworkPreferenceService
} from "@/features/settings/service";
import {ElementVirtualizer} from "@ui/virtualization/ElementVirtualizer";
import type {VirtualItem} from "@tanstack/virtual-core";
import type {MainContentScrollCoordinator} from '@/app/runtime/MainContentScrollCoordinator';

export interface TrackCollectionDetailModel {
    identity?: string;
    title: string;
    description?: string;
    cover: string | null;
    backLabel: string;
    metadata: string[];
    tracks: Track[];
    coverArtist?: string;
    coverAlbum?: string;
}

interface LoadedCover {
    success?: boolean;
    imageUrl?: string;
    type?: string;
    filePath?: string;
    error?: string;
}

export interface TrackCollectionDetailCallbacks {
    onBack(): void;
    onTrackPlayed(track: Track, index: number, tracks: Track[], mode: PlaylistDoubleClickMode): void;
    onPlayAll(tracks: Track[]): void;
    onAppendAll(tracks: Track[]): void;
    onTrackRightClick(
        track: Track,
        index: number,
        x: number,
        y: number,
        selectedTracks: Set<number>,
        selectedTrackItems: Track[]
    ): void;
}

interface TrackCollectionDetailOptions {
    observeNetworkPreference?: boolean;
    scroll?: MainContentScrollCoordinator;
    scrollKey?: string;
}

/**
 * 为艺术家、专辑等只读歌曲集合提供统一的歌单式详情交互。
 */
export class TrackCollectionDetail {
    private model: TrackCollectionDetailModel | null = null;
    private readonly selectedTracks = new Set<number>();
    private lastSelectedIndex = -1;
    private virtualizer: ElementVirtualizer | null = null;
    private showCovers = trackCoverDisplayPreferenceService.isEnabled();
    private readonly coverPreferenceUnsubscribe: Unsubscribe;
    private readonly networkPreferenceUnsubscribe: Unsubscribe;
    private readonly coverLoadQueue = new CoverLoadQueue(4);
    private viewGeneration = 0;
    private readonly scroll: MainContentScrollCoordinator | null;
    private readonly scrollKey: string;

    constructor(
        private readonly container: HTMLElement,
        private readonly callbacks: TrackCollectionDetailCallbacks,
        options: TrackCollectionDetailOptions = {}
    ) {
        this.scroll = options.scroll ?? null;
        this.scrollKey = options.scrollKey ?? 'readonly-collection';
        this.coverPreferenceUnsubscribe = trackCoverDisplayPreferenceService.onChanged((enabled) => {
            this.showCovers = enabled;
            if (this.model) {
                this.render(true);
            }
        });
        this.networkPreferenceUnsubscribe = options.observeNetworkPreference === false
            ? () => undefined
            : trackCoverNetworkPreferenceService.onChanged(() => {
                if (this.model) {
                    this.render(true);
                }
            });
    }

    show(model: TrackCollectionDetailModel): void {
        const preserveScroll = Boolean(
            this.model
            && this.getModelIdentity(this.model) === this.getModelIdentity(model)
            && this.container.firstElementChild
        );
        this.model = model;
        this.clearSelection();
        this.render(preserveScroll);
    }

    hide(): void {
        this.viewGeneration++;
        this.coverLoadQueue.beginBatch();
        this.destroyVirtualizer();
        this.model = null;
        this.selectedTracks.clear();
        this.lastSelectedIndex = -1;
    }

    destroy(): void {
        this.hide();
        this.coverPreferenceUnsubscribe();
        this.networkPreferenceUnsubscribe();
        this.coverLoadQueue.destroy();
    }

    private render(preserveScroll = false): void {
        if (!this.model) {
            return;
        }

        const model = this.model;
        const generation = ++this.viewGeneration;
        const scrollStateKey = this.getScrollStateKey(model);
        if (preserveScroll) {
            this.scroll?.capture(scrollStateKey);
        }
        this.coverLoadQueue.beginBatch();
        this.destroyVirtualizer();
        const totalDuration = this.model.tracks.reduce((sum, track) => sum + (track.duration || 0), 0);
        const trackCount = this.model.tracks.length;
        this.container.innerHTML = `
            <div class="page-content playlist-page readonly-track-collection">
                <div class="collection-detail-nav">
                    <button class="modern-back-btn collection-back-btn" type="button">
                        <svg viewBox="0 0 24 24"><path d="M15.41,16.58L10.83,12L15.41,7.41L14,6L8,12L14,18L15.41,16.58Z"/></svg>
                        <span>${this.escapeHtml(this.model.backLabel)}</span>
                    </button>
                </div>
                <div class="playlist-hero">
                    <div class="hero-background"><div class="gradient-overlay"></div></div>
                    <div class="hero-content">
                        <div class="playlist-cover-container">
                            <div class="playlist-cover">
                                <img class="collection-cover-image"
                                     src="${this.model.cover || 'assets/images/default-cover.svg'}"
                                     alt="${this.escapeHtml(this.model.title)}">
                                <div class="cover-shadow"></div>
                            </div>
                        </div>
                        <div class="playlist-detail-info align-left">
                            <h1 class="playlist-title">${this.escapeHtml(this.model.title)}</h1>
                            ${this.model.description ? `<p class="playlist-description">${this.escapeHtml(this.model.description)}</p>` : ''}
                            <div class="playlist-meta">
                                <span class="meta-item">${trackCount} 首歌曲</span>
                                <span class="meta-item">${this.formatTotalDuration(totalDuration)}</span>
                                ${this.model.metadata.map(item => `<span class="meta-item">${this.escapeHtml(item)}</span>`).join('')}
                            </div>
                        </div>
                    </div>
                </div>
                <div class="playlist-actions">
                    <div class="actions-primary">
                        <button class="play-btn primary collection-play-all" type="button" ${trackCount === 0 ? 'disabled' : ''}>
                            <div class="btn-content">
                                <svg class="play-icon" viewBox="0 0 24 24"><path d="M8,5.14V19.14L19,12.14L8,5.14Z"/></svg>
                                <span class="btn-text">播放全部</span>
                            </div>
                        </button>
                        <button class="play-btn primary collection-append-all" type="button" ${trackCount === 0 ? 'disabled' : ''}>
                            <div class="btn-content">
                                <svg class="play-icon" viewBox="0 0 24 24"><path d="M19,13H13V19H11V13H5V11H11V5H13V11H19V13Z"/></svg>
                                <span class="btn-text">添加到播放列表</span>
                            </div>
                        </button>
                    </div>
                </div>
                <div class="tracks-section">
                    <div class="tracks-header">
                        <div class="header-left">
                            <h3 class="tracks-title">歌曲列表</h3>
                            <span class="tracks-count">${trackCount} 首歌曲</span>
                        </div>
                        <div class="header-right">
                            <div class="tracks-controls">
                                <button class="control-btn collection-select-all" type="button">
                                    <span>全选</span>
                                </button>
                                <button class="control-btn collection-clear-selection" type="button" style="display:none">
                                    <span>取消选择</span>
                                </button>
                            </div>
                        </div>
                    </div>
                    <div class="tracks-container">
                        ${this.renderTrackListShell()}
                    </div>
                </div>
            </div>
        `;

        this.bindEvents();
        this.mountVirtualizer();
        this.loadCollectionCover(generation);
        if (preserveScroll) {
            this.scroll?.restore(scrollStateKey, () => (
                this.viewGeneration === generation
                && this.model === model
                && this.container.style.display !== 'none'
            ));
        }
    }

    private getModelIdentity(model: TrackCollectionDetailModel): string {
        return model.identity || `${model.title}|${model.coverArtist || ''}|${model.coverAlbum || ''}`;
    }

    private getScrollStateKey(model: TrackCollectionDetailModel): string {
        return `${this.scrollKey}:${this.getModelIdentity(model)}`;
    }

    private renderTrackListShell(): string {
        if (!this.model || this.model.tracks.length === 0) {
            return '<div class="playlist-empty-state"><h3 class="empty-title">没有可播放的歌曲</h3></div>';
        }

        return `
            <div class="modern-tracks-table ${this.showCovers ? 'with-covers' : ''}">
                <div class="tracks-table-header">
                    <div class="header-cell cell-number">#</div>
                    ${this.showCovers ? '<div class="header-cell cell-cover">封面</div>' : ''}
                    <div class="header-cell cell-title">歌曲</div>
                    <div class="header-cell cell-album">专辑</div>
                    <div class="header-cell cell-duration">时长</div>
                    <div class="header-cell cell-actions"></div>
                </div>
                <div class="tracks-table-body virtual-track-body"></div>
            </div>
        `;
    }

    private bindEvents(): void {
        this.container.querySelector('.collection-back-btn')?.addEventListener('click', () => {
            this.callbacks.onBack();
        });
        this.container.querySelector('.collection-play-all')?.addEventListener('click', () => {
            if (this.model) {
                this.callbacks.onPlayAll(this.model.tracks);
            }
        });
        this.container.querySelector('.collection-append-all')?.addEventListener('click', () => {
            if (this.model) {
                this.callbacks.onAppendAll(this.model.tracks);
            }
        });
        this.container.querySelector('.collection-select-all')?.addEventListener('click', () => {
            this.toggleSelectAll();
        });
        this.container.querySelector('.collection-clear-selection')?.addEventListener('click', () => {
            this.clearSelection();
            this.updateSelectionUI();
        });
        this.container.querySelector('.virtual-track-body')?.addEventListener('click', (event) => {
            void this.handleTrackClick(event as MouseEvent);
        });
        this.container.querySelector('.virtual-track-body')?.addEventListener('dblclick', (event) => {
            this.handleTrackDoubleClick(event as MouseEvent);
        });
        this.container.querySelector('.virtual-track-body')?.addEventListener('contextmenu', (event) => {
            this.handleTrackContextMenu(event as MouseEvent);
        });
    }

    private mountVirtualizer(): void {
        if (!this.model?.tracks.length) {
            return;
        }

        const body = this.container.querySelector<HTMLElement>('.virtual-track-body');
        const scrollElement = document.querySelector<HTMLElement>('.main-content');
        if (!body || !scrollElement) {
            return;
        }

        const bodyRect = body.getBoundingClientRect();
        const scrollRect = scrollElement.getBoundingClientRect();
        const scrollMargin = bodyRect.top - scrollRect.top + scrollElement.scrollTop;
        this.virtualizer = new ElementVirtualizer({
            count: this.model.tracks.length,
            estimateSize: () => this.showCovers ? 73 : 65,
            getItemKey: (index) => this.getTrackIdentity(this.model!.tracks[index]) || index,
            getScrollElement: () => scrollElement,
            scrollMargin,
            overscan: 8,
            onChange: (items, totalSize) => {
                if (!this.model || !this.virtualizer) {
                    return;
                }
                body.style.height = `${totalSize}px`;
                body.innerHTML = items.map(item => this.renderTrackRow(item, scrollMargin)).join('');
                body.querySelectorAll<HTMLElement>('.track-row').forEach(row => {
                    this.virtualizer?.measureElement(row);
                });
            }
        });
        this.virtualizer.mount();
    }

    private renderTrackRow(item: VirtualItem, scrollMargin: number): string {
        const track = this.model!.tracks[item.index];
        const translateY = item.start - scrollMargin;
        const liked = favoriteService.isFavorite(track);
        return `
            <div class="track-row ${this.selectedTracks.has(item.index) ? 'selected' : ''}"
                 data-track-index="${item.index}"
                 style="transform:translateY(${translateY}px)">
                <div class="track-cell cell-number">
                    <div class="track-number-container">
                        <span class="track-number">${item.index + 1}</span>
                        <div class="play-indicator">
                            <svg class="play-icon" viewBox="0 0 24 24"><path d="M8,5.14V19.14L19,12.14L8,5.14Z"/></svg>
                        </div>
                    </div>
                </div>
                ${this.showCovers ? `<div class="track-cell cell-cover">
                    <img class="track-cover" src="${this.getTrackCover(track, item.index)}" alt="封面" loading="lazy">
                </div>` : ''}
                <div class="track-cell cell-title">
                    <div class="track-main-info">
                        <div class="track-name">${this.escapeHtml(track.title || track.fileName || '未知标题')}</div>
                        <div class="track-artist">${this.escapeHtml(track.artist || '未知艺术家')}</div>
                    </div>
                </div>
                <div class="track-cell cell-album"><span class="album-name">${this.escapeHtml(track.album || '未知专辑')}</span></div>
                <div class="track-cell cell-duration"><span class="duration-text">${this.formatDuration(track.duration)}</span></div>
                <div class="track-cell cell-actions">
                    <button class="track-action-btn like-btn ${liked ? 'active' : ''}" data-action="like"
                            type="button" aria-pressed="${liked}" title="${liked ? '取消收藏' : '收藏'}">
                        <svg class="icon" viewBox="0 0 24 24"><path d="M12,21.35L10.55,20.03C5.4,16.36 2,13.27 2,9.5 2,6.41 4.42,4 7.5,4C9.24,4 10.91,4.81 12,6.08C13.09,4.81 14.76,4 16.5,4C19.58,4 22,6.41 22,9.5 22,13.27 18.6,16.36 13.45,21.03L12,21.35Z"/></svg>
                    </button>
                </div>
            </div>
        `;
    }

    private async handleTrackClick(event: MouseEvent): Promise<void> {
        const row = (event.target as Element | null)?.closest<HTMLElement>('.track-row') ?? null;
        const index = this.getRowIndex(row);
        const track = index === null ? null : this.model?.tracks[index];
        if (!track || index === null) {
            return;
        }

        if ((event.target as Element).closest('[data-action="like"]')) {
            await favoriteService.toggle(track);
            this.virtualizer?.destroy();
            this.virtualizer = null;
            this.mountVirtualizer();
            return;
        }

        if (event.ctrlKey || event.metaKey) {
            this.toggleSelection(index);
        } else if (event.shiftKey && this.selectedTracks.size > 0) {
            this.selectRange(index);
        } else if (this.selectedTracks.size > 0) {
            this.toggleSelection(index);
        }
        this.updateSelectionUI();
    }

    private handleTrackDoubleClick(event: MouseEvent): void {
        if ((event.target as Element | null)?.closest('.track-action-btn')) {
            return;
        }
        const row = (event.target as Element | null)?.closest<HTMLElement>('.track-row') ?? null;
        const index = this.getRowIndex(row);
        const track = index === null ? null : this.model?.tracks[index];
        if (track && index !== null && this.model) {
            this.callbacks.onTrackPlayed(
                track,
                index,
                this.model.tracks,
                playlistPlaybackActionService.getDoubleClickMode()
            );
        }
    }

    private handleTrackContextMenu(event: MouseEvent): void {
        const row = (event.target as Element | null)?.closest<HTMLElement>('.track-row') ?? null;
        const index = this.getRowIndex(row);
        const track = index === null ? null : this.model?.tracks[index];
        if (!track || index === null || !this.model) {
            return;
        }

        event.preventDefault();
        if (!this.selectedTracks.has(index)) {
            this.selectedTracks.clear();
            this.selectedTracks.add(index);
            this.lastSelectedIndex = index;
            this.updateSelectionUI();
        }
        const selectedItems = Array.from(this.selectedTracks)
            .sort((a, b) => a - b)
            .map(selectedIndex => this.model!.tracks[selectedIndex])
            .filter(Boolean);
        this.callbacks.onTrackRightClick(
            track,
            index,
            event.clientX,
            event.clientY,
            new Set(this.selectedTracks),
            selectedItems
        );
    }

    private toggleSelection(index: number): void {
        if (this.selectedTracks.has(index)) {
            this.selectedTracks.delete(index);
        } else {
            this.selectedTracks.add(index);
        }
        this.lastSelectedIndex = index;
    }

    private selectRange(endIndex: number): void {
        const startIndex = this.lastSelectedIndex >= 0 ? this.lastSelectedIndex : endIndex;
        for (let index = Math.min(startIndex, endIndex); index <= Math.max(startIndex, endIndex); index++) {
            this.selectedTracks.add(index);
        }
    }

    private toggleSelectAll(): void {
        if (!this.model) {
            return;
        }
        if (this.selectedTracks.size === this.model.tracks.length) {
            this.clearSelection();
        } else {
            this.selectedTracks.clear();
            this.model.tracks.forEach((_, index) => this.selectedTracks.add(index));
        }
        this.updateSelectionUI();
    }

    private clearSelection(): void {
        this.selectedTracks.clear();
        this.lastSelectedIndex = -1;
    }

    private updateSelectionUI(): void {
        this.container.querySelectorAll<HTMLElement>('.track-row').forEach(row => {
            const index = this.getRowIndex(row);
            row.classList.toggle('selected', index !== null && this.selectedTracks.has(index));
        });
        const clearButton = this.container.querySelector<HTMLElement>('.collection-clear-selection');
        if (clearButton) {
            clearButton.style.display = this.selectedTracks.size > 0 ? '' : 'none';
        }
        const selectAllLabel = this.container.querySelector<HTMLElement>('.collection-select-all span');
        if (selectAllLabel && this.model) {
            selectAllLabel.textContent = this.selectedTracks.size === this.model.tracks.length ? '取消全选' : '全选';
        }
    }

    private getRowIndex(row: HTMLElement | null): number | null {
        const index = Number.parseInt(row?.dataset.trackIndex || '', 10);
        return Number.isInteger(index) && index >= 0 ? index : null;
    }

    private getTrackIdentity(track: Track): string {
        return String(track.fileId || track.id || track.filePath || '');
    }

    private getTrackCover(track: Track, index: number): string {
        if (track.cover && typeof track.cover === 'string') {
            return track.cover;
        }
        this.loadTrackCover(track, index, this.viewGeneration);
        return 'assets/images/default-cover.svg';
    }

    private loadTrackCover(track: Track, index: number, generation: number): void {
        const key = track.filePath || this.getTrackIdentity(track);
        if (!key) return;

        this.coverLoadQueue.schedule(`track:${key}`, async (signal) => {
            const result = await coverLookupService.getCover(
                track.title,
                track.artist,
                track.album,
                track.filePath,
                false,
                {
                    allowNetwork: trackCoverNetworkPreferenceService.isEnabled(),
                    signal
                }
            ) as LoadedCover;
            if (
                signal.aborted
                || generation !== this.viewGeneration
                || !this.model
                || this.model.tracks[index] !== track
                || !result.success
                || !result.imageUrl
            ) {
                return;
            }

            track.cover = this.normalizeCoverUrl(result);
            const row = this.container.querySelector<HTMLElement>(`.track-row[data-track-index="${index}"]`);
            const image = row?.querySelector<HTMLImageElement>('.track-cover');
            if (image) {
                image.src = track.cover;
            }
        });
    }

    private loadCollectionCover(generation: number): void {
        if (!this.model || this.model.cover || this.model.tracks.length === 0) {
            return;
        }
        const model = this.model;
        this.coverLoadQueue.schedule(`collection:${generation}`, async (signal) => {
            const firstTrack = model.tracks[0];
            const result = await libraryPageDataService.findCollectionCover(
                model.tracks,
                model.coverArtist || firstTrack.artist || '',
                model.coverAlbum ?? firstTrack.album ?? '',
                trackCoverNetworkPreferenceService.isEnabled(),
                signal
            );
            if (
                signal.aborted
                || generation !== this.viewGeneration
                || this.model !== model
                || !result.success
                || !result.imageUrl
            ) {
                return;
            }
            model.cover = result.imageUrl;
            const image = this.container.querySelector<HTMLImageElement>('.collection-cover-image');
            if (image) {
                image.src = result.imageUrl;
            }
        });
    }

    private normalizeCoverUrl(result: LoadedCover): string {
        if (result.type !== 'local-file' || !result.filePath) {
            return result.imageUrl || 'assets/images/default-cover.svg';
        }
        if (result.imageUrl?.startsWith('file://')) {
            return result.imageUrl;
        }
        let filePath = result.filePath.replace(/\\/g, '/');
        if (!filePath.startsWith('/')) {
            filePath = `/${filePath}`;
        }
        return `file://${filePath}`;
    }

    private destroyVirtualizer(): void {
        this.virtualizer?.destroy();
        this.virtualizer = null;
    }

    private formatDuration(duration?: number): string {
        if (!duration || duration <= 0) {
            return '--:--';
        }
        const minutes = Math.floor(duration / 60);
        const seconds = Math.floor(duration % 60);
        return `${minutes}:${seconds.toString().padStart(2, '0')}`;
    }

    private formatTotalDuration(duration: number): string {
        const hours = Math.floor(duration / 3600);
        const minutes = Math.floor((duration % 3600) / 60);
        return hours > 0 ? `${hours} 小时 ${minutes} 分钟` : `${minutes} 分钟`;
    }

    private escapeHtml(value: unknown): string {
        const element = document.createElement('div');
        element.textContent = String(value ?? '');
        return element.innerHTML;
    }
}
