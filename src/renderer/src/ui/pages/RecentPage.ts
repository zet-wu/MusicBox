/**
 * 最近播放页组件
 */

import {coverLookupService} from "@/features/mediaAssets/service/CoverLookupService";
import {recentPlaybackHistoryService} from "@/features/playback/service/RecentPlaybackHistoryService";
import {
    flattenRecentTrackRows,
    type RecentTrack,
    type RecentTrackDisplayRow,
    type RecentTrackGroups,
    groupRecentTracksByDate
} from "@/features/playback/domain/RecentTrackGrouping";
import {trackCoverNetworkPreferenceService} from "@/features/settings/service";
import {formatTime} from "@utils/index.js";
import {Component} from "@ui/base/Component";
import {AdaptiveCollectionSurface, type CollectionSurfaceSnapshot} from '@ui/collections';
import {MainContentScrollCoordinator} from '@/app/runtime/MainContentScrollCoordinator';

class RecentPage extends Component {
    private container: Element | null;
    private recentTracks: RecentTrack[];
    private displayRows: RecentTrackDisplayRow[] = [];
    private listenersSetup: boolean;
    private historyUnsubscribe: (() => void) | null;
    isVisible: boolean;
    private viewGeneration = 0;
    private renderDirty = true;
    private readonly scroll: MainContentScrollCoordinator;
    private readonly recentSurface: AdaptiveCollectionSurface<RecentTrackDisplayRow>;
    private surfaceSnapshot: CollectionSurfaceSnapshot | null = null;
    private readonly coverLoading = new Set<string>();

    constructor(container: string | Element | null, scroll: MainContentScrollCoordinator) {
        super(container);
        this.container = this.element;
        this.scroll = scroll;
        this.recentTracks = [];
        this.listenersSetup = false; // 事件监听器是否已设置
        this.historyUnsubscribe = null;
        this.isVisible = false;
        this.recentSurface = new AdaptiveCollectionSurface<RecentTrackDisplayRow>({
            getKey: row => row.key,
            renderItem: row => this.renderDisplayRow(row)
        }, {
            onRenderedRangeChange: keys => this.loadRenderedCovers(keys),
            restoreScrollOffset: scrollTop => {
                this.scroll.remember('recent/list', scrollTop);
                return this.scroll.restore('recent/list', {
                    scrollTop,
                    whenReady: () => this.recentSurface.whenReady(),
                    isCurrent: () => this.isVisible
                });
            }
        });
        this.setupCollectionEventDelegation();
    }

    async show(): Promise<void> {
        this.viewGeneration++;
        if (!this.listenersSetup) {
            this.setupElements();
            this.setupAPIListeners();
            this.listenersSetup = true;
        }
        if (this.element) {
            (this.element as HTMLElement).style.display = 'block';
        }
        this.isVisible = true;
        this.loadPlayHistory();
        if (this.surfaceSnapshot) {
            await this.recentSurface.resume(this.surfaceSnapshot);
            this.surfaceSnapshot = null;
        }
        if (this.renderDirty || !this.container?.firstElementChild) {
            this.render();
        }
    }

    hide(): void {
        this.viewGeneration++;
        this.isVisible = false;
        if (this.container?.querySelector('.recent-surface-root')) {
            this.surfaceSnapshot = this.recentSurface.suspend();
        }
        if (this.element instanceof HTMLElement) {
            this.element.style.display = 'none';
        }
    }

    destroy(): void {
        this.historyUnsubscribe?.();
        this.historyUnsubscribe = null;
        this.recentTracks.length = 0;
        this.displayRows.length = 0;
        this.coverLoading.clear();
        this.recentSurface.destroy();
        this.listenersSetup = false;
        super.destroy();
    }

    setupElements(): void {
        this.container = this.element;
    }

    setupAPIListeners(): void {
        this.historyUnsubscribe = recentPlaybackHistoryService.subscribe(() => {
            this.loadPlayHistory();
            this.renderDirty = true;
            if (this.isVisible) {
                this.render();
            }
        });
    }

    loadPlayHistory(): void {
        this.recentTracks = recentPlaybackHistoryService.loadHistory() as RecentTrack[];
        this.displayRows = flattenRecentTrackRows(this.recentTracks);
    }

    // 清空播放历史
    clearHistory(): void {
        recentPlaybackHistoryService.clearHistory();
    }

    // 移除单个历史记录
    removeHistoryItem(trackPath: string): void {
        recentPlaybackHistoryService.removeHistoryItem(trackPath);
    }

    render(): void {
        if (!this.container) return;

        const snapshot = this.container.querySelector('.recent-surface-root')
            ? this.recentSurface.captureSnapshot()
            : null;

        this.container.innerHTML = `
            <div class="page-content recent-page">
                <!-- 页面头部 -->
                <div class="hero-section">
                    <div class="hero-content">
                        <h1 style="font-size: 36px; font-weight: 700; margin-bottom: 12px;">
                            <svg style="width: 40px; height: 40px; margin-right: 16px; vertical-align: middle;" viewBox="0 0 24 24">
                                <path fill="currentColor" d="M13,3A9,9 0 0,0 4,12H1L4.96,16.03L9,12H6A7,7 0 0,1 13,5A7,7 0 0,1 20,12A7,7 0 0,1 13,19C11.07,19 9.32,18.21 8.06,16.94L6.64,18.36C8.27,20 10.5,21 13,21A9,9 0 0,0 22,12A9,9 0 0,0 13,3Z"/>
                            </svg>
                            最近播放
                        </h1>
                        <p style="font-size: 18px; opacity: 0.9; margin-bottom: 0;">
                            共 ${this.recentTracks.length} 首歌曲 · 记录您的音乐足迹
                        </p>
                    </div>
                </div>

                ${this.recentTracks.length > 0 ? `
                    <div class="recent-actions">
                        <button class="action-btn" id="play-all-recent">
                            <svg class="icon" viewBox="0 0 24 24">
                                <path d="M8,5.14V19.14L19,12.14L8,5.14Z"/>
                            </svg>
                            播放全部
                        </button>
                        <button class="action-btn secondary" id="clear-history">
                            <svg class="icon" viewBox="0 0 24 24">
                                <path d="M19,4H15.5L14.5,3H9.5L8.5,4H5V6H19M6,19A2,2 0 0,0 8,21H16A2,2 0 0,0 18,19V7H6V19Z"/>
                            </svg>
                            清空最近播放记录
                        </button>
                    </div>

                    <div class="recent-content">
                        <div class="recent-surface-root"></div>
                    </div>
                ` : `
                    <div class="empty-state">
                        <div class="empty-icon">
                            <svg viewBox="0 0 24 24">
                                <path d="M13,3A9,9 0 0,0 4,12H1L4.96,16.03L9,12H6A7,7 0 0,1 13,5A7,7 0 0,1 20,12A7,7 0 0,1 13,19C11.07,19 9.32,18.21 8.06,16.94L6.64,18.36C8.27,20 10.5,21 13,21A9,9 0 0,0 22,12A9,9 0 0,0 13,3Z"/>
                            </svg>
                        </div>
                        <h3 class="empty-title">暂无播放历史</h3>
                        <p class="empty-description">开始播放音乐后，这里会显示您的播放历史</p>
                        <button class="primary-button" id="go-to-library">浏览音乐库</button>
                    </div>
                `}
            </div>
        `;

        this.setupPageEventListeners();
        this.updateRecentSurface();
        if (snapshot) void this.recentSurface.resume(snapshot);
        this.renderDirty = false;
    }

    groupTracksByDate(): RecentTrackGroups {
        return groupRecentTracksByDate(this.recentTracks);
    }

    private renderDisplayRow(row: RecentTrackDisplayRow): string {
        if (row.kind === 'date-header') {
            return `
                <div class="date-header recent-date-row">
                    <h3 class="date-title">${row.label}</h3>
                    <span class="date-count">${row.count} 首</span>
                </div>
            `;
        }
        return this.renderTrackItem(row.track, row.index, row.key);
    }

    renderTrackItem(track: RecentTrack, index: number, rowKey = ''): string {
        const playTime = new Date(track.playTime || Date.now());
        const timeStr = playTime.toLocaleTimeString('zh-CN', {
            hour: '2-digit',
            minute: '2-digit'
        });

        return `
            <div class="recent-track-item" data-track-path="${this.escapeHtml(track.filePath)}" data-track-row-key="${this.escapeHtml(rowKey)}" data-index="${index}">
                <div class="track-cover">
                    <img src="${this.getTrackCover(track)}" alt="封面" loading="lazy" onerror="this.src='assets/images/default-cover.svg'">
                    <div class="track-overlay">
                        <button class="play-btn" data-action="play">
                            <svg viewBox="0 0 24 24">
                                <path d="M8,5.14V19.14L19,12.14L8,5.14Z"/>
                            </svg>
                        </button>
                    </div>
                </div>
                <div class="track-info">
                    <div class="track-title" title="${track.title}">${track.title}</div>
                    <div class="track-meta">
                        <span class="track-artist" title="${track.artist}">${track.artist}</span>
                        <span class="track-separator">•</span>
                        <span class="track-album" title="${track.album}">${track.album}</span>
                    </div>
                </div>
                <div class="track-time">
                    <span class="play-time">${timeStr}</span>
                    <span class="track-duration">${formatTime(track.duration || 0)}</span>
                </div>
                <div class="track-actions">
                    <button class="action-btn small" data-action="add" title="添加到播放列表">
                        <svg viewBox="0 0 24 24">
                            <path d="M19,13H13V19H11V13H5V11H11V5H13V11H19V13Z"/>
                        </svg>
                    </button>
                    <button class="action-btn small" data-action="remove">
                        <svg viewBox="0 0 24 24">
                            <path d="M19,6.41L17.59,5L12,10.59L6.41,5L5,6.41L10.59,12L5,17.59L6.41,19L12,13.41L17.59,19L19,17.59L13.41,12L19,6.41Z"/>
                        </svg>
                    </button>
                </div>
            </div>
        `;
    }

    getTrackCover(track: RecentTrack): string {
        // 优先使用已缓存的封面
        if (track.cover && typeof track.cover === 'string') {
            return track.cover;
        }

        return 'assets/images/default-cover.svg';
    }

    async loadTrackCoverAsync(track: RecentTrack): Promise<void> {
        const viewGeneration = this.viewGeneration;
        try {
            const coverResult = await coverLookupService.getCover(
                track.title,
                track.artist,
                track.album,
                track.filePath,
                false,
                {allowNetwork: trackCoverNetworkPreferenceService.isEnabled()}
            );

            if (coverResult.success && coverResult.imageUrl && typeof coverResult.imageUrl === 'string') {
                if (!this.isVisible || viewGeneration !== this.viewGeneration) return;
                let coverUrl = coverResult.imageUrl;
                if (coverResult.type === 'local-file' && coverResult.filePath) {
                    if (!coverUrl.startsWith('file://')) {
                        coverUrl = coverResult.filePath.replace(/\\/g, '/');
                        if (!coverUrl.startsWith('/')) {
                            coverUrl = '/' + coverUrl;
                        }
                        coverUrl = `file://${coverUrl}`;
                    }
                }
                track.cover = coverUrl;
                const row = this.displayRows.find(candidate => candidate.kind === 'track' && candidate.track === track);
                if (row) this.recentSurface.invalidateItem(row.key);
            } else {
                console.warn(`⚠️ RecentPage: 封面加载失败 - ${track.title}:`, coverResult.error || '未知错误');
            }
        } catch (error) {
            console.warn('RecentPage: 加载封面失败:', error);
        }
    }

    private loadRenderedCovers(keys: Array<string | number>): void {
        keys.forEach(key => {
            const row = this.displayRows.find(candidate => candidate.key === key);
            if (row?.kind !== 'track' || row.track.cover || this.coverLoading.has(row.key)) return;
            this.coverLoading.add(row.key);
            this.requestIdleCallbackManaged(() => {
                void this.loadTrackCoverAsync(row.track).finally(() => this.coverLoading.delete(row.key));
            }, {timeout: 100});
        });
    }

    private updateRecentSurface(): void {
        if (!(this.container instanceof HTMLElement)) return;
        const root = this.container.querySelector<HTMLElement>('.recent-surface-root');
        const scrollElement = document.querySelector<HTMLElement>('.main-content');
        if (!root || !scrollElement) return;
        this.recentSurface.mount(root, scrollElement);
        this.recentSurface.update(
            this.displayRows,
            {mode: 'list', estimateRowSize: 84, overscan: 8},
            this.recentTracks.length
        );
    }

    private setupCollectionEventDelegation(): void {
        if (!(this.container instanceof HTMLElement)) return;
        this.addEventListenerManaged(this.container, 'click', event => {
            const target = event.target instanceof Element ? event.target : null;
            const item = target?.closest<HTMLElement>('.recent-track-item');
            const row = this.findTrackRow(item?.dataset.trackRowKey);
            if (!row) return;
            const action = target?.closest<HTMLElement>('[data-action]')?.dataset.action;
            if (action === 'play') {
                this.emit('trackPlayed', row.track, row.index, this.recentTracks);
            } else if (action === 'add') {
                this.emit('addToPlaylist', row.track);
            } else if (action === 'remove') {
                void this.confirmRemoveTrack(row);
            }
        });
        this.addEventListenerManaged(this.container, 'dblclick', event => {
            const target = event.target instanceof Element ? event.target : null;
            if (target?.closest('[data-action]')) return;
            const item = target?.closest<HTMLElement>('.recent-track-item');
            const row = this.findTrackRow(item?.dataset.trackRowKey);
            if (row) this.emit('trackPlayed', row.track, row.index, this.recentTracks);
        });
    }

    private findTrackRow(key: string | undefined): Extract<RecentTrackDisplayRow, {kind: 'track'}> | null {
        if (!key) return null;
        const row = this.displayRows.find(candidate => candidate.key === key);
        return row?.kind === 'track' ? row : null;
    }

    private async confirmRemoveTrack(row: Extract<RecentTrackDisplayRow, {kind: 'track'}>): Promise<void> {
        if (await recentPlaybackHistoryService.confirmRemoveHistoryItem(row.track.title)) {
            this.removeHistoryItem(row.track.filePath);
        }
    }

    private escapeHtml(value: unknown): string {
        const element = document.createElement('div');
        element.textContent = value == null ? '' : String(value);
        return element.innerHTML;
    }

    setupPageEventListeners(): void {
        if (!this.container) return;

        // 播放全部按钮
        const playAllBtn = this.container.querySelector('#play-all-recent');
        if (playAllBtn) {
            playAllBtn.addEventListener('click', () => {
                if (this.recentTracks.length > 0) {
                    this.emit('playAll', this.recentTracks);
                }
            });
        }

        // 清空历史按钮
        const clearBtn = this.container.querySelector('#clear-history');
        if (clearBtn) {
            clearBtn.addEventListener('click', async () => {
                const confirmed = await recentPlaybackHistoryService.confirmClearHistory();

                if (confirmed) {
                    this.clearHistory();
                }
            });
        }

        // 去音乐库按钮
        const goToLibraryBtn = this.container.querySelector('#go-to-library');
        if (goToLibraryBtn) {
            goToLibraryBtn.addEventListener('click', () => {
                this.emit('viewChange', 'library');
            });
        }

    }
}

export { RecentPage };
