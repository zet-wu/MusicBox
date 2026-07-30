/**
 * 播放列表组件
 */

import {formatTime} from "@utils/index.js";
import {Component} from "@ui/base/Component";
import type {QueueEntry} from "@api/types/playback";
import type {Track} from "@api/types/track";

interface PlaylistTrackEventPayload {
    track: Track;
    index: number;
    queueId?: string;
}

interface PlaylistTrackRemovedPayload extends PlaylistTrackEventPayload {
    wasCurrentTrack: boolean;
}

class Playlist extends Component {
    isVisible: boolean;
    tracks: Track[];
    entries: QueueEntry[];
    currentQueueId: string | null;
    currentTrackIndex: number;
    draggedQueueId: string | null;
    listenersSetup: boolean;
    panel!: HTMLElement;
    closeBtn!: HTMLElement;
    clearBtn!: HTMLElement;
    countEl!: HTMLElement;
    tracksContainer!: HTMLElement;

    constructor(element: HTMLElement | null) {
        super(element);
        this.element = element;
        this.isVisible = false;
        this.tracks = [];
        this.entries = [];
        this.currentQueueId = null;
        this.currentTrackIndex = -1;
        this.draggedQueueId = null;
        this.listenersSetup = false; // 事件监听器是否已设置

        this.setupElements();
    }

    show(): void {
        if (!this.listenersSetup) {
            this.setupEventListeners();
            this.listenersSetup = true;
        }
        this.isVisible = true;
        this.panel.style.display = 'flex';
        this.panel.classList.add('show');

        // 自动滚动到当前播放的歌曲
        this.scrollToCurrentTrack();
    }

    hide(): void {
        this.isVisible = false;
        this.panel.classList.remove('show');
        setTimeout(() => {
            if (!this.isVisible) {
                this.panel.style.display = 'none';
            }
        }, 300);
    }

    destroy(): void {
        // 清理播放列表数据
        this.tracks = [];
        this.entries = [];
        this.currentQueueId = null;
        this.listenersSetup = false;

        // 清理DOM内容
        if (this.tracksContainer) {
            this.tracksContainer.innerHTML = '';
        }

        super.destroy();
    }

    setupElements(): void {
        const element = this.element as HTMLElement;
        this.panel = element;
        this.closeBtn = element.querySelector('#playlist-close') as HTMLElement;
        this.clearBtn = element.querySelector('#playlist-clear') as HTMLElement;
        this.countEl = element.querySelector('#playlist-count') as HTMLElement;
        this.tracksContainer = element.querySelector('#playlist-tracks') as HTMLElement;
    }

    setupEventListeners(): void {
        this.addEventListenerManaged(this.closeBtn, 'click', () => {
            this.hide();
        });

        this.addEventListenerManaged(this.clearBtn, 'click', () => {
            this.clear();
        });

        this.addEventListenerManaged(this.tracksContainer, 'click', (e: Event) => {
            const target = e.target as HTMLElement | null;
            const removeBtn = target?.closest<HTMLElement>('.playlist-track-remove');
            if (removeBtn) {
                const index = Number.parseInt(removeBtn.dataset.index || '-1', 10);
                this.removeTrack(index);
                return;
            }

            const trackEl = target?.closest<HTMLElement>('.playlist-track');
            if (trackEl) {
                const index = Number.parseInt(trackEl.dataset.index || '-1', 10);
                const payload = this.createTrackPayload(index);
                if (payload) {
                    this.emit('trackSelected', payload);
                }
            }
        });

        this.addEventListenerManaged(this.tracksContainer, 'dblclick', (e: Event) => {
            const target = e.target as HTMLElement | null;
            if (target?.closest('.playlist-track-remove')) {
                return;
            }

            const trackEl = target?.closest<HTMLElement>('.playlist-track');
            if (trackEl) {
                const index = Number.parseInt(trackEl.dataset.index || '-1', 10);
                const payload = this.createTrackPayload(index);
                if (payload) {
                    this.emit('trackPlayed', payload);
                }
            }
        });

        this.addEventListenerManaged(this.tracksContainer, 'dragstart', (event: Event) => {
            const dragEvent = event as DragEvent;
            const row = dragEvent.target instanceof Element
                ? dragEvent.target.closest<HTMLElement>('.playlist-track')
                : null;
            if (!row?.dataset.queueId || !dragEvent.dataTransfer) {
                return;
            }

            this.draggedQueueId = row.dataset.queueId;
            dragEvent.dataTransfer.effectAllowed = 'move';
            dragEvent.dataTransfer.setData('text/plain', row.dataset.queueId);
            row.classList.add('dragging');
            dragEvent.stopPropagation();
        });

        this.addEventListenerManaged(this.tracksContainer, 'dragover', (event: Event) => {
            const dragEvent = event as DragEvent;
            if (
                this.draggedQueueId
                && dragEvent.target instanceof Element
                && dragEvent.target.closest('.playlist-track')
            ) {
                dragEvent.preventDefault();
                dragEvent.stopPropagation();
                if (dragEvent.dataTransfer) {
                    dragEvent.dataTransfer.dropEffect = 'move';
                }
            }
        });

        this.addEventListenerManaged(this.tracksContainer, 'drop', (event: Event) => {
            const dragEvent = event as DragEvent;
            const targetRow = dragEvent.target instanceof Element
                ? dragEvent.target.closest<HTMLElement>('.playlist-track')
                : null;
            const queueId = this.draggedQueueId || dragEvent.dataTransfer?.getData('text/plain');
            if (!targetRow || !queueId) {
                return;
            }

            dragEvent.preventDefault();
            dragEvent.stopPropagation();
            const targetIndex = Number.parseInt(targetRow.dataset.index || '-1', 10);
            if (targetIndex >= 0) {
                this.emit('queueReordered', {queueId, targetIndex});
            }
        });

        this.addEventListenerManaged(this.tracksContainer, 'dragend', () => {
            this.tracksContainer.querySelector('.playlist-track.dragging')?.classList.remove('dragging');
            this.draggedQueueId = null;
        });

        // Close on outside click
        this.addEventListenerManaged(document, 'click', (e: Event) => {
            const target = e.target as HTMLElement | null;
            if (this.isVisible && target && !this.panel.contains(target) && !target.closest('#playlist-btn')) {
                this.hide();
            }
        });

        // Close on escape key
        this.addEventListenerManaged(document, 'keydown', (e: Event) => {
            if ((e as KeyboardEvent).key === 'Escape' && this.isVisible) {
                this.hide();
            }
        });
    }

    toggle(): void {
        if (this.isVisible) {
            this.hide();
        } else {
            this.show();
        }
    }

    removeTrack(index: number): void {
        if (index >= 0 && index < this.tracks.length) {
            const track = this.tracks[index];
            const wasCurrentTrack = index === this.currentTrackIndex;

            const payload: PlaylistTrackRemovedPayload = {track, index, wasCurrentTrack};
            this.emit('trackRemoved', payload);
            console.log('🎵 Playlist: 从播放列表移除歌曲:', track.title, '是否为当前播放:', wasCurrentTrack);
        }
    }

    clear(): void {
        this.emit('playlistCleared');
    }

    setTracks(tracks: Track[], currentIndex = -1): void {
        this.tracks = [...tracks];
        this.entries = tracks.map((track, index) => ({
            queueId: track.fileId || track.filePath || `legacy-${index}`,
            track
        }));
        this.currentQueueId = this.entries[currentIndex]?.queueId ?? null;
        this.currentTrackIndex = currentIndex;
        this.render();
        console.log('🎵 Playlist: 设置播放列表:', tracks.length, '首歌曲');
    }

    setEntries(entries: QueueEntry[], currentQueueId: string | null): void {
        this.entries = entries.map((entry) => ({...entry}));
        this.tracks = this.entries.map((entry) => entry.track);
        this.currentQueueId = currentQueueId;
        this.currentTrackIndex = this.entries.findIndex((entry) => entry.queueId === currentQueueId);
        this.render();
    }

    setCurrentTrack(index: number): void {
        this.currentTrackIndex = index;
        this.currentQueueId = this.entries[index]?.queueId ?? null;
        this.render();

        // 如果播放列表可见，滚动到当前歌曲
        if (this.isVisible) {
            this.scrollToCurrentTrack();
        }
    }

    scrollToCurrentTrack(): void {
        if (this.currentTrackIndex >= 0 && this.currentTrackIndex < this.tracks.length) {
            setTimeout(() => {
                const currentTrackEl = this.tracksContainer.querySelector<HTMLElement>(`[data-index="${this.currentTrackIndex}"]`);
                if (currentTrackEl) {
                    currentTrackEl.scrollIntoView({
                        behavior: 'smooth',
                        block: 'center'
                    });
                }
            }, 100); // 等待渲染完成
        }
    }

    render(): void {
        this.countEl.textContent = `${this.tracks.length} 首歌曲`;

        if (this.tracks.length === 0) {
            this.tracksContainer.innerHTML = `
                <div class="playlist-empty">
                    <svg class="icon" viewBox="0 0 24 24">
                        <path d="M12,3V13.55C11.41,13.21 10.73,13 10,13A3,3 0 0,0 7,16A3,3 0 0,0 10,19A3,3 0 0,0 13,16V7H19V5H12V3Z"/>
                    </svg>
                    <p>播放列表为空</p>
                </div>
            `;
            return;
        }

        this.tracksContainer.innerHTML = this.tracks.map((track, index) => {
            const isCurrent = index === this.currentTrackIndex;
            const trackNumber = isCurrent ?
                `<svg class="icon playing-icon" viewBox="0 0 24 24">
                    <path d="M8,5.14V19.14L19,12.14L8,5.14Z"/>
                </svg>` :
                (index + 1);

            return `
                <div class="playlist-track ${isCurrent ? 'current playing' : ''}" data-index="${index}" data-queue-id="${this.entries[index]?.queueId || ''}" draggable="true">
                    <div class="playlist-track-drag" title="拖动调整顺序">⋮⋮</div>
                    <div class="playlist-track-number">${trackNumber}</div>
                    <div class="playlist-track-info">
                        <div class="playlist-track-title">${track.title || 'Unknown Title'}</div>
                        <div class="playlist-track-artist">${track.artist || 'Unknown Artist'}</div>
                    </div>
                    <div class="playlist-track-duration">${formatTime(track.duration || 0)}</div>
                    <button class="playlist-track-remove" data-index="${index}">
                        <svg class="icon" viewBox="0 0 24 24">
                            <path d="M19,6.41L17.59,5L12,10.59L6.41,5L5,6.41L10.59,12L5,17.59L6.41,19L12,13.41L17.59,19L19,17.59L13.41,12L19,6.41Z"/>
                        </svg>
                    </button>
                </div>
            `;
        }).join('');
    }

    createTrackPayload(index: number): PlaylistTrackEventPayload | null {
        const track = this.tracks[index];
        if (!track) {
            return null;
        }
        return {track, index, queueId: this.entries[index]?.queueId};
    }
}

export { Playlist };
