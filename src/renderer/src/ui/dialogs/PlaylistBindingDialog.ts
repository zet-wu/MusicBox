import type {PlaylistSourceBinding} from '@api/types/electron';
import type {Playlist} from '@api/types/library';
import {playlistBindingService} from '@/features/playlists/service/PlaylistBindingService';
import {Component} from '@ui/base/Component';

export class PlaylistBindingDialog extends Component {
    private overlay!: HTMLElement;
    private list!: HTMLElement;
    private title!: HTMLElement;
    private currentPlaylist: Playlist | null = null;
    private bindings: PlaylistSourceBinding[] = [];
    private listenersSetup = false;

    constructor() {
        super(null, false);
    }

    async show(playlist: Playlist): Promise<void> {
        this.ensureElements();
        this.currentPlaylist = playlist;
        this.title.textContent = `管理“${playlist.name}”的绑定文件夹`;
        this.overlay.style.display = 'flex';
        await this.loadBindings();
    }

    hide(): void {
        this.overlay.style.display = 'none';
        this.currentPlaylist = null;
        this.bindings = [];
    }

    private ensureElements(): void {
        if (!this.overlay) {
            const container = document.createElement('div');
            container.innerHTML = `
                <div id="playlist-binding-dialog" class="modal-overlay" style="display: none;">
                    <div class="modal-dialog modal-dialog-large playlist-binding-dialog">
                        <div class="modal-header">
                            <div>
                                <h3 class="modal-title" id="playlist-binding-title">管理绑定文件夹</h3>
                                <p class="playlist-binding-subtitle">
                                    绑定目录会成为持续音乐库来源，新发现的歌曲将自动加入此歌单。
                                </p>
                            </div>
                            <button class="modal-close-btn" data-binding-action="close" aria-label="关闭">×</button>
                        </div>
                        <div class="modal-body">
                            <div class="playlist-binding-toolbar">
                                <button class="btn btn-primary" data-binding-action="add">绑定文件夹</button>
                            </div>
                            <div class="playlist-binding-list" id="playlist-binding-list"></div>
                        </div>
                        <div class="modal-footer">
                            <button class="btn btn-secondary" data-binding-action="close">完成</button>
                        </div>
                    </div>
                </div>
            `;
            this.overlay = container.firstElementChild as HTMLElement;
            document.body.appendChild(this.overlay);
            this.list = this.overlay.querySelector('#playlist-binding-list') as HTMLElement;
            this.title = this.overlay.querySelector('#playlist-binding-title') as HTMLElement;
        }

        if (!this.listenersSetup) {
            this.addEventListenerManaged(this.overlay, 'click', event => {
                void this.handleClick(event);
            });
            this.listenersSetup = true;
        }
    }

    private async loadBindings(): Promise<void> {
        if (!this.currentPlaylist) return;
        this.list.innerHTML = '<div class="playlist-binding-empty">正在加载绑定...</div>';
        this.bindings = await playlistBindingService.getBindings(this.currentPlaylist.id);
        this.renderBindings();
    }

    private renderBindings(): void {
        if (this.bindings.length === 0) {
            this.list.innerHTML = `
                <div class="playlist-binding-empty">
                    <strong>尚未绑定文件夹</strong>
                    <span>绑定后，此目录及子目录中的歌曲会持续同步到歌单。</span>
                </div>
            `;
            return;
        }

        this.list.innerHTML = this.bindings.map(binding => {
            const lastScan = binding.lastSyncAt
                ? new Date(binding.lastSyncAt).toLocaleString('zh-CN')
                : '尚未完成扫描';
            const sourcePath = binding.source?.path || '来源不可用';
            return `
                <article class="playlist-binding-item" data-binding-id="${binding.id}">
                    <div class="playlist-binding-info">
                        <strong class="playlist-binding-path" title="${this.escapeHtml(sourcePath)}">
                            ${this.escapeHtml(sourcePath)}
                        </strong>
                        <div class="playlist-binding-meta">
                            <span>${binding.availableTrackCount || 0} 首可用歌曲</span>
                            <span>${binding.excludedTrackCount || 0} 首已排除</span>
                            <span>上次同步：${lastScan}</span>
                        </div>
                    </div>
                    <div class="playlist-binding-actions">
                        <button class="btn btn-outline" data-binding-action="rescan">重新扫描</button>
                        <button class="btn btn-outline" data-binding-action="restore"
                            ${(binding.excludedTrackCount || 0) === 0 ? 'disabled' : ''}>恢复排除</button>
                        <button class="btn btn-outline" data-binding-action="unbind-keep">解绑并保留</button>
                        <button class="btn btn-danger" data-binding-action="unbind-remove">解绑并移除</button>
                    </div>
                </article>
            `;
        }).join('');
    }

    private async handleClick(event: Event): Promise<void> {
        const target = event.target instanceof Element
            ? event.target.closest<HTMLElement>('[data-binding-action]')
            : null;
        if (!target || target.hasAttribute('disabled')) return;
        const action = target.dataset.bindingAction;

        if (action === 'close') {
            this.hide();
            return;
        }
        if (action === 'add') {
            if (this.currentPlaylist && await playlistBindingService.addBindings(this.currentPlaylist.id)) {
                await this.handleChanged();
            }
            return;
        }

        const item = target.closest<HTMLElement>('[data-binding-id]');
        const binding = this.bindings.find(candidate => candidate.id === item?.dataset.bindingId);
        if (!binding) return;

        let changed = false;
        if (action === 'rescan') changed = await playlistBindingService.rescan(binding.id);
        if (action === 'restore') changed = await playlistBindingService.restoreExclusions(binding.id);
        if (action === 'unbind-keep') changed = await playlistBindingService.unbind(binding, 'keep');
        if (action === 'unbind-remove') changed = await playlistBindingService.unbind(binding, 'remove');
        if (changed) await this.handleChanged();
    }

    private async handleChanged(): Promise<void> {
        await this.loadBindings();
        this.emit('bindingsChanged', this.currentPlaylist);
    }

    private escapeHtml(text: string): string {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
}
