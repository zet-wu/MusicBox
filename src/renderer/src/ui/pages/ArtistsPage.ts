/**
 * 艺术家页组件
 */

import {urlValidator} from "@utils/URLValidator";
import {Component} from "@ui/base/Component";
import {
    libraryPageDataService,
    type ArtistSortKey,
    type CoverLookupResult as CoverResult,
    type LibraryArtistInfo as ArtistInfo,
    type SortDirection
} from "@/features/library/service/LibraryPageDataService";
import {
    artistViewModePreferenceService,
    trackCoverNetworkPreferenceService
} from "@/features/settings/service";
import {ElementVirtualizer} from "@ui/virtualization/ElementVirtualizer";
import {TrackCollectionDetail} from "@ui/components/TrackCollectionDetail";
import type {VirtualItem} from "@tanstack/virtual-core";
import type {Unsubscribe} from "@api/types/common";
import type {ArtistViewMode} from "@api/types/settings";
import type {Track} from "@api/types/track";
import {MainContentScrollCoordinator} from '@/app/runtime/MainContentScrollCoordinator';

type ArtistViewSize = 's' | 'm' | 'l';

const ARTIST_COVER_SIZES: Record<ArtistViewSize, number> = {
    s: 110,
    m: 150,
    l: 200
};

class ArtistsPage extends Component {
    private container: any;
    private readonly listRoot: HTMLElement;
    private readonly detailRoot: HTMLElement;
    private readonly scroll: MainContentScrollCoordinator;
    private tracks: Track[];
    private artists: ArtistInfo[];
    private filteredArtists: ArtistInfo[];
    private selectedArtist: ArtistInfo | null;
    private viewMode: ArtistViewMode;
    private viewSize: ArtistViewSize;
    private sortBy: ArtistSortKey;
    private sortDirection: SortDirection;
    private searchQuery: string;
    private listenersSetup: boolean;
    private _coverFailures: Set<string>;
    private _coverLoading: Set<string>;
    private _coverFetchingInProgress: boolean;
    private coverGeneration: number;
    private coverPreferenceUnsubscribe: Unsubscribe | null;
    private isVisible: boolean;
    private renderDirty = true;
    private listRenderDirty = true;
    private listScrollTop = 0;
    private artistVirtualizer: ElementVirtualizer | null;
    private readonly trackCollectionDetail: TrackCollectionDetail;

    constructor(container: string | Element | null, scroll: MainContentScrollCoordinator) {
        super(container);
        const pageRoot = this.element as HTMLElement;
        this.scroll = scroll;
        this.listRoot = document.createElement('div');
        this.listRoot.className = 'artists-list-root';
        this.detailRoot = document.createElement('div');
        this.detailRoot.className = 'artists-detail-root';
        this.detailRoot.style.display = 'none';
        pageRoot.replaceChildren(this.listRoot, this.detailRoot);
        this.container = this.listRoot;
        this.tracks = [];
        this.artists = [];
        this.filteredArtists = [];
        this.selectedArtist = null;
        this.viewMode = artistViewModePreferenceService.getMode();
        this.viewSize = 'm';
        this.sortBy = 'name';
        this.sortDirection = 'asc';
        this.searchQuery = '';
        this.listenersSetup = false; // 事件监听器是否已设置
        this._coverFailures = new Set(); // 记录封面获取失败的艺术家
        this._coverLoading = new Set(); // 记录正在加载封面的艺术家
        this._coverFetchingInProgress = false; // 防止重复启动封面获取
        this.coverGeneration = 0;
        this.isVisible = false;
        this.artistVirtualizer = null;
        this.trackCollectionDetail = new TrackCollectionDetail(this.detailRoot, {
            onBack: () => this.closeArtistDetail(),
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
                    this.selectedArtist?.tracks || []
                );
            }
        }, {observeNetworkPreference: false});
        this.coverPreferenceUnsubscribe = trackCoverNetworkPreferenceService.onChanged((enabled) => {
            this.coverGeneration++;
            this._coverFetchingInProgress = false;
            this._coverLoading.clear();
            this._coverFailures.clear();
            this.renderDirty = true;
            if (this.selectedArtist) this.listRenderDirty = true;
            if (!enabled) {
                const selectedArtistName = this.selectedArtist?.name;
                this.processArtists();
                this.selectedArtist = selectedArtistName
                    ? this.artists.find(artist => artist.name === selectedArtistName) || null
                    : null;
                if (this.isVisible) {
                    this.render();
                }
            } else if (this.isVisible) {
                if (this.selectedArtist) {
                    this.render();
                } else {
                    this._startCoverFetching();
                }
            }
        });
    }

    async show(): Promise<void> {
        const viewGeneration = ++this.coverGeneration;
        if (!this.listenersSetup) {
            this.setupElements();
            this.setupAPIListeners();
            this.listenersSetup = true;
        }
        if (this.element instanceof HTMLElement) {
            this.element.style.display = 'block';
        }
        this.isVisible = true;

        // 只有在没有tracks数据时才获取，避免重复调用
        if (!this.tracks || this.tracks.length === 0) {
            const pageData = await libraryPageDataService.getArtists();
            if (!this.isVisible || viewGeneration !== this.coverGeneration) return;
            this.tracks = pageData.tracks as Track[];
            this.artists = pageData.artists as ArtistInfo[];
            this.filteredArtists = [...this.artists];
            this.renderDirty = true;
        }

        if (this.renderDirty || !this.listRoot.firstElementChild) {
            this.render();
        } else if (!this.selectedArtist) {
            this.mountArtistVirtualizer();
        }
    }

    // 生成tracks的简单哈希值
    _generateTracksHash(tracks: Track[]): string {
        if (!tracks || tracks.length === 0) return 'empty';
        const sample = tracks.slice(0, 3).map(t => t.filePath || t.title).join('|');
        return `${tracks.length}_${sample}`;
    }

    hide(): void {
        this.coverGeneration++;
        this.isVisible = false;
        this.destroyArtistVirtualizer();
        if (this.selectedArtist) {
            this.renderDirty = true;
            this.scroll.remember('artists', this.listScrollTop);
        }
        this.trackCollectionDetail.hide();
        this.selectedArtist = null;
        if (this.element instanceof HTMLElement) {
            this.element.style.display = 'none';
        }
    }

    destroy(): void {
        this.destroyArtistVirtualizer();
        this.trackCollectionDetail.destroy();

        this.tracks.length = 0;
        this.artists.length = 0;
        this.filteredArtists.length = 0;
        this.selectedArtist = null;
        this.listenersSetup = false;

        // 清理封面获取相关状态
        if (this._coverFailures) {
            this._coverFailures.clear();
        }
        if (this._coverLoading) {
            this._coverLoading.clear();
        }
        this._coverFetchingInProgress = false;
        this.coverPreferenceUnsubscribe?.();
        this.coverPreferenceUnsubscribe = null;

        super.destroy();
    }

    setupElements(): void {
        this.container = this.listRoot;
    }

    setupAPIListeners(): void {
        // 监听音乐库更新
        this.addAPIEventListenerManaged('libraryUpdated', (tracks: Track[]) => {
            const selectedArtistName = this.selectedArtist?.name;
            this.tracks = tracks;
            this.processArtists();
            this.selectedArtist = selectedArtistName
                ? this.artists.find((artist) => artist.name === selectedArtistName) || null
                : null;
            this.renderDirty = true;
            if (this.selectedArtist) this.listRenderDirty = true;
            if (this.isVisible) this.render();
        });
    }

    processArtists(): void {
        this.artists = libraryPageDataService.buildArtists(this.tracks as any) as ArtistInfo[];
        libraryPageDataService.sortArtists(this.artists, this.sortBy, this.sortDirection);
        this.filteredArtists = [...this.artists];
    }

    render(): void {
        if (!this.container) return;

        if (this.selectedArtist) {
            this.renderArtistDetail();
        } else {
            this.renderArtistsList();
        }
        this.renderDirty = false;
    }

    renderArtistsList(): void {
        this.container = this.listRoot;
        this.listRoot.style.display = 'block';
        this.detailRoot.style.display = 'none';
        this.trackCollectionDetail.hide();
        const coverSize = ARTIST_COVER_SIZES[this.viewSize];
        this.container.innerHTML = `
            <div class="page-content artists-page modern-artists albumsx artistsx page">
                <div class="albumsx-toolbar">
                    <div class="left cluster">
                        <div class="title">
                            <span class="disc" aria-hidden>🎤</span>
                            <span>星河</span>
                            <em class="muted">${this.artists.length} 位</em>
                        </div>
                        <div class="segmented" role="tablist" aria-label="头像尺寸">
                            <button class="seg-btn ${this.viewSize === 's' ? 'active' : ''}" data-size="s" ${this.viewMode === 'list' ? 'disabled' : ''}>小</button>
                            <button class="seg-btn ${this.viewSize === 'm' ? 'active' : ''}" data-size="m" ${this.viewMode === 'list' ? 'disabled' : ''}>中</button>
                            <button class="seg-btn ${this.viewSize === 'l' ? 'active' : ''}" data-size="l" ${this.viewMode === 'list' ? 'disabled' : ''}>大</button>
                        </div>
                    </div>
                    <div class="right cluster">
                        <div class="select">
                            <select id="artist-sort" aria-label="艺术家排序字段">
                                <option value="name" ${this.sortBy === 'name' ? 'selected' : ''}>按艺术家名</option>
                                <option value="tracks" ${this.sortBy === 'tracks' ? 'selected' : ''}>按歌曲数</option>
                            </select>
                        </div>
                        <button class="sort-direction-btn" id="artist-sort-direction" type="button"
                                title="切换为${this.sortDirection === 'asc' ? '降序' : '升序'}"
                                aria-label="当前${this.sortDirection === 'asc' ? '升序' : '降序'}，点击切换">
                            ${this.sortDirection === 'asc' ? '↑' : '↓'}
                        </button>
                        <div class="search-inline">
                            <input type="text" id="artist-search" value="${this.escapeHtml(this.searchQuery)}" placeholder="搜索艺术家…">
                        </div>
                        <div class="segmented" role="tablist" aria-label="视图模式">
                            <button class="seg-btn ${this.viewMode === 'grid' ? 'active' : ''}" data-view="grid">方格</button>
                            <button class="seg-btn ${this.viewMode === 'list' ? 'active' : ''}" data-view="list">列表</button>
                        </div>
                    </div>
                </div>

                ${this.artists.length > 0 ? `
                    <div class="artists-browser ${this.viewMode}-view" style="--cover:${coverSize}px;">
                        <div class="artist-virtual-body"></div>
                    </div>
                ` : `
                    <div class="albumsx-empty">
                        <div class="icon">
                            <svg viewBox="0 0 24 24"><path d="M12,4A4,4 0 0,1 16,8A4,4 0 0,1 12,12A4,4 0 0,1 8,8A4,4 0 0,1 12,4M12,14C16.42,14 20,15.79 20,18V20H4V18C4,15.79 7.58,14 12,14Z"/></svg>
                        </div>
                        <h3>暂无艺术家</h3>
                        <p>添加音乐后，这里会展示音乐库中的艺术家</p>
                    </div>
                `}
            </div>
        `;

        this.setupEventListeners();
        this.mountArtistVirtualizer();
        this.listRenderDirty = false;
    }

    // 设置事件监听器
    setupEventListeners(): void {
        // 搜索功能
        const searchInput = this.container.querySelector('#artist-search');
        if (searchInput) {
            searchInput.addEventListener('input', (e: Event) => {
                this.filterArtists((e.target as HTMLInputElement).value);
            });
        }

        const sortSelect = this.container.querySelector('#artist-sort') as HTMLSelectElement | null;
        sortSelect?.addEventListener('change', () => {
            this.sortBy = sortSelect.value as ArtistSortKey;
            this.applyArtistSort();
        });

        this.container.querySelector('#artist-sort-direction')?.addEventListener('click', () => {
            this.sortDirection = this.sortDirection === 'asc' ? 'desc' : 'asc';
            this.applyArtistSort();
        });

        this.container.querySelectorAll('[data-size]').forEach((btn: HTMLElement) => {
            btn.addEventListener('click', () => {
                const size = btn.dataset.size;
                if (isArtistViewSize(size) && size !== this.viewSize) {
                    this.viewSize = size;
                    this.renderArtistsList();
                }
            });
        });

        // 视图模式切换
        this.container.querySelectorAll('[data-view]').forEach((btn: HTMLElement) => {
            btn.addEventListener('click', () => {
                const newMode = btn.dataset.view;
                if (isArtistViewMode(newMode) && newMode !== this.viewMode) {
                    this.switchViewMode(newMode);
                }
            });
        });

    }

    // 艺术家详情显示
    showArtistDetailWithTransition(artist: ArtistInfo, element: HTMLElement): void {
        // 获取点击的封面元素
        const avatarImg = element.querySelector('.artist-avatar img');

        if (!avatarImg) {
            // 如果找不到头像，直接显示详情页面
            return this.showArtistDetail(artist);
        }

        // 执行封面飞入动画
        this.animateToArtistDetail(element, artist, avatarImg as HTMLImageElement);
    }

    // 封面飞入过渡动画：共享元素转场
    animateToArtistDetail(sourceElement: HTMLElement, artist: ArtistInfo, sourceImg: HTMLImageElement): void {
        void sourceElement;
        if (!sourceImg) return this.showArtistDetail(artist);

        const srcRect = sourceImg.getBoundingClientRect();
        const srcContainer = sourceImg.closest('.artist-avatar');

        // 记录源位置信息用于可能的返回动画
        const scrollEl = this.getScrollContainer();
        const srcRadius = srcContainer ? getComputedStyle(srcContainer).borderRadius : '50%';
        this.rememberArtistListPosition(scrollEl?.scrollTop ?? window.scrollY ?? 0);

        // 渲染艺术家详情页面
        this.selectedArtist = artist;
        this.render();
        this.scroll.scrollToTop();

        const targetAvatar = this.container.querySelector('.detail-target-avatar');
        const targetImg = targetAvatar ? targetAvatar.querySelector('img') : null;

        if (!targetAvatar || !targetImg) {
            return;
        }

        // 准备详情页面内容的分层进入动画
        this.prepareArtistDetailSequence();

        // 强制布局以确保目标位置准确
        void targetAvatar.offsetHeight;
        const dstRect = targetAvatar.getBoundingClientRect();

        // 创建飞入动画的幽灵元素
        const ghostWrap = document.createElement('div');
        const ghost = sourceImg.cloneNode(true) as HTMLImageElement;

        Object.assign(ghostWrap.style, {
            position: 'fixed',
            left: `${srcRect.left}px`,
            top: `${srcRect.top}px`,
            width: `${srcRect.width}px`,
            height: `${srcRect.height}px`,
            borderRadius: srcRadius,
            overflow: 'hidden',
            boxShadow: '0 20px 60px rgba(0,0,0,.3)',
            zIndex: '9999',
            willChange: 'transform, border-radius',
            transformOrigin: 'top left',
            pointerEvents: 'none'
        });

        Object.assign(ghost.style, {
            width: '100%',
            height: '100%',
            objectFit: 'cover'
        });

        document.body.appendChild(ghostWrap);
        ghostWrap.appendChild(ghost);

        // 隐藏目标头像但保留布局
        const prevVis = targetAvatar.style.visibility;
        targetAvatar.style.visibility = 'hidden';

        // 计算目标位移与缩放
        const dx = dstRect.left - srcRect.left;
        const dy = dstRect.top - srcRect.top;
        const sx = dstRect.width / srcRect.width;
        const sy = dstRect.height / srcRect.height;
        const dstRadius = getComputedStyle(targetAvatar).borderRadius;

        // 执行飞入动画
        const anim = ghostWrap.animate([
            {
                transform: 'translate(0px, 0px) scale(1, 1)',
                borderRadius: srcRadius
            },
            {
                transform: `translate(${dx}px, ${dy}px) scale(${sx}, ${sy})`,
                borderRadius: dstRadius
            }
        ], {
            duration: 420,
            easing: 'cubic-bezier(0.22, 0.61, 0.36, 1)',
            fill: 'forwards'
        });

        anim.onfinish = () => {
            this.requestAnimationFrameManaged(() => {
                // 显示目标头像，交叉淡入掩盖差异
                targetAvatar.style.visibility = prevVis;

                const fadeIn = targetImg.animate([
                    {opacity: 0},
                    {opacity: 1}
                ], {
                    duration: 140,
                    easing: 'ease-out',
                    fill: 'forwards'
                });

                const fadeOut = ghostWrap.animate([
                    {opacity: 1},
                    {opacity: 0}
                ], {
                    duration: 140,
                    easing: 'ease-out',
                    fill: 'forwards'
                });

                // 清理并开始内容分层进入动画
                Promise.allSettled([fadeIn.finished, fadeOut.finished]).finally(() => {
                    ghostWrap.remove();
                    this.runArtistDetailSequence();
                });
            });
        };
    }

    // 获取滚动容器
    getScrollContainer(): any {
        return document.querySelector<HTMLElement>('.main-content');
    }

    // 获取艺术家封面
    async _fetchArtistCover(artist: ArtistInfo): Promise<void> {
        const generation = this.coverGeneration;
        try {
            const artistName = this._sanitize(artist.name);
            if (!artistName) {
                this._coverFailures.add(artist.name);
                return;
            }

            // 避免重复请求
            if (this._coverFailures.has(artist.name) || this._coverLoading.has(artist.name)) {
                return;
            }

            // 显示加载态
            this._setArtistCardLoading(artist.name, true);
            this._coverLoading.add(artist.name);

            // 调用API获取艺术家封面
            // 只传艺术家名称，不传专辑名
            const result = await libraryPageDataService.findCollectionCover(
                artist.tracks,
                artistName,
                '',
                trackCoverNetworkPreferenceService.isEnabled()
            ) as CoverResult;
            if (
                generation === this.coverGeneration
                && result
                && result.success
                && result.imageUrl
            ) {
                // 更新艺术家数据
                artist.cover = result.imageUrl;
                // 局部刷新：更新对应卡片的图片src
                this._updateArtistCardCover(artist.name, result.imageUrl);
            } else {
                this._coverFailures.add(artist.name);
                console.log('❌ 艺术家封面获取失败:', artistName, result?.error);
            }
        } catch (e) {
            console.warn('获取艺术家封面失败:', artist?.name, getErrorMessage(e));
            this._coverFailures.add(artist.name);
        } finally {
            this._setArtistCardLoading(artist.name, false);
            this._coverLoading.delete(artist.name);
        }
    }

    // 字符串清理方法
    _sanitize(val: unknown): string {
        if (val == null) return '';
        return String(val).trim();
    }

    // 设置艺术家卡片加载状态
    _setArtistCardLoading(artistName: string, isLoading: boolean): void {
        const artistCards = this.listRoot.querySelectorAll<HTMLElement>(`[data-artist="${CSS.escape(artistName)}"]`);
        artistCards.forEach((card: HTMLElement) => {
            const img = card.querySelector('img');
            if (img) {
                if (isLoading) {
                    img.style.opacity = '0.6';
                    img.style.filter = 'blur(1px)';
                } else {
                    img.style.opacity = '';
                    img.style.filter = '';
                }
            }
        });
    }

    // 更新艺术家卡片封面
    _updateArtistCardCover(artistName: string, imageUrl: string): void {
        const artistCards = this.listRoot.querySelectorAll<HTMLElement>(`[data-artist="${CSS.escape(artistName)}"]`);
        artistCards.forEach((card: HTMLElement) => {
            const img = card.querySelector('img');
            if (img && imageUrl) {
                // 使用安全的图片设置方法
                if (urlValidator) {
                    urlValidator.safeSetImageSrc(img, imageUrl).then((success: boolean) => {
                        if (success) {
                            img.style.opacity = '';
                            img.style.filter = '';
                        }
                    });
                } else {
                    img.src = imageUrl;
                    img.style.opacity = '';
                    img.style.filter = '';
                }
            }
        });
    }

    // 启动封面获取流程
    _startCoverFetching(candidates: ArtistInfo[] = this.filteredArtists): void {
        // 防止重复启动封面获取
        if (this._coverFetchingInProgress) {
            return;
        }

        // 检查是否有需要获取封面的艺术家
        const artistsNeedingCovers = candidates.filter((artist) =>
            !artist.cover &&
            !this._coverFailures.has(artist.name) &&
            !this._coverLoading.has(artist.name)
        );

        if (artistsNeedingCovers.length === 0) {
            return; // 没有需要获取封面的艺术家
        }

        this._coverFetchingInProgress = true;

        this.requestIdleCallbackManaged(() => {
            this._fetchCoversForVisibleArtists(candidates).finally(() => {
                this._coverFetchingInProgress = false;
            });
        }, {timeout: 100});
    }

    // 为可见的艺术家获取封面
    async _fetchCoversForVisibleArtists(candidates: ArtistInfo[]): Promise<void> {
        // 只为没有封面的艺术家获取封面
        const artistsNeedingCovers = candidates.filter((artist) =>
            !artist.cover &&
            !this._coverFailures.has(artist.name) &&
            !this._coverLoading.has(artist.name)
        );

        // 限制并发请求数量，避免过多请求
        const batchSize = 3;
        for (let i = 0; i < artistsNeedingCovers.length; i += batchSize) {
            const batch = artistsNeedingCovers.slice(i, i + batchSize);

            // 并发获取这一批的封面
            await Promise.allSettled(
                batch.map((artist) => this._fetchArtistCover(artist))
            );

            // 在批次之间添加小延迟，避免请求过于频繁
            if (i + batchSize < artistsNeedingCovers.length) {
                await new Promise<void>((resolve) => {
                    this.setTimeoutManaged(resolve, 200);
                });
            }
        }
    }

    // 准备艺术家详情页面内容的分层进入动画
    prepareArtistDetailSequence(): void {
        const title = this.container.querySelector('.artist-title');
        const stats = this.container.querySelector('.artist-stats-modern');
        const actions = this.container.querySelector('.artist-actions-modern');
        const tracksTitle = this.container.querySelector('.tracks-title');
        const albums = this.container.querySelectorAll('.album-orbit');

        const setInitialState = (elements: any) => {
            if (!elements) return;
            const els = elements instanceof NodeList ? Array.from(elements) : [elements];
            els.forEach((el: HTMLElement) => {
                if (el) {
                    el.style.opacity = '0';
                    el.style.transform = 'translateY(20px)';
                }
            });
        };

        setInitialState(title);
        setInitialState(stats);
        setInitialState(actions);
        setInitialState(tracksTitle);
        setInitialState(albums);
    }

    // 执行艺术家详情页面内容的分层进入动画
    runArtistDetailSequence(): void {
        const title = this.container.querySelector('.artist-title');
        const stats = this.container.querySelector('.artist-stats-modern');
        const actions = this.container.querySelector('.artist-actions-modern');
        const tracksTitle = this.container.querySelector('.tracks-title');
        const albums = this.container.querySelectorAll('.album-orbit');

        const animatePhase = (elements: any, delayBase: number) => {
            if (!elements) return;
            const els = elements instanceof NodeList ? Array.from(elements) : [elements];
            els.forEach((el: HTMLElement, i: number) => {
                if (el) {
                    el.animate([
                        {opacity: 0, transform: 'translateY(20px)'},
                        {opacity: 1, transform: 'translateY(0px)'}
                    ], {
                        duration: 300,
                        delay: delayBase + i * 50,
                        easing: 'cubic-bezier(0.22, 0.61, 0.36, 1)',
                        fill: 'forwards'
                    });
                }
            });
        };

        // 分层动画序列：标题 → 统计 → 按钮 → 专辑标题 → 专辑列表
        animatePhase(title, 50);
        animatePhase(stats, 150);
        animatePhase(actions, 250);
        animatePhase(tracksTitle, 350);
        animatePhase(albums, 450);
    }

    // 过滤艺术家
    filterArtists(searchTerm: string): void {
        this.searchQuery = searchTerm;
        if (!searchTerm.trim()) {
            this.filteredArtists = [...this.artists];
        } else {
            const term = searchTerm.toLowerCase();
            this.filteredArtists = this.artists.filter((artist) =>
                artist.name.toLowerCase().includes(term)
            );
        }

        this.updateArtistsDisplay();
    }

    private applyArtistSort(): void {
        libraryPageDataService.sortArtists(this.artists, this.sortBy, this.sortDirection);
        libraryPageDataService.sortArtists(this.filteredArtists, this.sortBy, this.sortDirection);
        this.renderArtistsList();
    }

    // 更新艺术家显示区域
    updateArtistsDisplay(): void {
        const browser = this.container.querySelector('.artists-browser');
        if (browser) {
            browser.className = `artists-browser ${this.viewMode}-view`;
            this.mountArtistVirtualizer();
        }
    }

    private mountArtistVirtualizer(): void {
        this.destroyArtistVirtualizer();
        const container = this.container as HTMLElement | null;
        const body = container?.querySelector<HTMLElement>('.artist-virtual-body');
        const scrollElement = document.querySelector<HTMLElement>('.main-content');
        if (!body || !scrollElement) {
            return;
        }

        if (this.filteredArtists.length === 0) {
            body.innerHTML = '<div class="artists-no-results">没有找到匹配的艺术家</div>';
            return;
        }

        const availableWidth = body.clientWidth || this.container.clientWidth || 800;
        const coverSize = ARTIST_COVER_SIZES[this.viewSize];
        const gridCellWidth = coverSize + 60;
        const columns = this.viewMode === 'grid'
            ? Math.max(1, Math.floor((availableWidth + 20) / (gridCellWidth + 20)))
            : 1;
        const rowCount = Math.ceil(this.filteredArtists.length / columns);
        const scrollMargin = this.getArtistScrollMargin(body, scrollElement);

        body.addEventListener('click', (event: MouseEvent) => {
            const target = event.target instanceof Element ? event.target : null;
            const item = target?.closest<HTMLElement>('.artist-library-item');
            const index = Number.parseInt(item?.dataset.artistIndex || '', 10);
            const artist = Number.isInteger(index) ? this.filteredArtists[index] : null;
            if (!artist || !item) {
                return;
            }

            this.showArtistDetailWithTransition(artist, item);
        });

        body.addEventListener('contextmenu', (event: MouseEvent) => {
            const target = event.target instanceof Element ? event.target : null;
            const item = target?.closest<HTMLElement>('.artist-library-item');
            const index = Number.parseInt(item?.dataset.artistIndex || '', 10);
            const artist = Number.isInteger(index) ? this.filteredArtists[index] : null;
            if (!artist || !item) return;
            event.preventDefault();
            if (artist.tracks.length > 0) {
                this.emit('collectionRightClick', artist.tracks, event.clientX, event.clientY);
            }
        });

        this.artistVirtualizer = new ElementVirtualizer({
            count: rowCount,
            estimateSize: () => this.viewMode === 'grid' ? coverSize + 94 : 82,
            getItemKey: (index) => `artist-row-${index}`,
            getScrollElement: () => scrollElement,
            scrollMargin,
            overscan: 3,
            onChange: (items, totalSize) => {
                if (!this.isVisible || !this.artistVirtualizer) {
                    return;
                }

                body.style.height = `${totalSize}px`;
                body.innerHTML = items
                    .map(item => this.renderArtistVirtualRow(item, columns, scrollMargin))
                    .join('');
                body.querySelectorAll<HTMLElement>('.artist-virtual-row').forEach((row) => {
                    this.artistVirtualizer?.measureElement(row);
                });

                const visibleArtists = items.flatMap((item) => {
                    const start = item.index * columns;
                    return this.filteredArtists.slice(start, start + columns);
                });
                this._startCoverFetching(visibleArtists);
            }
        });
        this.artistVirtualizer.mount();
    }

    private renderArtistVirtualRow(item: VirtualItem, columns: number, scrollMargin: number): string {
        const start = item.index * columns;
        const artists = this.filteredArtists.slice(start, start + columns);
        const translateY = item.start - scrollMargin;
        return `
            <div class="artist-virtual-row ${this.viewMode}-row"
                 data-index="${item.index}"
                 style="transform: translateY(${translateY}px); --artist-columns:${columns};">
                ${artists.map((artist, offset) => this.renderArtistLibraryItem(artist, start + offset)).join('')}
            </div>
        `;
    }

    private renderArtistLibraryItem(artist: ArtistInfo, index: number): string {
        const cover = artist.cover || 'assets/images/default-cover.svg';
        return `
            <div class="artist-library-item" data-artist-index="${index}" data-artist="${this.escapeHtml(artist.name)}" tabindex="0">
                <div class="artist-avatar">
                    <img src="${cover}" alt="${this.escapeHtml(artist.name)}" loading="lazy">
                </div>
                <div class="artist-library-info">
                    <div class="artist-library-name" title="${this.escapeHtml(artist.name)}">${this.escapeHtml(artist.name)}</div>
                    <div class="artist-library-stats">
                        ${artist.tracks.length} 首歌曲 · ${artist.albums.size} 张专辑
                        ${this.viewMode === 'list' ? ` · ${this.formatDuration(artist.totalDuration)}` : ''}
                    </div>
                </div>
            </div>
        `;
    }

    private getArtistScrollMargin(body: HTMLElement, scrollElement: HTMLElement): number {
        const bodyRect = body.getBoundingClientRect();
        const scrollRect = scrollElement.getBoundingClientRect();
        return bodyRect.top - scrollRect.top + scrollElement.scrollTop;
    }

    private destroyArtistVirtualizer(): void {
        this.artistVirtualizer?.destroy();
        this.artistVirtualizer = null;
    }

    // 切换视图模式
    switchViewMode(newMode: ArtistViewMode): void {
        this.viewMode = newMode;
        artistViewModePreferenceService.setMode(newMode);
        this.renderArtistsList();
    }

    renderArtistDetail(): void {
        if (!this.selectedArtist) return;

        const artist = this.selectedArtist;
        this.destroyArtistVirtualizer();
        this.container = this.detailRoot;
        this.listRoot.style.display = 'none';
        this.detailRoot.style.display = 'block';
        this.trackCollectionDetail.show({
            title: artist.name,
            description: '艺术家歌曲',
            cover: artist.cover,
            backLabel: '返回星河',
            metadata: [`${artist.albums.size} 张专辑`],
            tracks: [...artist.tracks],
            coverArtist: artist.name,
            coverAlbum: ''
        });
        return;
    }

    showArtistDetail(artist: ArtistInfo): void {
        this.rememberArtistListPosition();
        this.selectedArtist = artist;
        this.render();
        this.scroll.scrollToTop();
    }

    private closeArtistDetail(): void {
        this.selectedArtist = null;
        this.trackCollectionDetail.hide();
        if (this.listRenderDirty || !this.listRoot.firstElementChild) {
            this.renderArtistsList();
        } else {
            this.container = this.listRoot;
            this.detailRoot.style.display = 'none';
            this.listRoot.style.display = 'block';
            this.mountArtistVirtualizer();
        }
        this.scroll.remember('artists', this.listScrollTop);
        this.scroll.restore('artists', () => this.isVisible && !this.selectedArtist);
    }

    private rememberArtistListPosition(scrollTop = this.getScrollContainer()?.scrollTop ?? 0): void {
        this.listScrollTop = Math.max(0, scrollTop);
        this.scroll.remember('artists', this.listScrollTop);
    }

    formatDuration(seconds: number = 0): string {
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
        div.textContent = String(text ?? '');
        return div.innerHTML;
    }
}

function isArtistViewMode(value: unknown): value is ArtistViewMode {
    return value === 'grid' || value === 'list';
}

function isArtistViewSize(value: unknown): value is ArtistViewSize {
    return value === 's' || value === 'm' || value === 'l';
}

function getErrorMessage(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
}

export { ArtistsPage };
