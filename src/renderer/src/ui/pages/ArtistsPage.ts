/**
 * 艺术家页组件
 */

import {urlValidator} from "@utils/URLValidator";
import {Component} from "@ui/base/Component";
import {
    libraryPageDataService,
    type CoverLookupResult as CoverResult,
    type LibraryArtistInfo as ArtistInfo
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

interface SourceRectSnapshot {
    left: number;
    top: number;
    width: number;
    height: number;
    radius: string;
    scrollTop: number;
}

class ArtistsPage extends Component {
    private container: any;
    private tracks: Track[];
    private artists: ArtistInfo[];
    private filteredArtists: ArtistInfo[];
    private selectedArtist: ArtistInfo | null;
    private viewMode: ArtistViewMode;
    private listenersSetup: boolean;
    private _coverFailures: Set<string>;
    private _coverLoading: Set<string>;
    private _coverFetchingInProgress: boolean;
    private coverGeneration: number;
    private coverPreferenceUnsubscribe: Unsubscribe | null;
    private isVisible: boolean;
    private artistVirtualizer: ElementVirtualizer | null;
    private readonly trackCollectionDetail: TrackCollectionDetail;

    constructor(container: string | Element | null) {
        super(container);
        this.tracks = [];
        this.artists = [];
        this.filteredArtists = [];
        this.selectedArtist = null;
        this.viewMode = artistViewModePreferenceService.getMode();
        this.listenersSetup = false; // 事件监听器是否已设置
        this._coverFailures = new Set(); // 记录封面获取失败的艺术家
        this._coverLoading = new Set(); // 记录正在加载封面的艺术家
        this._coverFetchingInProgress = false; // 防止重复启动封面获取
        this.coverGeneration = 0;
        this.isVisible = false;
        this.artistVirtualizer = null;
        this.trackCollectionDetail = new TrackCollectionDetail(this.element as HTMLElement, {
            onBack: () => {
                this.selectedArtist = null;
                this.renderArtistsList();
            },
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
                this.emit('trackRightClick', track, index, x, y, selectedTracks, selectedTrackItems);
            }
        });
        this.coverPreferenceUnsubscribe = trackCoverNetworkPreferenceService.onChanged((enabled) => {
            this.coverGeneration++;
            this._coverFetchingInProgress = false;
            this._coverLoading.clear();
            this._coverFailures.clear();
            if (!enabled) {
                const selectedArtistName = this.selectedArtist?.name;
                this.processArtists();
                this.selectedArtist = selectedArtistName
                    ? this.artists.find(artist => artist.name === selectedArtistName) || null
                    : null;
                if (this.isVisible) {
                    this.render();
                }
            } else if (this.isVisible && !this.selectedArtist) {
                this._startCoverFetching();
            }
        });
    }

    async show(): Promise<void> {
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
            this.tracks = pageData.tracks as Track[];
            this.artists = pageData.artists as ArtistInfo[];
            this.filteredArtists = [...this.artists];
        }

        this.render();
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
        this.trackCollectionDetail.hide();
        this.selectedArtist = null;
        if (this.container) {
            this.container.innerHTML = '';
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
        this.container = this.element;
    }

    setupAPIListeners(): void {
        // 监听音乐库更新
        this.addAPIEventListenerManaged('libraryUpdated', (tracks: Track[]) => {
            this.tracks = tracks;
            this.processArtists();
        });
    }

    processArtists(): void {
        this.artists = libraryPageDataService.buildArtists(this.tracks as any) as ArtistInfo[];
        this.filteredArtists = [...this.artists];
    }

    render(): void {
        if (!this.container) return;

        if (this.selectedArtist) {
            this.renderArtistDetail();
        } else {
            this.renderArtistsList();
        }
    }

    renderArtistsList(): void {
        this.trackCollectionDetail.hide();
        this.container.innerHTML = `
            <div class="page-content artists-page modern-artists">
                ${this.artists.length > 0 ? `
                    <!-- 现代化控制栏 -->
                    <div class="modern-controls">
                        <div class="search-container">
                            <div class="search-wrapper">
                                <svg class="search-icon" viewBox="0 0 24 24">
                                    <path d="M9.5,3A6.5,6.5 0 0,1 16,9.5C16,11.11 15.41,12.59 14.44,13.73L20.71,20L19.29,21.42L13.73,15.44C12.59,16.41 11.11,17 9.5,17A6.5,6.5 0 0,1 3,10.5A6.5,6.5 0 0,1 9.5,3M9.5,5C7,5 5,7 5,9.5C5,12 7,14 9.5,14C12,14 14,12 14,9.5C14,7 12,5 9.5,5Z"/>
                                </svg>
                                <input type="text" id="artist-search" placeholder="在星河中寻找艺术家..." class="modern-search-input">
                            </div>
                        </div>
                        <div class="view-mode-toggle">
                            <button class="mode-btn ${this.viewMode === 'grid' ? 'active' : ''}" data-view="grid" title="方格视图">
                                <svg viewBox="0 0 24 24">
                                    <path d="M3,3H10V10H3V3M14,3H21V10H14V3M3,14H10V21H3V14M14,14H21V21H14V14Z"/>
                                </svg>
                                <span>方格</span>
                            </button>
                            <button class="mode-btn ${this.viewMode === 'list' ? 'active' : ''}" data-view="list" title="列表视图">
                                <svg viewBox="0 0 24 24">
                                    <path d="M3,5H5V7H3V5M7,5H21V7H7V5M3,11H5V13H3V11M7,11H21V13H7V11M3,17H5V19H3V17M7,17H21V19H7V17Z"/>
                                </svg>
                                <span>列表</span>
                            </button>
                        </div>
                    </div>

                    <div class="artists-browser ${this.viewMode}-view">
                        <div class="artist-virtual-body"></div>
                    </div>
                ` : `
                    <div class="empty-state modern-empty">
                        <div class="empty-animation">
                            <div class="empty-stars">
                                <div class="star"></div>
                                <div class="star"></div>
                                <div class="star"></div>
                            </div>
                        </div>
                        <h3 class="empty-title">星河等待探索</h3>
                        <p class="empty-description">添加音乐，让艺术家在这片星河中闪耀</p>
                    </div>
                `}
            </div>
        `;

        this.setupEventListeners();
        this.mountArtistVirtualizer();
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

        // 视图模式切换
        this.container.querySelectorAll('.mode-btn').forEach((btn: HTMLElement) => {
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
        const sourceSnapshot: SourceRectSnapshot = {
            left: srcRect.left,
            top: srcRect.top,
            width: srcRect.width,
            height: srcRect.height,
            radius: srcRadius,
            scrollTop: scrollEl ? scrollEl.scrollTop : (window.scrollY || 0)
        };
        void sourceSnapshot;

        // 渲染艺术家详情页面
        this.selectedArtist = artist;
        this.render();

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
        return this.container.closest('.scrollable') ||
            this.container.closest('.page-content') ||
            document.documentElement;
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
        const artistCards = this.container.querySelectorAll(`[data-artist="${CSS.escape(artistName)}"]`);
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
        const artistCards = this.container.querySelectorAll(`[data-artist="${CSS.escape(artistName)}"]`);
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
        const columns = this.viewMode === 'grid'
            ? Math.max(1, Math.floor((availableWidth + 20) / 220))
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

        this.artistVirtualizer = new ElementVirtualizer({
            count: rowCount,
            estimateSize: () => this.viewMode === 'grid' ? 244 : 82,
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
        this.container.querySelectorAll('.mode-btn').forEach((btn: HTMLElement) => {
            btn.classList.toggle('active', btn.dataset.view === newMode);
        });
        this.updateArtistsDisplay();
    }

    renderArtistDetail(): void {
        if (!this.selectedArtist) return;

        const artist = this.selectedArtist;
        this.destroyArtistVirtualizer();
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
        this.selectedArtist = artist;
        this.render();
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

function getErrorMessage(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
}

export { ArtistsPage };
