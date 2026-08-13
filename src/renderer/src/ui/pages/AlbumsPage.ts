/**
 * 专辑页组件
 * 营造“收藏实体专辑”的沉浸式浏览体验
 */
import {Component} from "@ui/base/Component";
import {TrackCollectionDetail} from "@ui/components/TrackCollectionDetail";
import {
    libraryPageDataService,
    type AlbumSortKey,
    type LibraryAlbumItem as AlbumItem,
    type SortDirection
} from "@/features/library/service/LibraryPageDataService";
import {
    albumGroupingPreferenceService,
    albumViewModePreferenceService,
    trackCoverNetworkPreferenceService
} from "@/features/settings/service";
import type {Unsubscribe} from "@api/types/common";
import type {Track} from "@api/types/library";
import type {AlbumViewMode} from "@api/types/settings";
import {escapeHtmlAttribute} from "@utils/html";
import {MainContentScrollCoordinator} from '@/app/runtime/MainContentScrollCoordinator';
import {
    AdaptiveCollectionSurface,
    applyCollectionSearch,
    MasterDetailViewHost,
    type CollectionLayout
} from '@ui/collections';

type AlbumViewSize = 's' | 'm' | 'l';

class AlbumsPage extends Component {
    private tracks: Track[];
    private albums: AlbumItem[];
    private filteredAlbums: AlbumItem[];
    private selectedAlbum: AlbumItem | null;
    private viewSize: AlbumViewSize;
    private viewMode: AlbumViewMode;
    private sortBy: AlbumSortKey;
    private sortDirection: SortDirection;
    private searchQuery: string;
    private container: any;
    private readonly listRoot: HTMLElement;
    private readonly detailRoot: HTMLElement;
    private readonly scroll: MainContentScrollCoordinator;
    private _coverRequests: Set<string>;
    private _coverFailures: Set<string>;
    private _coverQueue: string[];
    private _coverConcurrency: number;
    private _coverMaxConcurrency: number;
    private listenersSetup: boolean;
    private albumGroupingUnsubscribe: Unsubscribe | null;
    private coverPreferenceUnsubscribe: Unsubscribe | null;
    private coverGeneration: number;
    private readonly trackCollectionDetail: TrackCollectionDetail;
    private readonly masterDetailHost: MasterDetailViewHost;
    private readonly albumSurface: AdaptiveCollectionSurface<AlbumItem>;
    private glossFrame: number | null = null;
    private pendingGloss: {art: HTMLElement; x: number; y: number} | null = null;
    isVisible: boolean;
    private renderDirty = true;
    private listRenderDirty = true;

    constructor(container: string | Element | null, scroll: MainContentScrollCoordinator) {
        super(container);
        const pageRoot = this.element as HTMLElement;
        this.scroll = scroll;
        this.masterDetailHost = new MasterDetailViewHost(pageRoot, scroll, {
            listLocationKey: 'albums/list',
            detailLocationKey: identity => `albums/detail/${encodeURIComponent(identity)}`
        });
        this.listRoot = this.masterDetailHost.listRoot;
        this.listRoot.classList.add('albums-list-root');
        this.detailRoot = this.masterDetailHost.detailRoot;
        this.detailRoot.classList.add('albums-detail-root');
        this.tracks = [];
        this.albums = [];
        this.filteredAlbums = [];
        this.selectedAlbum = null; // { key, name, artist, year, cover, tracks:[], totalDuration }
        this.viewSize = 'm'; // s | m | l
        this.viewMode = albumViewModePreferenceService.getMode();
        this.sortBy = 'name';
        this.sortDirection = 'asc';
        this.searchQuery = '';
        this.container = this.listRoot;
        // 封面获取去重与队列
        this._coverRequests = new Set();  // in-flight keys
        this._coverFailures = new Set();  // failed keys (避免重复请求)
        this._coverQueue = [];            // 待处理队列（存储专辑key）
        this._coverConcurrency = 0;
        this._coverMaxConcurrency = 5;
        this.listenersSetup = false; // 事件监听器是否已设置
        this.albumGroupingUnsubscribe = albumGroupingPreferenceService.onChanged(() => {
            this.selectedAlbum = null;
            this._coverQueue.length = 0;
            this._coverFailures.clear();
            this.processAlbums();
            this.renderDirty = true;
            if (this.isVisible) {
                this.render();
            }
        });
        this.coverGeneration = 0;
        this.setupAlbumListEventDelegation();
        this.albumSurface = new AdaptiveCollectionSurface<AlbumItem>({
            getKey: album => album.key,
            renderItem: album => this.renderAlbumTile(album)
        }, {
            onRenderedRangeChange: keys => this.scheduleCoversForMissing(keys),
            restoreScrollOffset: scrollTop => this.masterDetailHost.restoreListOffset(scrollTop)
        });
        this.masterDetailHost.attachSurface(this.albumSurface);
        this.trackCollectionDetail = new TrackCollectionDetail(this.detailRoot, {
            onBack: () => void this.closeAlbumDetail(),
            onTrackPlayed: (track, index, tracks, mode) => {
                this.emit('trackPlayed', track, index, tracks, mode);
            },
            onPlayAll: (tracks) => {
                this.emit('playAllTracks', tracks);
            },
            onAppendAll: (tracks) => {
                this.emit('appendAllTracks', tracks);
            },
            onTrackRightClick: (track, index, x, y, selectedTracks, selectedTrackItems) => {
                this.emit(
                    'trackRightClick',
                    track,
                    index,
                    x,
                    y,
                    selectedTracks,
                    selectedTrackItems,
                    this.selectedAlbum?.tracks || []
                );
            }
        }, {
            observeNetworkPreference: false,
            scroll: this.scroll,
            scrollKey: 'albums-detail'
        });
        this.coverPreferenceUnsubscribe = trackCoverNetworkPreferenceService.onChanged((enabled) => {
            this.coverGeneration++;
            this._coverQueue.length = 0;
            this._coverRequests.clear();
            this._coverFailures.clear();
            this.renderDirty = true;
            if (this.selectedAlbum) this.listRenderDirty = true;
            if (!enabled) {
                const selectedAlbumKey = this.selectedAlbum?.key;
                this.processAlbums();
                this.selectedAlbum = selectedAlbumKey
                    ? this.albums.find(album => album.key === selectedAlbumKey) || null
                    : null;
                if (this.isVisible) {
                    this.render();
                }
            } else if (this.isVisible) {
                if (this.selectedAlbum) {
                    this.render();
                } else {
                    this.scheduleCoversForMissing();
                }
            }
        });
        this.isVisible = false;
    }

    async show(): Promise<void> {
        const viewGeneration = ++this.coverGeneration;
        if (!this.listenersSetup) {
            this._bindLibraryEvents();
            this.listenersSetup = true;
        }
        if (this.element) (this.element as HTMLElement).style.display = 'block';
        this.isVisible = true;
        await this.masterDetailHost.resume();
        if (!this.selectedAlbum && this.masterDetailHost.getLocation().kind === 'detail') {
            await this.masterDetailHost.returnToList();
        }

        // 只有在没有tracks数据时才获取，避免重复调用
        if (!this.tracks || this.tracks.length === 0) {
            const pageData = await libraryPageDataService.getAlbums(this.sortBy, this.sortDirection, {
                splitByArtist: albumGroupingPreferenceService.shouldSplitByArtist()
            });
            if (!this.isVisible || viewGeneration !== this.coverGeneration) return;
            this.tracks = pageData.tracks;
            this.albums = pageData.albums;
            this.applyAlbumFilter(false);
            this.renderDirty = true;
        }

        if (this.renderDirty || !this.listRoot.firstElementChild) {
            this.render();
        }
    }

    hide(): void {
        this.coverGeneration++;
        this.isVisible = false;
        this.masterDetailHost.suspend();
        this.selectedAlbum = null;
        this.trackCollectionDetail.hide();
        if (this.element instanceof HTMLElement) this.element.style.display = 'none';
    }

    destroy(): void {
        this.tracks.length = 0;
        this.albums.length = 0;
        this.filteredAlbums.length = 0;
        this.selectedAlbum = null;
        this._coverRequests.clear();
        this._coverFailures.clear();
        this._coverQueue.length = 0;
        this.listenersSetup = false;
        this.albumGroupingUnsubscribe?.();
        this.albumGroupingUnsubscribe = null;
        this.coverPreferenceUnsubscribe?.();
        this.coverPreferenceUnsubscribe = null;
        this.masterDetailHost.destroy();
        this.trackCollectionDetail.destroy();
        super.destroy();
    }

    _bindLibraryEvents(): void {
        this.addAPIEventListenerManaged('libraryUpdated', (tracks) => {
            const selectedAlbumKey = this.selectedAlbum?.key;
            this.tracks = (tracks || []) as Track[];
            this.processAlbums();
            this.selectedAlbum = selectedAlbumKey
                ? this.albums.find((album) => album.key === selectedAlbumKey) || null
                : null;
            this.renderDirty = true;
            if (this.selectedAlbum) this.listRenderDirty = true;
            if (this.isVisible) this.render();
        });
    }

    private setupAlbumListEventDelegation(): void {
        this.addEventListenerManaged(this.listRoot, 'dblclick', (event: Event) => {
            const target = event.target instanceof Element ? event.target : null;
            const tile = target?.closest<HTMLElement>('.albumsx-tile');
            const album = this.findFilteredAlbum(tile?.dataset.albumKey);
            if (tile && album) {
                this.animateToDetail(tile, album);
            }
        });
        this.addEventListenerManaged(this.listRoot, 'contextmenu', (event: Event) => {
            const mouseEvent = event as MouseEvent;
            const target = event.target instanceof Element ? event.target : null;
            const tile = target?.closest<HTMLElement>('.albumsx-tile');
            const album = this.findFilteredAlbum(tile?.dataset.albumKey);
            if (!album) return;
            mouseEvent.preventDefault();
            if (album.tracks.length > 0) {
                this.emit('collectionRightClick', album.tracks, mouseEvent.clientX, mouseEvent.clientY);
            }
        });
        this.addEventListenerManaged(this.listRoot, 'pointermove', (event: Event) => {
            const pointerEvent = event as PointerEvent;
            const target = event.target instanceof Element ? event.target : null;
            const art = target?.closest<HTMLElement>('.albumsx-tile .art');
            if (art) this.updateGloss(art, pointerEvent.clientX, pointerEvent.clientY);
        });
        this.addEventListenerManaged(this.listRoot, 'pointerout', (event: Event) => {
            const pointerEvent = event as PointerEvent;
            const target = event.target instanceof Element ? event.target : null;
            const art = target?.closest<HTMLElement>('.albumsx-tile .art');
            if (art && !(pointerEvent.relatedTarget instanceof Node && art.contains(pointerEvent.relatedTarget))) {
                art.style.setProperty('--gloss', '0');
            }
        });
    }

    private findFilteredAlbum(key: string | undefined): AlbumItem | null {
        if (!key) return null;
        return this.filteredAlbums.find(album => album.key === key) || null;
    }

    // 生成tracks的简单哈希值
    _generateTracksHash(tracks: Track[] | null | undefined): string {
        if (!tracks || tracks.length === 0) return 'empty';
        // 使用tracks数量和前几个文件路径生成简单哈希
        const sample = tracks.slice(0, 3).map(t => t.filePath || t.title).join('|');
        return `${tracks.length}_${sample}`;
    }

    // 归并专辑
    processAlbums(): void {
        this.albums = libraryPageDataService.buildAlbums(this.tracks, {
            splitByArtist: albumGroupingPreferenceService.shouldSplitByArtist()
        });
        this.sortAlbums(this.sortBy, this.sortDirection);
    }

    // 将缺失封面的专辑加入获取队列
    scheduleCoversForMissing(keys: Array<string | number> = this.albumSurface.getRenderedKeys()): void {
        if (!this.albums || this.albums.length === 0) return;
        keys.forEach((key) => {
            const album = this.findFilteredAlbum(String(key));
            if (
                album
                && !album.cover
                && !this._coverRequests.has(album.key)
                && !this._coverFailures.has(album.key)
                && !this._coverQueue.includes(album.key)
            ) {
                this._coverQueue.push(album.key);
            }
        });
        void this._drainCoverQueue();
    }

    async _drainCoverQueue(): Promise<void> {
        while (this._coverConcurrency < this._coverMaxConcurrency && this._coverQueue.length > 0) {
            const key = this._coverQueue.shift();
            if (!key) continue;
            const album = this.albums.find(a => a.key === key);
            if (!album || album.cover) continue;
            this._coverConcurrency++;
            this._coverRequests.add(key);
            this._fetchAlbumCover(album)
                .catch(() => {
                })
                .finally(() => {
                    this._coverRequests.delete(key);
                    this._coverConcurrency--;
                    // 继续处理队列
                    if (this._coverQueue.length > 0) this._drainCoverQueue();
                });
        }
    }

    // 获取专辑封面
    async _fetchAlbumCover(album: AlbumItem): Promise<void> {
        const generation = this.coverGeneration;
        try {
            const artist = this._sanitize(album.artist);
            const name = this._sanitize(album.name || album.album);
            if (!name || !artist) {
                this._coverFailures.add(album.key);
                return;
            }
            // 显示加载态
            this._setAlbumCardLoading(album.key, true);
            const result = await libraryPageDataService.findCollectionCover(
                album.tracks,
                artist,
                name,
                trackCoverNetworkPreferenceService.isEnabled()
            );
            if (
                generation === this.coverGeneration
                && result
                && result.success
                && result.imageUrl
            ) {
                // 更新专辑数据
                album.cover = result.imageUrl;
                this.albumSurface.invalidateItem(album.key);
            } else {
                this._coverFailures.add(album.key);
            }
        } catch (e) {
            console.warn('获取专辑封面失败:', album?.name, e instanceof Error ? e.message : e);
            this._coverFailures.add(album.key);
        } finally {
            this._setAlbumCardLoading(album.key, false);
        }
    }

    _sanitize(val: unknown): string {
        if (val == null) return '';
        return String(val).trim();
    }

    _setAlbumCardLoading(key: string, loading: boolean): void {
        const tile = this.listRoot.querySelector<HTMLElement>(`.albumsx-tile[data-album-key="${CSS.escape(key)}"]`);
        if (!tile) return;
        const art = tile.querySelector('.art');
        if (!art) return;
        if (loading) art.classList.add('loading'); else art.classList.remove('loading');
    }

    sortAlbums(sortBy: AlbumSortKey, direction: SortDirection): void {
        this.sortBy = sortBy;
        this.sortDirection = direction;
        libraryPageDataService.sortAlbums(this.albums, sortBy, direction);
        this.applyAlbumFilter(false);
    }

    render(): void {
        if (!this.container) return;
        if (this.selectedAlbum) {
            this.renderAlbumDetail();
        } else {
            this.renderAlbumsList();
        }
        this.renderDirty = false;
    }

    // 专辑墙
    renderAlbumsList(): void {
        const snapshot = this.masterDetailHost.getLocation().kind === 'list' && this.listRoot.firstElementChild
            ? this.albumSurface.captureSnapshot()
            : null;
        this.container = this.listRoot;
        this.listRoot.style.display = 'block';
        this.detailRoot.style.display = 'none';
        this.trackCollectionDetail.hide();
        const sizes = {s: 110, m: 150, l: 200};
        const coverSize = sizes[this.viewSize] || sizes.m;
        const total = this.albums.length;
        this.container.innerHTML = `
            <div class="albumsx page">
                <div class="albumsx-toolbar">
                    <div class="left cluster">
                        <div class="title">
                            <span class="disc" aria-hidden>💿</span>
                            <span>专辑</span>
                            <em class="muted">${total} 张</em>
                        </div>
                        <div class="segmented" role="tablist" aria-label="封面尺寸">
                            <button class="seg-btn ${this.viewSize === 's' ? 'active' : ''}" data-size="s" ${this.viewMode === 'list' ? 'disabled' : ''}>小</button>
                            <button class="seg-btn ${this.viewSize === 'm' ? 'active' : ''}" data-size="m" ${this.viewMode === 'list' ? 'disabled' : ''}>中</button>
                            <button class="seg-btn ${this.viewSize === 'l' ? 'active' : ''}" data-size="l" ${this.viewMode === 'list' ? 'disabled' : ''}>大</button>
                        </div>
                    </div>
                    <div class="right cluster">
                        <div class="select">
                            <select id="album-sort" aria-label="排序">
                                <option value="name" ${this.sortBy === 'name' ? 'selected' : ''}>按专辑名</option>
                                <option value="artist" ${this.sortBy === 'artist' ? 'selected' : ''}>按艺术家</option>
                                <option value="tracks" ${this.sortBy === 'tracks' ? 'selected' : ''}>按歌曲数</option>
                                <option value="year" ${this.sortBy === 'year' ? 'selected' : ''}>按年份</option>
                            </select>
                        </div>
                        <button class="sort-direction-btn" id="album-sort-direction" type="button"
                                title="切换为${this.sortDirection === 'asc' ? '降序' : '升序'}"
                                aria-label="当前${this.sortDirection === 'asc' ? '升序' : '降序'}，点击切换">
                            ${this.sortDirection === 'asc' ? '↑' : '↓'}
                        </button>
                        <div class="search-inline">
                            <input type="text" id="album-query" value="${escapeHtmlAttribute(this.searchQuery)}" placeholder="搜索专辑或艺术家…" />
                        </div>
                        <div class="segmented" role="tablist" aria-label="视图模式">
                            <button class="seg-btn ${this.viewMode === 'grid' ? 'active' : ''}" data-view="grid">方格</button>
                            <button class="seg-btn ${this.viewMode === 'list' ? 'active' : ''}" data-view="list">列表</button>
                        </div>
                    </div>
                </div>
                ${total ? `
                <div class="album-surface-root ${this.viewMode === 'grid' ? 'albumsx-grid' : 'albumsx-list'}" style="--cover:${coverSize}px;"></div>
                <div class="albumsx-empty albumsx-no-results" hidden>
                    <h3>没有匹配的专辑</h3>
                    <p>请尝试其他专辑名或艺术家</p>
                </div>` : this.renderEmptyState()}
            </div>`;

        this.setupListEventListeners();
        this.updateAlbumSurface();
        if (snapshot) void this.albumSurface.resume(snapshot);
        this.listRenderDirty = false;
    }

    renderEmptyState(): string {
        return `
            <div class="albumsx-empty">
                <div class="icon">
                    <svg viewBox="0 0 24 24"><path d="M12,2A10,10 0 1,0 22,12A10,10 0 0,0 12,2M12,7A5,5 0 1,1 7,12A5,5 0 0,1 12,7Z"/></svg>
                </div>
                <h3>暂无专辑</h3>
                <p>添加一些音乐后，这里会像唱片墙一样展示你的收藏</p>
            </div>`;
    }

    renderAlbumTile(album: AlbumItem): string {
        const trackCount = album.tracks.length;
        const cover = album.cover || 'assets/images/default-cover.svg';
        const title = this.escapeHtml(album.name);
        const artist = this.escapeHtml(album.artist);
        const subtitle = `${artist} · ${album.year || '年份未知'} · ${trackCount} 首`;
        const tooltip = `${album.name}\n${album.artist} · ${album.year || '年份未知'} · ${trackCount} 首`;
        return `
            <div class="albumsx-tile ${this.viewMode === 'list' ? 'albumsx-list-item' : ''}"
                 data-album-key="${escapeHtmlAttribute(album.key)}" title="${escapeHtmlAttribute(tooltip)}">
                <div class="art shadow">
                    <img src="${escapeHtmlAttribute(cover)}" alt="${escapeHtmlAttribute(album.name)}" loading="lazy"/>
                </div>
                <div class="meta">
                    <div class="name clamp-1">${title}</div>
                    <div class="sub clamp-1">${this.viewMode === 'list' ? artist : subtitle}</div>
                </div>
                ${this.viewMode === 'list' ? `
                    <div class="album-list-details">
                        <span>${album.year || '年份未知'}</span>
                        <span>${trackCount} 首</span>
                        <span>${this.formatDuration(album.totalDuration)}</span>
                    </div>
                ` : ''}
            </div>`;
    }

    // 详情页
    // 布局：左封面右信息，下方歌曲，顶部毛玻璃栏
    renderAlbumDetail(): void {
        if (!this.selectedAlbum) return;
        const album = this.selectedAlbum;
        const tracks = [...album.tracks].sort((a, b) => ((a as any).disc || 0) - ((b as any).disc || 0) || ((a as any).track || 0) - ((b as any).track || 0));
        this.container = this.detailRoot;
        this.trackCollectionDetail.show({
            identity: album.key,
            title: album.name,
            description: album.artist,
            cover: album.cover,
            backLabel: '返回专辑',
            metadata: [
                album.year ? String(album.year) : '年份未知'
            ],
            tracks,
            coverArtist: tracks[0]?.albumArtist || tracks[0]?.artist || album.artist,
            coverAlbum: album.name
        });
        return;
    }

    setupListEventListeners(): void {
        // 封面尺寸切换
        this.container.querySelectorAll('.seg-btn').forEach((btn: any) => {
            btn.addEventListener('click', () => {
                const size = btn.dataset.size as AlbumViewSize | undefined;
                if (size && size !== this.viewSize) {
                    this.viewSize = size;
                    this.render();
                }
            });
        });
        this.container.querySelectorAll('[data-view]').forEach((btn: HTMLElement) => {
            btn.addEventListener('click', () => {
                const mode = btn.dataset.view;
                if (isAlbumViewMode(mode) && mode !== this.viewMode) {
                    this.viewMode = mode;
                    albumViewModePreferenceService.setMode(mode);
                    this.render();
                }
            });
        });
        // 排序
        const sortSelect = this.container.querySelector('#album-sort');
        if (sortSelect) {
            sortSelect.addEventListener('change', () => {
                this.sortAlbums(sortSelect.value as AlbumSortKey, this.sortDirection);
                this.render();
            });
        }
        this.container.querySelector('#album-sort-direction')?.addEventListener('click', () => {
            this.sortAlbums(this.sortBy, this.sortDirection === 'asc' ? 'desc' : 'asc');
            this.render();
        });
        // 搜索
        const q = this.container.querySelector('#album-query');
        if (q) {
            q.addEventListener('input', () => {
                this.searchQuery = q.value;
                this.applyAlbumFilter();
            });
        }
    }

    showAlbumDetail(album: AlbumItem): void {
        this.masterDetailHost.enterDetail(album.key);
        this.selectedAlbum = album;
        this.render();
    }

    private async closeAlbumDetail(): Promise<void> {
        this.selectedAlbum = null;
        this.trackCollectionDetail.hide();
        if (this.listRenderDirty || !this.listRoot.firstElementChild) {
            this.renderAlbumsList();
        }
        this.container = this.listRoot;
        await this.masterDetailHost.returnToList();
    }

    private applyAlbumFilter(updateSurface = true): void {
        applyCollectionSearch({
            source: this.albums,
            query: this.searchQuery,
            getSearchableValues: album => [album.name, album.artist],
            commit: results => this.filteredAlbums = results,
            refresh: updateSurface ? {
                resetScroll: () => this.scroll.scrollToTop(),
                updateView: () => this.updateAlbumSurface()
            } : undefined
        });
    }

    private updateAlbumSurface(): void {
        const surfaceRoot = this.listRoot.querySelector<HTMLElement>('.album-surface-root');
        const noResults = this.listRoot.querySelector<HTMLElement>('.albumsx-no-results');
        const scrollElement = document.querySelector<HTMLElement>('.main-content');
        if (!surfaceRoot || !scrollElement) return;
        surfaceRoot.className = `album-surface-root ${this.viewMode === 'grid' ? 'albumsx-grid' : 'albumsx-list'}`;
        surfaceRoot.style.setProperty('--cover', `${{s: 110, m: 150, l: 200}[this.viewSize]}px`);
        surfaceRoot.style.display = this.filteredAlbums.length === 0 ? 'none' : 'block';
        if (noResults) noResults.hidden = this.filteredAlbums.length !== 0;
        this.albumSurface.mount(surfaceRoot, scrollElement);
        this.albumSurface.update(this.filteredAlbums, this.getAlbumCollectionLayout());
    }

    private getAlbumCollectionLayout(): CollectionLayout {
        if (this.viewMode === 'list') {
            return {mode: 'list', estimateRowSize: 80, overscan: 8};
        }
        const coverSize = {s: 110, m: 150, l: 200}[this.viewSize];
        const gap = 24;
        return {
            mode: 'grid',
            estimateRowSize: coverSize + 104,
            getColumnCount: width => Math.max(1, Math.floor((width + gap) / (coverSize + 60 + gap))),
            overscan: 3
        };
    }

    formatDuration(seconds?: number): string {
        seconds = seconds || 0;
        if (seconds < 3600) {
            const minutes = Math.floor(seconds / 60);
            return `${minutes} 分钟`;
        } else {
            const hours = Math.floor(seconds / 3600);
            const minutes = Math.floor((seconds % 3600) / 60);
            return `${hours} 小时 ${minutes} 分钟`;
        }
    }

    // HTML转义
    escapeHtml(text: unknown): string {
        const div = document.createElement('div');
        div.textContent = text == null ? '' : String(text);
        return div.innerHTML;
    }

    // 方向性高光跟随：在稳定根上委托，并统一节流到一帧一次。
    private updateGloss(art: HTMLElement, clientX: number, clientY: number): void {
        this.pendingGloss = {art, x: clientX, y: clientY};
        if (this.glossFrame !== null) return;
        this.glossFrame = this.requestAnimationFrameManaged(() => {
            this.glossFrame = null;
            const pending = this.pendingGloss;
            this.pendingGloss = null;
            if (!pending) return;
            const rect = pending.art.getBoundingClientRect();
            const x = (pending.x - rect.left) / rect.width;
            const y = (pending.y - rect.top) / rect.height;
            pending.art.style.setProperty('--mx', x.toFixed(4));
            pending.art.style.setProperty('--my', y.toFixed(4));
            const cx = Math.abs(x - 0.5) * 2;
            const cy = Math.abs(y - 0.5) * 2;
            const strength = Math.max(0, 1 - Math.sqrt(cx * cx + cy * cy));
            pending.art.style.setProperty('--gloss', (0.25 + 0.55 * strength).toFixed(3));
            pending.art.style.setProperty('--ang', (Math.atan2(y - 0.5, x - 0.5) * 180 / Math.PI).toFixed(2));
        });
    }

    // 封面飞入过渡：共享元素转场
    // 固定定位 + 顶左原点缩放/平移
    animateToDetail(tileEl: HTMLElement, album: AlbumItem): void {
        const srcArtImg = tileEl.querySelector('.art img');
        const srcArt = tileEl.querySelector('.art');
        if (!srcArtImg || !srcArt) return this.showAlbumDetail(album);
        const srcRect = srcArtImg.getBoundingClientRect();
        const srcRadius = getComputedStyle(srcArt).borderRadius;

        this.masterDetailHost.enterDetail(album.key);
        this.selectedAlbum = album;
        this.render();
        const dstCover = this.container.querySelector('.detail-hero .cover');
        const dstImg = dstCover ? dstCover.querySelector('img') : null;
        if (!dstCover || !dstImg) return; // 回退
        // 设置详情内容初始态
        // 飞入完成后的分层进入动画
        this.prepareDetailSequence();
        // 强制一次布局以确保 rect 精准
        void dstCover.offsetHeight;
        const dstRect = dstCover.getBoundingClientRect();

        // 构建过渡层（ghost）
        const ghostWrap = document.createElement('div');
        const ghost = srcArtImg.cloneNode(true) as HTMLElement;
        Object.assign(ghostWrap.style, {
            position: 'fixed',
            left: `${srcRect.left}px`,
            top: `${srcRect.top}px`,
            width: `${srcRect.width}px`,
            height: `${srcRect.height}px`,
            borderRadius: srcRadius,
            overflow: 'hidden',
            boxShadow: '0 20px 60px rgba(0,0,0,.25)',
            zIndex: '9999',
            willChange: 'transform, border-radius',
            transformOrigin: 'top left',
            pointerEvents: 'none'
        });
        Object.assign(ghost.style, {width: '100%', height: '100%', objectFit: 'cover'});
        document.body.appendChild(ghostWrap);
        ghostWrap.appendChild(ghost);

        // 隐藏目标封面但保留布局
        const prevVis = dstCover.style.visibility;
        dstCover.style.visibility = 'hidden';

        // 计算目标位移与缩放
        // 以顶左为原点，避免回弹
        const dx = dstRect.left - srcRect.left;
        const dy = dstRect.top - srcRect.top;
        const sx = dstRect.width / srcRect.width;
        const sy = dstRect.height / srcRect.height;
        const dstRadius = getComputedStyle(dstCover).borderRadius;

        const anim = ghostWrap.animate([
            {transform: 'translate(0px, 0px) scale(1, 1)', borderRadius: srcRadius},
            {transform: `translate(${dx}px, ${dy}px) scale(${sx}, ${sy})`, borderRadius: dstRadius}
        ], {
            duration: 420,
            easing: 'cubic-bezier(0.22, 0.61, 0.36, 1)',
            fill: 'forwards'
        });

        anim.onfinish = () => {
            // 等一帧，确保动画最终帧已提交
            requestAnimationFrame(() => {
                // 显示目标封面，做一次交叉淡入，掩盖任何潜在的亚像素差异
                dstCover.style.visibility = prevVis;
                const fadeIn = dstImg.animate([
                    {opacity: 0},
                    {opacity: 1}
                ], {duration: 140, easing: 'ease-out', fill: 'forwards'});
                const fadeOut = ghostWrap.animate([
                    {opacity: 1},
                    {opacity: 0}
                ], {duration: 140, easing: 'ease-out', fill: 'forwards'});
                // 最终清理 + 开始内容分层进入
                Promise.allSettled([fadeIn.finished, fadeOut.finished]).finally(() => {
                    ghostWrap.remove();
                    this.runDetailSequence();
                });
            });
        };
    }

    // 详情页内容分层进入：设置初始态
    prepareDetailSequence(): void {
        const title = this.container.querySelector('.detail-hero .info .name');
        const stats = this.container.querySelector('.detail-hero .info .stats');
        const actions = this.container.querySelector('.detail-hero .info .actions');
        const tracks = this.container.querySelectorAll('.detail-tracks .trackx');
        const setInit = (elList: any) => {
            if (!elList) return;
            const els = elList instanceof NodeList ? Array.from(elList) : [elList];
            els.forEach(el => {
                if (el) {
                    el.style.opacity = '0';
                    el.style.transform = 'translateY(10px)';
                }
            });
        };
        setInit(title);
        setInit(stats);
        setInit(actions);
        setInit(tracks);
    }

    // 详情页内容分层进入：执行序列
    runDetailSequence(): void {
        const title = this.container.querySelector('.detail-hero .info .name');
        const stats = this.container.querySelector('.detail-hero .info .stats');
        const actions = this.container.querySelector('.detail-hero .info .actions');
        const tracks = this.container.querySelectorAll('.detail-tracks .trackx');
        const phase = (els: any, delayBase: number) => {
            const list = els instanceof NodeList ? Array.from(els) : [els];
            list.forEach((el, i) => {
                if (!el) return;
                el.animate([
                    {opacity: 0, transform: 'translateY(10px)'},
                    {opacity: 1, transform: 'translateY(0px)'}
                ], {duration: 240, delay: delayBase + i * 24, easing: 'ease-out', fill: 'forwards'});
            });
        };
        // 封面飞入完成后顺序：标题 → 统计 → 按钮 → 歌曲
        phase(title, 40);
        phase(stats, 120);
        phase(actions, 200);
        phase(tracks, 280); // 列表逐个延迟 24ms，整体节奏轻快
    }

}

export { AlbumsPage };

function isAlbumViewMode(value: unknown): value is AlbumViewMode {
    return value === 'grid' || value === 'list';
}
