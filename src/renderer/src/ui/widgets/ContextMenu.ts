/**
 * 菜单组件
 */

import {Component} from "@ui/base/Component";
import type {Playlist, Track} from "@api/types/library";

export interface ContextMenuDisplayOptions {
    collectionActionsOnly?: boolean;
    playlist?: Playlist;
}

class ContextMenu extends Component {
    declare element: HTMLElement;
    private isVisible: boolean;
    private currentTrack: Track | null;
    private currentIndex: number;
    private selectedTracks: Set<number> | null;
    private selectedTrackItems: Track[];
    private currentPlaylist: Playlist | null;
    private listenersSetup: boolean;
    private menu!: HTMLElement;
    private playItem!: HTMLElement;
    private playNextItem!: HTMLElement;
    private playNextLabel!: HTMLElement;
    private addToPlaylistItem!: HTMLElement;
    private addToPlaylistLabel!: HTMLElement;
    private addToCustomPlaylistItem!: HTMLElement;
    private addToCustomPlaylistLabel!: HTMLElement;
    private editInfoItem!: HTMLElement;
    private deleteItem!: HTMLElement;
    private batchDeleteItem!: HTMLElement;
    private batchDeleteLabel!: HTMLElement;
    private detailsDivider!: HTMLElement;
    private editInfoLabel!: HTMLElement;
    private deleteLabel!: HTMLElement;

    constructor(element: HTMLElement | null) {
        super(element);
        this.element = element as HTMLElement;
        this.isVisible = false;
        this.currentTrack = null;
        this.currentIndex = -1;
        this.selectedTracks = null;
        this.selectedTrackItems = [];
        this.currentPlaylist = null;
        this.listenersSetup = false;
    }

    show(
        x: number,
        y: number,
        track: Track | null,
        index: number,
        selectedTracks: Set<number> | null = null,
        selectedTrackItems: Track[] = track ? [track] : [],
        options: ContextMenuDisplayOptions = {}
    ): void {
        if (!this.listenersSetup) {
            this.setupElements();
            this.setupEventListeners();
            this.listenersSetup = true;
        }

        this.currentTrack = track;
        this.currentIndex = index;
        this.selectedTracks = selectedTracks;
        this.selectedTrackItems = [...selectedTrackItems];
        this.currentPlaylist = options.playlist || null;
        this.isVisible = true;

        // 多选模式：隐藏单曲操作，显示批量删除
        const isMulti = selectedTracks && selectedTracks.size > 1;
        const collectionActionsOnly = options.collectionActionsOnly === true;
        const hasCollectionTracks = this.selectedTrackItems.length > 0;
        const isPlaylistCollection = Boolean(this.currentPlaylist);
        this.playItem.style.display = isMulti || collectionActionsOnly ? 'none' : '';
        this.playNextItem.style.display = collectionActionsOnly && !hasCollectionTracks ? 'none' : '';
        this.addToPlaylistItem.style.display = collectionActionsOnly && !hasCollectionTracks ? 'none' : '';
        this.addToCustomPlaylistItem.style.display = collectionActionsOnly && !hasCollectionTracks ? 'none' : '';
        this.editInfoItem.style.display = isPlaylistCollection || (!isMulti && !collectionActionsOnly) ? '' : 'none';
        this.deleteItem.style.display = isPlaylistCollection || (!isMulti && !collectionActionsOnly) ? '' : 'none';
        this.batchDeleteItem.style.display = isMulti && !collectionActionsOnly ? '' : 'none';
        this.detailsDivider.style.display = isPlaylistCollection || !collectionActionsOnly ? '' : 'none';
        this.editInfoLabel.textContent = isPlaylistCollection ? '编辑歌单信息' : '编辑歌曲信息';
        this.deleteLabel.textContent = isPlaylistCollection ? '删除歌单' : '删除';
        this.deleteItem.classList.toggle('danger', isPlaylistCollection);
        if (isMulti) {
            this.batchDeleteLabel.textContent = `批量删除 (${selectedTracks.size} 首)`;
        }
        const selectionCount = this.selectedTrackItems.length;
        this.playNextLabel.textContent = selectionCount > 1 ? `下 ${selectionCount} 首播放` : '下一首播放';
        this.addToPlaylistLabel.textContent = selectionCount > 1
            ? `添加到播放列表 (${selectionCount} 首)`
            : '添加到播放列表';
        this.addToCustomPlaylistLabel.textContent = selectionCount > 1
            ? `添加到歌单 (${selectionCount} 首)`
            : '添加到歌单';

        // 菜单位置
        this.menu.style.left = `${x}px`;
        this.menu.style.top = `${y}px`;
        this.menu.style.display = 'block';

        // 若菜单离开屏幕，则调整位置
        const rect = this.menu.getBoundingClientRect();
        const windowWidth = window.innerWidth;
        const windowHeight = window.innerHeight;

        if (rect.right > windowWidth) {
            this.menu.style.left = `${windowWidth - rect.width - 10}px`;
        }
        if (rect.bottom > windowHeight) {
            this.menu.style.top = `${windowHeight - rect.height - 10}px`;
        }
    }

    hide(): void {
        this.isVisible = false;
        this.menu.style.display = 'none';
        this.currentTrack = null;
        this.currentIndex = -1;
        this.selectedTracks = null;
        this.selectedTrackItems = [];
        this.currentPlaylist = null;
    }

    destroy(): void {
        this.listenersSetup = false;
        super.destroy();
    }

    setupElements(): void {
        this.menu = this.element;
        this.playItem = this.element.querySelector('#context-play') as HTMLElement;
        this.playNextItem = this.element.querySelector('#context-play-next') as HTMLElement;
        this.playNextLabel = this.element.querySelector('#context-play-next-label') as HTMLElement;
        this.addToPlaylistItem = this.element.querySelector('#context-add-to-playlist') as HTMLElement;
        this.addToPlaylistLabel = this.element.querySelector('#context-add-to-playlist-label') as HTMLElement;
        this.addToCustomPlaylistItem = this.element.querySelector('#context-add-to-custom-playlist') as HTMLElement;
        this.addToCustomPlaylistLabel = this.element.querySelector(
            '#context-add-to-custom-playlist-label'
        ) as HTMLElement;
        this.editInfoItem = this.element.querySelector('#context-edit-info') as HTMLElement;
        this.deleteItem = this.element.querySelector('#context-delete') as HTMLElement;
        this.batchDeleteItem = this.element.querySelector('#context-batch-delete') as HTMLElement;
        this.batchDeleteLabel = this.element.querySelector('#context-batch-delete-label') as HTMLElement;
        this.detailsDivider = this.element.querySelector('.context-menu-divider') as HTMLElement;
        this.editInfoLabel = this.editInfoItem.querySelector('span') as HTMLElement;
        this.deleteLabel = this.deleteItem.querySelector('span') as HTMLElement;
    }

    setupEventListeners(): void {
        this.addEventListenerManaged(this.playItem, 'click', () => {
            this.emit('play', {track: this.currentTrack, index: this.currentIndex});
            this.hide();
        });

        this.addEventListenerManaged(this.addToPlaylistItem, 'click', () => {
            this.emit('addToPlaylist', {
                track: this.currentTrack,
                tracks: this.selectedTrackItems,
                index: this.currentIndex
            });
            this.hide();
        });

        this.addEventListenerManaged(this.playNextItem, 'click', () => {
            this.emit('playNext', {
                track: this.currentTrack,
                tracks: this.selectedTrackItems,
                index: this.currentIndex
            });
            this.hide();
        });

        this.addEventListenerManaged(this.addToCustomPlaylistItem, 'click', () => {
            this.emit('addToCustomPlaylist', {
                track: this.currentTrack,
                tracks: this.selectedTrackItems,
                index: this.currentIndex
            });
            this.hide();
        });

        this.addEventListenerManaged(this.editInfoItem, 'click', () => {
            if (this.currentPlaylist) {
                this.emit('editPlaylist', this.currentPlaylist);
            } else {
                this.emit('editInfo', {track: this.currentTrack, index: this.currentIndex});
            }
            this.hide();
        });

        this.addEventListenerManaged(this.deleteItem, 'click', () => {
            if (this.currentPlaylist) {
                this.emit('deletePlaylist', this.currentPlaylist);
            } else {
                this.emit('delete', {track: this.currentTrack, index: this.currentIndex});
            }
            this.hide();
        });

        this.addEventListenerManaged(this.batchDeleteItem, 'click', () => {
            this.emit('batchDelete', {selectedTracks: this.selectedTracks, track: this.currentTrack, index: this.currentIndex});
            this.hide();
        });

        // 点击其他区域
        this.addEventListenerManaged(document, 'click', (e: Event) => {
            if (this.isVisible && e.target instanceof Node && !this.menu.contains(e.target)) {
                this.hide();
            }
        });

        // ESC
        this.addEventListenerManaged(document, 'keydown', (e: Event) => {
            const event = e as KeyboardEvent;
            if (event.key === 'Escape' && this.isVisible) {
                this.hide();
            }
        });
    }
}

export { ContextMenu };
