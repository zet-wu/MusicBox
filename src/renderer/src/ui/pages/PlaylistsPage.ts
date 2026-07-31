import {Component} from "@ui/base/Component";
import {libraryDataService} from "@/features/library/service/LibraryDataService";
import {playlistViewModePreferenceService} from "@/features/settings/service";
import type {Playlist} from "@api/types/library";
import type {PlaylistViewMode} from "@api/types/settings";

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
    private playlists: Playlist[];
    private viewMode: PlaylistViewMode;
    private viewSize: PlaylistViewSize;
    private sortBy: PlaylistSortKey;
    private sortDirection: SortDirection;
    private searchQuery: string;
    private contextMenuRequestId: number;
    private refreshGeneration = 0;
    public isVisible: boolean;

    constructor(container: string | Element | null) {
        super(container);
        this.container = this.element as HTMLElement | null;
        this.playlists = [];
        this.viewMode = playlistViewModePreferenceService.getMode();
        this.viewSize = 'm';
        this.sortBy = 'name';
        this.sortDirection = 'asc';
        this.searchQuery = '';
        this.contextMenuRequestId = 0;
        this.isVisible = false;
    }

    async show(): Promise<void> {
        if (!this.container) return;
        this.container.style.display = 'block';
        this.isVisible = true;
        await this.refresh();
    }

    hide(): void {
        this.refreshGeneration++;
        this.contextMenuRequestId++;
        this.isVisible = false;
        if (this.container) {
            this.container.innerHTML = '';
        }
    }

    async refresh(): Promise<void> {
        const refreshGeneration = ++this.refreshGeneration;
        const playlists = await libraryDataService.getPlaylists();
        if (!this.isVisible || refreshGeneration !== this.refreshGeneration) return;
        this.playlists = playlists;
        this.sortPlaylists();
        if (this.isVisible) {
            this.render();
        }
    }

    render(): void {
        if (!this.container) return;
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
                    <div class="${this.viewMode === 'grid' ? 'albumsx-grid' : 'albumsx-list'}" style="--cover:${coverSize}px;">
                        ${this.playlists.map(playlist => this.renderPlaylistItem(playlist)).join('')}
                    </div>
                ` : this.renderEmptyState()}
            </div>
        `;
        this.setupEventListeners();
        this.applySearchFilter();
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
        this.container.querySelectorAll<HTMLElement>('.playlist-browser-item').forEach((item) => {
            item.addEventListener('dblclick', () => {
                const playlist = this.playlists.find(candidate => candidate.id === item.dataset.playlistId);
                if (playlist) this.emit('playlistSelected', playlist);
            });
            item.addEventListener('contextmenu', (event: MouseEvent) => {
                event.preventDefault();
                const playlist = this.playlists.find(candidate => candidate.id === item.dataset.playlistId);
                if (playlist) void this.showPlaylistContextMenu(playlist, event.clientX, event.clientY);
            });
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
    }

    private applySearchFilter(): void {
        if (!this.container) return;
        const query = this.searchQuery.trim().toLocaleLowerCase();
        this.container.querySelectorAll<HTMLElement>('.playlist-browser-item').forEach((item) => {
            const playlist = this.playlists.find(candidate => candidate.id === item.dataset.playlistId);
            const matches = playlist && (!query || playlist.name.toLocaleLowerCase().includes(query));
            item.style.display = matches ? '' : 'none';
        });
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
}

function isPlaylistViewMode(value: unknown): value is PlaylistViewMode {
    return value === 'grid' || value === 'list';
}

function isPlaylistViewSize(value: unknown): value is PlaylistViewSize {
    return value === 's' || value === 'm' || value === 'l';
}
