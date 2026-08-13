import {Component} from "@ui/base/Component";
import {libraryDataService} from "@/features/library/service/LibraryDataService";
import {playlistViewModePreferenceService} from "@/features/settings/service";
import type {Playlist} from "@api/types/library";
import type {PlaylistViewMode} from "@api/types/settings";
import {
    AdaptiveCollectionSurface,
    applyCollectionSearch,
    type CollectionLayout,
    type CollectionSurfaceSnapshot
} from '@ui/collections';
import {MainContentScrollCoordinator} from '@/app/runtime/MainContentScrollCoordinator';

type PlaylistViewSize = 's' | 'm' | 'l';
type PlaylistSortKey = 'name' | 'tracks' | 'duration';
type SortDirection = 'asc' | 'desc';

const PLAYLIST_COVER_SIZES: Record<PlaylistViewSize, number> = {
    s: 110,
    m: 150,
    l: 200
};

export class PlaylistsPage extends Component {
    private readonly container: HTMLElement | null;
    private readonly scroll: MainContentScrollCoordinator;
    private playlists: Playlist[];
    private filteredPlaylists: Playlist[];
    private viewMode: PlaylistViewMode;
    private viewSize: PlaylistViewSize;
    private sortBy: PlaylistSortKey;
    private sortDirection: SortDirection;
    private searchQuery: string;
    private contextMenuRequestId: number;
    private refreshGeneration = 0;
    private hasLoaded = false;
    private renderDirty = true;
    private surfaceSnapshot: CollectionSurfaceSnapshot | null = null;
    private readonly playlistSurface: AdaptiveCollectionSurface<Playlist>;
    public isVisible: boolean;

    constructor(container: string | Element | null, scroll: MainContentScrollCoordinator) {
        super(container);
        this.container = this.element as HTMLElement | null;
        this.scroll = scroll;
        this.playlists = [];
        this.filteredPlaylists = [];
        this.viewMode = playlistViewModePreferenceService.getMode();
        this.viewSize = 'm';
        this.sortBy = 'name';
        this.sortDirection = 'asc';
        this.searchQuery = '';
        this.contextMenuRequestId = 0;
        this.isVisible = false;
        this.playlistSurface = new AdaptiveCollectionSurface<Playlist>({
            getKey: playlist => playlist.id,
            renderItem: playlist => this.renderPlaylistItem(playlist)
        }, {
            restoreScrollOffset: scrollTop => {
                this.scroll.remember('playlists/list', scrollTop);
                return this.scroll.restore('playlists/list', {
                    scrollTop,
                    whenReady: () => this.playlistSurface.whenReady(),
                    isCurrent: () => this.isVisible
                });
            }
        });
        this.setupCollectionEventDelegation();
    }

    async show(): Promise<void> {
        if (!this.container) return;
        this.container.style.display = 'block';
        this.isVisible = true;
        if (this.surfaceSnapshot) {
            await this.playlistSurface.resume(this.surfaceSnapshot);
            this.surfaceSnapshot = null;
        }
        if (!this.hasLoaded) {
            await this.refresh();
        } else if (this.renderDirty || !this.container.firstElementChild) {
            this.render();
        }
    }

    hide(): void {
        this.refreshGeneration++;
        this.contextMenuRequestId++;
        this.isVisible = false;
        if (this.container?.querySelector('.playlist-surface-root')) {
            this.surfaceSnapshot = this.playlistSurface.suspend();
        }
        if (this.container) {
            this.container.style.display = 'none';
        }
    }

    async refresh(playlists?: Playlist[]): Promise<void> {
        const refreshGeneration = ++this.refreshGeneration;
        const nextPlaylists = playlists ?? await libraryDataService.getPlaylists();
        if (refreshGeneration !== this.refreshGeneration) return;
        this.playlists = nextPlaylists;
        this.hasLoaded = true;
        this.renderDirty = true;
        this.sortPlaylists();
        if (this.isVisible) {
            if (this.container?.querySelector('.playlist-surface-root')) {
                this.updatePlaylistSurface();
                this.updatePlaylistCount();
                this.renderDirty = false;
            } else {
                this.render();
            }
        }
    }

    render(): void {
        if (!this.container) return;
        const snapshot = this.container.querySelector('.playlist-surface-root')
            ? this.playlistSurface.captureSnapshot()
            : null;
        const coverSize = PLAYLIST_COVER_SIZES[this.viewSize];
        this.container.innerHTML = `
            <div class="albumsx playlistsx page">
                <div class="albumsx-toolbar">
                    <div class="left cluster">
                        <div class="title">
                            <span class="disc" aria-hidden>🎵</span>
                            <span>歌单</span>
                            <em class="muted">${this.playlists.length} 个</em>
                        </div>
                        <div class="segmented" role="tablist" aria-label="封面尺寸">
                            <button class="seg-btn ${this.viewSize === 's' ? 'active' : ''}" data-size="s" ${this.viewMode === 'list' ? 'disabled' : ''}>小</button>
                            <button class="seg-btn ${this.viewSize === 'm' ? 'active' : ''}" data-size="m" ${this.viewMode === 'list' ? 'disabled' : ''}>中</button>
                            <button class="seg-btn ${this.viewSize === 'l' ? 'active' : ''}" data-size="l" ${this.viewMode === 'list' ? 'disabled' : ''}>大</button>
                        </div>
                    </div>
                    <div class="right cluster">
                        <div class="select">
                            <select id="playlist-sort" aria-label="歌单排序字段">
                                <option value="name" ${this.sortBy === 'name' ? 'selected' : ''}>按歌单名</option>
                                <option value="tracks" ${this.sortBy === 'tracks' ? 'selected' : ''}>按歌曲数</option>
                                <option value="duration" ${this.sortBy === 'duration' ? 'selected' : ''}>按总时长</option>
                            </select>
                        </div>
                        <button class="sort-direction-btn" id="playlist-sort-direction" type="button"
                                title="切换为${this.sortDirection === 'asc' ? '降序' : '升序'}"
                                aria-label="当前${this.sortDirection === 'asc' ? '升序' : '降序'}，点击切换">
                            ${this.sortDirection === 'asc' ? '↑' : '↓'}
                        </button>
                        <div class="search-inline">
                            <input type="text" id="playlist-query" value="${this.escapeHtml(this.searchQuery)}" placeholder="搜索歌单…">
                        </div>
                        <div class="segmented" role="tablist" aria-label="视图模式">
                            <button class="seg-btn ${this.viewMode === 'grid' ? 'active' : ''}" data-view="grid">方格</button>
                            <button class="seg-btn ${this.viewMode === 'list' ? 'active' : ''}" data-view="list">列表</button>
                        </div>
                    </div>
                </div>
                ${this.playlists.length > 0 ? `
                    <div class="album-surface-root playlist-surface-root ${this.viewMode === 'grid' ? 'albumsx-grid' : 'albumsx-list'}" style="--cover:${coverSize}px;"></div>
                    <div class="albumsx-empty playlists-no-results" hidden>
                        <h3>没有匹配的歌单</h3>
                        <p>请尝试其他歌单名称</p>
                    </div>
                ` : this.renderEmptyState()}
            </div>
        `;
        this.setupEventListeners();
        this.updatePlaylistSurface();
        if (snapshot) void this.playlistSurface.resume(snapshot);
        this.renderDirty = false;
    }

    private renderPlaylistItem(playlist: Playlist): string {
        const name = this.escapeHtml(playlist.name);
        const count = this.getTrackCount(playlist);
        const duration = this.formatDuration(playlist.duration);
        const metadata = `${count} 首歌曲 · ${duration}`;
        const coverUrl = this.resolveCoverUrl(playlist.coverImage || playlist.cover);
        return `
            <div class="albumsx-tile playlist-browser-item ${this.viewMode === 'list' ? 'albumsx-list-item' : ''}"
                 data-playlist-id="${this.escapeHtml(playlist.id)}" title="${name}\n${metadata}" tabindex="0">
                <div class="art shadow">
                    ${coverUrl ? `
                        <img src="${coverUrl}" alt="${name}" loading="lazy">
                    ` : `
                        <div class="playlist-cover-placeholder" aria-hidden="true">
                            <svg viewBox="0 0 24 24"><path d="M15,6H3V8H15V6M15,10H3V12H15V10M3,16H11V14H3V16M17,6V14.18C16.69,14.07 16.35,14 16,14A3,3 0 0,0 13,17A3,3 0 0,0 16,20A3,3 0 0,0 19,17V8H22V6H17Z"/></svg>
                        </div>
                    `}
                </div>
                <div class="meta">
                    <div class="name clamp-1">${name}</div>
                    <div class="sub clamp-1">${metadata}</div>
                </div>
            </div>
        `;
    }

    private renderEmptyState(): string {
        return `
            <div class="albumsx-empty">
                <div class="icon">
                    <svg viewBox="0 0 24 24"><path d="M15,6H3V8H15V6M15,10H3V12H15V10M3,16H11V14H3V16M17,6V14.18C16.69,14.07 16.35,14 16,14A3,3 0 0,0 13,17A3,3 0 0,0 16,20A3,3 0 0,0 19,17V8H22V6H17Z"/></svg>
                </div>
                <h3>暂无自建歌单</h3>
                <p>创建歌单后，这里会集中展示你的歌单</p>
            </div>
        `;
    }

    private setupEventListeners(): void {
        if (!this.container) return;
        this.container.querySelectorAll<HTMLElement>('[data-size]').forEach((button) => {
            button.addEventListener('click', () => {
                const size = button.dataset.size;
                if (isPlaylistViewSize(size) && size !== this.viewSize) {
                    this.viewSize = size;
                    this.render();
                }
            });
        });
        this.container.querySelectorAll<HTMLElement>('[data-view]').forEach((button) => {
            button.addEventListener('click', () => {
                const mode = button.dataset.view;
                if (isPlaylistViewMode(mode) && mode !== this.viewMode) {
                    this.viewMode = mode;
                    playlistViewModePreferenceService.setMode(mode);
                    this.render();
                }
            });
        });
        const sortSelect = this.container.querySelector<HTMLSelectElement>('#playlist-sort');
        sortSelect?.addEventListener('change', () => {
            this.sortBy = sortSelect.value as PlaylistSortKey;
            this.sortPlaylists();
            this.render();
        });
        this.container.querySelector('#playlist-sort-direction')?.addEventListener('click', () => {
            this.sortDirection = this.sortDirection === 'asc' ? 'desc' : 'asc';
            this.sortPlaylists();
            this.render();
        });
        const searchInput = this.container.querySelector<HTMLInputElement>('#playlist-query');
        searchInput?.addEventListener('input', () => {
            this.searchQuery = searchInput.value;
            this.applySearchFilter();
        });
    }

    private setupCollectionEventDelegation(): void {
        if (!this.container) return;
        this.addEventListenerManaged(this.container, 'dblclick', (event: Event) => {
            const target = event.target instanceof Element ? event.target : null;
            const item = target?.closest<HTMLElement>('.playlist-browser-item');
            const playlist = this.findFilteredPlaylist(item?.dataset.playlistId);
            if (playlist) this.emit('playlistSelected', playlist);
        });
        this.addEventListenerManaged(this.container, 'contextmenu', (event: Event) => {
            const mouseEvent = event as MouseEvent;
            const target = event.target instanceof Element ? event.target : null;
            const item = target?.closest<HTMLElement>('.playlist-browser-item');
            const playlist = this.findFilteredPlaylist(item?.dataset.playlistId);
            if (!playlist) return;
            mouseEvent.preventDefault();
            void this.showPlaylistContextMenu(playlist, mouseEvent.clientX, mouseEvent.clientY);
        });
    }

    private async showPlaylistContextMenu(playlist: Playlist, x: number, y: number): Promise<void> {
        const requestId = ++this.contextMenuRequestId;
        const result = await libraryDataService.getPlaylistDetail(playlist.id);
        if (requestId !== this.contextMenuRequestId || !this.isVisible) return;
        const tracks = result.success ? result.tracks || [] : [];
        this.emit('playlistCollectionRightClick', playlist, tracks, x, y);
    }

    private sortPlaylists(): void {
        const multiplier = this.sortDirection === 'asc' ? 1 : -1;
        this.playlists.sort((a, b) => {
            const result = this.sortBy === 'tracks'
                ? this.getTrackCount(a) - this.getTrackCount(b)
                : this.sortBy === 'duration'
                    ? Number(a.duration || 0) - Number(b.duration || 0)
                    : a.name.localeCompare(b.name, 'zh-CN');
            return result === 0 ? a.name.localeCompare(b.name, 'zh-CN') : result * multiplier;
        });
        this.applySearchFilter(false);
    }

    private applySearchFilter(updateSurface = true): void {
        applyCollectionSearch({
            source: this.playlists,
            query: this.searchQuery,
            getSearchableValues: playlist => [playlist.name],
            commit: results => this.filteredPlaylists = results,
            refresh: updateSurface ? {
                resetScroll: () => this.scroll.scrollToTop(),
                updateView: () => this.updatePlaylistSurface()
            } : undefined
        });
    }

    private findFilteredPlaylist(id: string | undefined): Playlist | null {
        if (!id) return null;
        return this.filteredPlaylists.find(playlist => playlist.id === id) || null;
    }

    private updatePlaylistSurface(): void {
        if (!this.container) return;
        const surfaceRoot = this.container.querySelector<HTMLElement>('.playlist-surface-root');
        const noResults = this.container.querySelector<HTMLElement>('.playlists-no-results');
        const scrollElement = document.querySelector<HTMLElement>('.main-content');
        if (!surfaceRoot || !scrollElement) return;
        surfaceRoot.className = `album-surface-root playlist-surface-root ${this.viewMode === 'grid' ? 'albumsx-grid' : 'albumsx-list'}`;
        surfaceRoot.style.setProperty('--cover', `${PLAYLIST_COVER_SIZES[this.viewSize]}px`);
        surfaceRoot.style.display = this.filteredPlaylists.length === 0 ? 'none' : 'block';
        if (noResults) noResults.hidden = this.filteredPlaylists.length !== 0;
        this.playlistSurface.mount(surfaceRoot, scrollElement);
        this.playlistSurface.update(this.filteredPlaylists, this.getCollectionLayout());
    }

    private getCollectionLayout(): CollectionLayout {
        if (this.viewMode === 'list') {
            return {mode: 'list', estimateRowSize: 80, overscan: 8};
        }
        const coverSize = PLAYLIST_COVER_SIZES[this.viewSize];
        const gap = 24;
        return {
            mode: 'grid',
            estimateRowSize: coverSize + 104,
            getColumnCount: width => Math.max(1, Math.floor((width + gap) / (coverSize + 60 + gap))),
            overscan: 3
        };
    }

    private updatePlaylistCount(): void {
        const count = this.container?.querySelector<HTMLElement>('.albumsx-toolbar .title .muted');
        if (count) count.textContent = `${this.playlists.length} 个`;
    }

    private getTrackCount(playlist: Playlist): number {
        return playlist.resolvedTrackCount ?? playlist.trackCount ?? playlist.tracks?.length ?? 0;
    }

    private formatDuration(value?: number): string {
        const totalSeconds = Math.max(0, Math.floor(Number(value || 0)));
        const seconds = String(totalSeconds % 60).padStart(2, '0');
        const totalMinutes = Math.floor(totalSeconds / 60);
        if (totalMinutes < 60) return `${totalMinutes}:${seconds}`;
        const hours = Math.floor(totalMinutes / 60);
        const minutes = String(totalMinutes % 60).padStart(2, '0');
        return `${hours}:${minutes}:${seconds}`;
    }

    private resolveCoverUrl(value?: string | null): string {
        if (!value) return '';
        if (/^(?:blob:|data:|https?:|file:|assets\/)/i.test(value)) {
            return this.escapeHtml(value);
        }
        return this.escapeHtml(`file://${value.replace(/\\/g, '/')}`);
    }

    private escapeHtml(value: unknown): string {
        const element = document.createElement('div');
        element.textContent = value == null ? '' : String(value);
        return element.innerHTML;
    }

    destroy(): void {
        this.playlistSurface.destroy();
        this.playlists.length = 0;
        this.filteredPlaylists.length = 0;
        super.destroy();
    }
}

function isPlaylistViewMode(value: unknown): value is PlaylistViewMode {
    return value === 'grid' || value === 'list';
}

function isPlaylistViewSize(value: unknown): value is PlaylistViewSize {
    return value === 's' || value === 'm' || value === 'l';
}
