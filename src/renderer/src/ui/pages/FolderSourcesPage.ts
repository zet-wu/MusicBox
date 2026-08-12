import type {LibraryDirectoryOverview} from '@api/types/electron';
import type {FolderSourceViewMode} from '@api/types/settings';
import type {Unsubscribe} from '@api/types/common';
import type {Track} from '@api/types/track';
import {librarySourceManagementService} from '@/features/library/service';
import {folderSourceViewModePreferenceService} from '@/features/settings/service';
import {Component} from '@ui/base/Component';
import {TrackCollectionDetail} from '@ui/components/TrackCollectionDetail';
import {MainContentScrollCoordinator} from '@/app/runtime/MainContentScrollCoordinator';
import {
    AdaptiveCollectionSurface,
    applyCollectionSearch,
    MasterDetailViewHost,
    type CollectionLayout
} from '@ui/collections';

type FolderViewSize = 's' | 'm' | 'l';
type FolderSortKey = 'name' | 'tracks' | 'bindings' | 'lastScan';
type SortDirection = 'asc' | 'desc';

const FOLDER_ICON_SIZES: Record<FolderViewSize, number> = {
    s: 110,
    m: 150,
    l: 200
};

export class FolderSourcesPage extends Component {
    private readonly container: HTMLElement | null;
    private readonly listRoot: HTMLElement;
    private readonly detailRoot: HTMLElement;
    private readonly scroll: MainContentScrollCoordinator;
    private directories: LibraryDirectoryOverview[] = [];
    private filteredDirectories: LibraryDirectoryOverview[] = [];
    private viewMode: FolderSourceViewMode;
    private viewSize: FolderViewSize = 'm';
    private sortBy: FolderSortKey = 'name';
    private sortDirection: SortDirection = 'asc';
    private searchQuery = '';
    private sourceMenu: HTMLElement | null = null;
    private activeSource: LibraryDirectoryOverview | null = null;
    private selectedSource: LibraryDirectoryOverview | null = null;
    private detailTracks: Track[] = [];
    private removeSourcesUpdatedListener: Unsubscribe;
    private loading = false;
    private refreshGeneration = 0;
    private detailGeneration = 0;
    private hasLoaded = false;
    private renderDirty = true;
    private readonly trackCollectionDetail: TrackCollectionDetail;
    private readonly masterDetailHost: MasterDetailViewHost;
    private readonly directorySurface: AdaptiveCollectionSurface<LibraryDirectoryOverview>;
    public isVisible = false;

    constructor(container: string | Element | null, scroll: MainContentScrollCoordinator) {
        super(container);
        this.container = this.element as HTMLElement | null;
        this.scroll = scroll;
        const pageRoot = this.element as HTMLElement;
        this.masterDetailHost = new MasterDetailViewHost(pageRoot, scroll, {
            listLocationKey: 'folders/list',
            detailLocationKey: identity => `folders/detail/${encodeURIComponent(identity)}`
        });
        this.listRoot = this.masterDetailHost.listRoot;
        this.listRoot.classList.add('folders-list-root');
        this.detailRoot = this.masterDetailHost.detailRoot;
        this.detailRoot.classList.add('folders-detail-root');
        this.viewMode = folderSourceViewModePreferenceService.getMode();
        this.directorySurface = new AdaptiveCollectionSurface<LibraryDirectoryOverview>({
            getKey: source => source.id,
            renderItem: source => this.renderSource(source)
        }, {
            restoreScrollOffset: scrollTop => this.masterDetailHost.restoreListOffset(scrollTop)
        });
        this.masterDetailHost.attachSurface(this.directorySurface);
        this.trackCollectionDetail = new TrackCollectionDetail(this.detailRoot, {
            onBack: () => void this.showDirectoryList(),
            onTrackPlayed: (track, index, tracks, mode) => {
                this.emit('trackPlayed', track, index, tracks, mode);
            },
            onPlayAll: tracks => this.emit('playAllTracks', tracks),
            onAppendAll: tracks => this.emit('appendAllTracks', tracks),
            onTrackRightClick: (track, index, x, y, selectedTracks, selectedTrackItems) => {
                this.emit(
                    'trackRightClick',
                    track,
                    index,
                    x,
                    y,
                    selectedTracks,
                    selectedTrackItems,
                    this.detailTracks
                );
            }
        }, {scroll, scrollKey: 'folder-detail'});
        this.setupSourceEventDelegation();
        this.removeSourcesUpdatedListener = librarySourceManagementService.onSourcesUpdated(() => {
            this.renderDirty = true;
            if (this.isVisible && !this.loading) void this.refresh();
        });
        this.addEventListenerManaged(document, 'click', () => this.hideContextMenu());
        this.addEventListenerManaged(document, 'keydown', (event: Event) => {
            if ((event as KeyboardEvent).key === 'Escape') this.hideContextMenu();
        });
        this.addEventListenerManaged(window, 'resize', () => this.hideContextMenu());
    }

    async show(): Promise<void> {
        if (!this.container) return;
        this.container.style.display = 'block';
        this.isVisible = true;
        await this.masterDetailHost.resume();
        if (!this.selectedSource && this.masterDetailHost.getLocation().kind === 'detail') {
            await this.masterDetailHost.returnToList();
        }
        if (!this.hasLoaded || this.renderDirty) {
            this.renderLoading();
            await this.refresh();
        } else if (!this.container.firstElementChild) {
            this.render();
        }
    }

    hide(): void {
        this.refreshGeneration++;
        this.detailGeneration++;
        this.loading = false;
        this.isVisible = false;
        this.masterDetailHost.suspend();
        if (this.selectedSource) {
            this.renderDirty = true;
        }
        this.selectedSource = null;
        this.detailTracks = [];
        this.trackCollectionDetail.hide();
        this.hideContextMenu();
        if (this.container) this.container.style.display = 'none';
    }

    destroy(): void {
        this.removeSourcesUpdatedListener();
        this.masterDetailHost.destroy();
        this.trackCollectionDetail.destroy();
        this.sourceMenu?.remove();
        this.sourceMenu = null;
        super.destroy();
    }

    async refresh(): Promise<void> {
        const refreshGeneration = ++this.refreshGeneration;
        this.loading = true;
        try {
            const directories = await librarySourceManagementService.getDirectories();
            if (!this.isVisible || refreshGeneration !== this.refreshGeneration) return;
            this.directories = directories;
            this.hasLoaded = true;
            this.sortDirectories();
            if (this.selectedSource) {
                const selectedSource = this.findSource(this.selectedSource.id);
                if (selectedSource) {
                    await this.showSourceDetail(selectedSource);
                } else {
                    await this.showDirectoryList();
                }
            } else {
                this.render();
            }
        } finally {
            if (refreshGeneration === this.refreshGeneration) this.loading = false;
        }
    }

    render(): void {
        if (!this.container) return;
        const snapshot = this.masterDetailHost.getLocation().kind === 'list' && this.listRoot.querySelector('.folder-surface-root')
            ? this.directorySurface.captureSnapshot()
            : null;
        this.trackCollectionDetail.hide();
        const iconSize = FOLDER_ICON_SIZES[this.viewSize];
        this.listRoot.innerHTML = `
            <div class="albumsx foldersx page">
                <div class="albumsx-toolbar">
                    <div class="left cluster">
                        <div class="title">
                            <span class="disc" aria-hidden>📁</span>
                            <span>文件夹</span>
                            <em class="muted">${this.directories.length} 个</em>
                        </div>
                        <button class="folder-add-btn" id="folder-source-add" type="button">添加文件夹</button>
                        <div class="segmented" role="tablist" aria-label="图标尺寸">
                            <button class="seg-btn ${this.viewSize === 's' ? 'active' : ''}" data-size="s" ${this.viewMode === 'list' ? 'disabled' : ''}>小</button>
                            <button class="seg-btn ${this.viewSize === 'm' ? 'active' : ''}" data-size="m" ${this.viewMode === 'list' ? 'disabled' : ''}>中</button>
                            <button class="seg-btn ${this.viewSize === 'l' ? 'active' : ''}" data-size="l" ${this.viewMode === 'list' ? 'disabled' : ''}>大</button>
                        </div>
                    </div>
                    <div class="right cluster">
                        <div class="select">
                            <select id="folder-source-sort" aria-label="文件夹排序字段">
                                <option value="name" ${this.sortBy === 'name' ? 'selected' : ''}>按名称</option>
                                <option value="tracks" ${this.sortBy === 'tracks' ? 'selected' : ''}>按歌曲数</option>
                                <option value="bindings" ${this.sortBy === 'bindings' ? 'selected' : ''}>按绑定数</option>
                                <option value="lastScan" ${this.sortBy === 'lastScan' ? 'selected' : ''}>按扫描时间</option>
                            </select>
                        </div>
                        <button class="sort-direction-btn" id="folder-source-sort-direction" type="button"
                                aria-label="切换排序方向">${this.sortDirection === 'asc' ? '↑' : '↓'}</button>
                        <div class="search-inline">
                            <input type="text" id="folder-source-query" value="${this.escapeHtml(this.searchQuery)}" placeholder="搜索名称或路径…">
                        </div>
                        <div class="segmented" role="tablist" aria-label="视图模式">
                            <button class="seg-btn ${this.viewMode === 'grid' ? 'active' : ''}" data-view="grid">方格</button>
                            <button class="seg-btn ${this.viewMode === 'list' ? 'active' : ''}" data-view="list">列表</button>
                        </div>
                    </div>
                </div>
                ${this.directories.length > 0 ? `
                    <div class="album-surface-root folder-surface-root ${this.viewMode === 'grid' ? 'albumsx-grid' : 'albumsx-list'}" style="--cover:${iconSize}px;"></div>
                    <div class="albumsx-empty folder-search-empty" hidden>
                        <h3>没有匹配的文件夹</h3>
                        <p>请尝试搜索其他名称或路径</p>
                    </div>
                ` : this.renderEmptyState()}
            </div>
        `;
        this.setupPageListeners();
        this.updateDirectorySurface();
        if (snapshot) void this.directorySurface.resume(snapshot);
        this.renderDirty = false;
    }

    private renderLoading(): void {
        if (!this.container || this.listRoot.firstElementChild) return;
        this.listRoot.innerHTML = `
            <div class="albumsx foldersx page">
                <div class="albumsx-empty"><div class="folder-loading"></div><p>正在加载音乐文件夹...</p></div>
            </div>
        `;
    }

    private renderSource(source: LibraryDirectoryOverview): string {
        const name = this.getDisplayName(source.path);
        const lastScan = source.lastScanAt
            ? new Date(source.lastScanAt).toLocaleString('zh-CN')
            : '尚未完成扫描';
        return `
            <article class="albumsx-tile folder-source-item ${this.viewMode === 'list' ? 'albumsx-list-item' : ''}"
                     data-source-id="${this.escapeHtml(source.id)}" tabindex="0"
                     title="${this.escapeHtml(source.path)}">
                <div class="art shadow folder-source-art" aria-hidden="true">
                    <svg viewBox="0 0 24 24"><path d="M10 4H4C2.9 4 2 4.9 2 6V18C2 19.1 2.9 20 4 20H20C21.1 20 22 19.1 22 18V8C22 6.9 21.1 6 20 6H12L10 4Z"/></svg>
                </div>
                <div class="meta">
                    <div class="name clamp-1">${this.escapeHtml(name)}</div>
                    <div class="sub clamp-1">${this.escapeHtml(source.path)}</div>
                </div>
                <div class="folder-source-details">
                    <span>${source.trackCount} 首歌曲</span>
                    <span>${source.bindings.length} 个歌单</span>
                    <span>${lastScan}</span>
                </div>
            </article>
        `;
    }

    private renderEmptyState(): string {
        return `
            <div class="albumsx-empty">
                <div class="icon folder-empty-icon" aria-hidden="true">📁</div>
                <h3>尚未添加音乐文件夹</h3>
                <p>添加包含音乐的文件夹后，MusicBox 会持续管理其中的歌曲。</p>
                <button class="folder-add-btn" data-empty-add type="button">添加文件夹</button>
            </div>
        `;
    }

    private setupPageListeners(): void {
        this.listRoot.querySelectorAll<HTMLElement>('[data-size]').forEach(button => {
            button.addEventListener('click', () => {
                const size = button.dataset.size;
                if (isFolderViewSize(size) && size !== this.viewSize) {
                    this.viewSize = size;
                    this.render();
                }
            });
        });
        this.listRoot.querySelectorAll<HTMLElement>('[data-view]').forEach(button => {
            button.addEventListener('click', () => {
                const mode = button.dataset.view;
                if (isFolderViewMode(mode) && mode !== this.viewMode) {
                    this.viewMode = mode;
                    folderSourceViewModePreferenceService.setMode(mode);
                    this.render();
                }
            });
        });
        const addFolder = async (): Promise<void> => {
            await librarySourceManagementService.addDirectories();
        };
        this.listRoot.querySelector('#folder-source-add')?.addEventListener('click', () => void addFolder());
        this.listRoot.querySelector('[data-empty-add]')?.addEventListener('click', () => void addFolder());
        this.listRoot.querySelector<HTMLSelectElement>('#folder-source-sort')?.addEventListener('change', event => {
            this.sortBy = (event.target as HTMLSelectElement).value as FolderSortKey;
            this.sortDirectories();
            this.render();
        });
        this.listRoot.querySelector('#folder-source-sort-direction')?.addEventListener('click', () => {
            this.sortDirection = this.sortDirection === 'asc' ? 'desc' : 'asc';
            this.sortDirectories();
            this.render();
        });
        this.listRoot.querySelector<HTMLInputElement>('#folder-source-query')?.addEventListener('input', event => {
            this.searchQuery = (event.target as HTMLInputElement).value;
            this.applySearchFilter();
        });
    }

    private setupSourceEventDelegation(): void {
        this.addEventListenerManaged(this.listRoot, 'dblclick', event => {
            const item = event.target instanceof Element
                ? event.target.closest<HTMLElement>('.folder-source-item')
                : null;
            const source = this.findFilteredSource(item?.dataset.sourceId);
            if (source) void this.showSourceDetail(source);
        });
        this.addEventListenerManaged(this.listRoot, 'contextmenu', event => {
            const mouseEvent = event as MouseEvent;
            const item = event.target instanceof Element
                ? event.target.closest<HTMLElement>('.folder-source-item')
                : null;
            const source = this.findFilteredSource(item?.dataset.sourceId);
            if (!source) return;
            mouseEvent.preventDefault();
            this.showContextMenu(source, mouseEvent.clientX, mouseEvent.clientY);
        });
        this.addEventListenerManaged(this.listRoot, 'keydown', event => {
            const keyboardEvent = event as KeyboardEvent;
            const item = event.target instanceof Element
                ? event.target.closest<HTMLElement>('.folder-source-item')
                : null;
            const source = this.findFilteredSource(item?.dataset.sourceId);
            if (!item || !source) return;
            if (keyboardEvent.key === 'Enter') {
                keyboardEvent.preventDefault();
                void this.showSourceDetail(source);
                return;
            }
            if (keyboardEvent.key !== 'ContextMenu' && !(keyboardEvent.shiftKey && keyboardEvent.key === 'F10')) return;
            keyboardEvent.preventDefault();
            const rect = item.getBoundingClientRect();
            this.showContextMenu(source, rect.left + 24, rect.top + 24);
        });
    }

    private showContextMenu(source: LibraryDirectoryOverview, x: number, y: number): void {
        this.ensureContextMenu();
        if (!this.sourceMenu) return;
        this.activeSource = source;
        this.sourceMenu.style.display = 'block';
        this.sourceMenu.style.left = `${x}px`;
        this.sourceMenu.style.top = `${y}px`;
        const rect = this.sourceMenu.getBoundingClientRect();
        if (rect.right > window.innerWidth) this.sourceMenu.style.left = `${window.innerWidth - rect.width - 10}px`;
        if (rect.bottom > window.innerHeight) this.sourceMenu.style.top = `${window.innerHeight - rect.height - 10}px`;
    }

    private ensureContextMenu(): void {
        if (this.sourceMenu) return;
        const menu = document.createElement('div');
        menu.className = 'context-menu folder-source-context-menu';
        menu.style.display = 'none';
        menu.innerHTML = `
            <button class="context-menu-item" data-folder-action="open"><span>在文件管理器中打开</span></button>
            <button class="context-menu-item" data-folder-action="rescan"><span>重新扫描</span></button>
            <button class="context-menu-item" data-folder-action="create-playlist"><span>从文件夹创建歌单</span></button>
            <button class="context-menu-item" data-folder-action="bindings"><span>管理绑定歌单</span></button>
            <div class="context-menu-divider"></div>
            <button class="context-menu-item danger" data-folder-action="remove"><span>移除音乐源</span></button>
        `;
        menu.addEventListener('click', event => {
            event.stopPropagation();
            const action = event.target instanceof Element
                ? event.target.closest<HTMLElement>('[data-folder-action]')?.dataset.folderAction
                : undefined;
            const source = this.activeSource;
            this.hideContextMenu();
            if (!source || !action) return;
            if (action === 'open') void librarySourceManagementService.open(source);
            if (action === 'rescan') void this.handleRescan(source);
            if (action === 'create-playlist') this.emit('createPlaylist', source, this.getDisplayName(source.path));
            if (action === 'bindings') this.emit('manageBindings', source);
            if (action === 'remove') void this.handleRemove(source);
        });
        document.body.appendChild(menu);
        this.sourceMenu = menu;
    }

    private hideContextMenu(): void {
        if (this.sourceMenu) this.sourceMenu.style.display = 'none';
        this.activeSource = null;
    }

    private async handleRescan(source: LibraryDirectoryOverview): Promise<void> {
        await librarySourceManagementService.rescan(source);
    }

    private async handleRemove(source: LibraryDirectoryOverview): Promise<void> {
        await librarySourceManagementService.remove(source);
    }

    private async showSourceDetail(source: LibraryDirectoryOverview): Promise<void> {
        if (!this.container || !this.isVisible) return;
        const detailGeneration = ++this.detailGeneration;
        this.masterDetailHost.enterDetail(source.id);
        this.selectedSource = source;
        this.detailTracks = [];
        this.renderDetailLoading(source);

        const tracks = await librarySourceManagementService.getTracks(source.id);
        if (
            !this.isVisible
            || detailGeneration !== this.detailGeneration
            || this.selectedSource?.id !== source.id
        ) return;

        this.detailTracks = tracks;
        this.trackCollectionDetail.show({
            identity: String(source.id),
            title: this.getDisplayName(source.path),
            description: source.path,
            cover: null,
            backLabel: '返回文件夹',
            metadata: [
                `${source.bindings.length} 个绑定歌单`,
                source.lastScanAt
                    ? `扫描于 ${new Date(source.lastScanAt).toLocaleString('zh-CN')}`
                    : '尚未完成扫描'
            ],
            tracks
        });
    }

    private renderDetailLoading(source: LibraryDirectoryOverview): void {
        if (!this.container) return;
        this.trackCollectionDetail.hide();
        this.detailRoot.innerHTML = `
            <div class="page-content playlist-page readonly-track-collection foldersx folder-source-detail-loading">
                <div class="collection-detail-nav">
                    <button class="modern-back-btn collection-back-btn" type="button">
                        <svg viewBox="0 0 24 24"><path d="M15.41,16.58L10.83,12L15.41,7.41L14,6L8,12L14,18L15.41,16.58Z"/></svg>
                        <span>返回文件夹</span>
                    </button>
                </div>
                <div class="albumsx-empty">
                    <div class="folder-loading"></div>
                    <p>正在加载 ${this.escapeHtml(this.getDisplayName(source.path))} 中的歌曲...</p>
                </div>
            </div>
        `;
        this.detailRoot.querySelector('.collection-back-btn')?.addEventListener('click', () => {
            void this.showDirectoryList();
        });
    }

    private async showDirectoryList(): Promise<void> {
        this.detailGeneration++;
        this.selectedSource = null;
        this.detailTracks = [];
        this.trackCollectionDetail.hide();
        if (this.isVisible) await this.masterDetailHost.returnToList();
    }

    private sortDirectories(): void {
        const multiplier = this.sortDirection === 'asc' ? 1 : -1;
        this.directories.sort((left, right) => {
            let result: number;
            if (this.sortBy === 'tracks') result = left.trackCount - right.trackCount;
            else if (this.sortBy === 'bindings') result = left.bindings.length - right.bindings.length;
            else if (this.sortBy === 'lastScan') result = Number(left.lastScanAt || 0) - Number(right.lastScanAt || 0);
            else result = this.getDisplayName(left.path).localeCompare(this.getDisplayName(right.path), 'zh-CN');
            return result === 0 ? left.path.localeCompare(right.path, 'zh-CN') : result * multiplier;
        });
        this.applySearchFilter(false);
    }

    private applySearchFilter(updateSurface = true): void {
        applyCollectionSearch({
            source: this.directories,
            query: this.searchQuery,
            getSearchableValues: source => [source.path],
            commit: results => this.filteredDirectories = results,
            refresh: updateSurface ? {
                resetScroll: () => this.scroll.scrollToTop(),
                updateView: () => this.updateDirectorySurface()
            } : undefined
        });
    }

    private findSource(sourceId?: string): LibraryDirectoryOverview | undefined {
        return this.directories.find(source => source.id === sourceId);
    }

    private findFilteredSource(sourceId?: string): LibraryDirectoryOverview | undefined {
        return this.filteredDirectories.find(source => source.id === sourceId);
    }

    private updateDirectorySurface(): void {
        const surfaceRoot = this.listRoot.querySelector<HTMLElement>('.folder-surface-root');
        const empty = this.listRoot.querySelector<HTMLElement>('.folder-search-empty');
        const scrollElement = document.querySelector<HTMLElement>('.main-content');
        if (!surfaceRoot || !scrollElement) return;
        surfaceRoot.className = `album-surface-root folder-surface-root ${this.viewMode === 'grid' ? 'albumsx-grid' : 'albumsx-list'}`;
        surfaceRoot.style.setProperty('--cover', `${FOLDER_ICON_SIZES[this.viewSize]}px`);
        surfaceRoot.style.display = this.filteredDirectories.length === 0 ? 'none' : 'block';
        if (empty) empty.hidden = this.filteredDirectories.length !== 0;
        this.directorySurface.mount(surfaceRoot, scrollElement);
        this.directorySurface.update(this.filteredDirectories, this.getCollectionLayout());
    }

    private getCollectionLayout(): CollectionLayout {
        if (this.viewMode === 'list') {
            return {mode: 'list', estimateRowSize: 80, overscan: 8};
        }
        const iconSize = FOLDER_ICON_SIZES[this.viewSize];
        const gap = 24;
        return {
            mode: 'grid',
            estimateRowSize: iconSize + 104,
            getColumnCount: width => Math.max(1, Math.floor((width + gap) / (iconSize + 60 + gap))),
            overscan: 3
        };
    }

    private getDisplayName(sourcePath: string): string {
        return sourcePath.replace(/[\\/]+$/, '').split(/[\\/]/).pop() || sourcePath;
    }

    private escapeHtml(value: unknown): string {
        const element = document.createElement('div');
        element.textContent = value == null ? '' : String(value);
        return element.innerHTML;
    }
}

function isFolderViewMode(value: unknown): value is FolderSourceViewMode {
    return value === 'grid' || value === 'list';
}

function isFolderViewSize(value: unknown): value is FolderViewSize {
    return value === 's' || value === 'm' || value === 'l';
}
