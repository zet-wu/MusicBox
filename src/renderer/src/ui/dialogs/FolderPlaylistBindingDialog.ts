import type {
    FolderPlaylistBindingSummary,
    LibraryDirectoryOverview,
    PlaylistSourceBinding
} from '@api/types/electron';
import type {Playlist} from '@api/types/library';
import {libraryDataService, librarySourceManagementService} from '@/features/library/service';
import {playlistBindingService} from '@/features/playlists/service/PlaylistBindingService';
import {Component} from '@ui/base/Component';

export class FolderPlaylistBindingDialog extends Component {
    private overlay!: HTMLElement;
    private list!: HTMLElement;
    private title!: HTMLElement;
    private query!: HTMLInputElement;
    private source: LibraryDirectoryOverview | null = null;
    private playlists: Playlist[] = [];
    private busy = false;
    private listenersSetup = false;

    constructor() {
        super(null, false);
    }

    async show(source: LibraryDirectoryOverview): Promise<void> {
        this.ensureElements();
        this.source = source;
        this.title.textContent = `“${this.getDisplayName(source.path)}”绑定的歌单`;
        this.query.value = '';
        this.overlay.style.display = 'flex';
        await this.loadData();
    }

    hide(): void {
        this.overlay.style.display = 'none';
        this.source = null;
        this.playlists = [];
        this.busy = false;
    }

    private ensureElements(): void {
        if (!this.overlay) {
            const container = document.createElement('div');
            container.innerHTML = `
                <div class="modal-overlay" id="folder-playlist-binding-dialog" style="display:none;">
                    <div class="modal-dialog modal-dialog-large playlist-binding-dialog folder-playlist-binding-dialog">
                        <div class="modal-header">
                            <div>
                                <h3 class="modal-title" id="folder-binding-title">管理绑定歌单</h3>
                                <p class="playlist-binding-subtitle">绑定后，文件夹中的歌曲会持续同步到对应歌单。</p>
                            </div>
                            <button class="modal-close-btn" data-folder-binding-action="close" aria-label="关闭">×</button>
                        </div>
                        <div class="modal-body">
                            <div class="folder-binding-source-path"></div>
                            <div class="playlist-binding-toolbar">
                                <div class="search-inline folder-binding-search">
                                    <input id="folder-binding-query" type="search" placeholder="搜索歌单…" aria-label="搜索歌单">
                                </div>
                            </div>
                            <div class="playlist-binding-list" id="folder-binding-list"></div>
                            <div class="playlist-binding-empty folder-binding-search-empty" hidden>没有匹配的歌单</div>
                        </div>
                        <div class="modal-footer">
                            <button class="btn btn-secondary" data-folder-binding-action="close">完成</button>
                        </div>
                    </div>
                </div>
            `;
            this.overlay = container.firstElementChild as HTMLElement;
            document.body.appendChild(this.overlay);
            this.list = this.overlay.querySelector('#folder-binding-list') as HTMLElement;
            this.title = this.overlay.querySelector('#folder-binding-title') as HTMLElement;
            this.query = this.overlay.querySelector('#folder-binding-query') as HTMLInputElement;
        }

        if (!this.listenersSetup) {
            this.addEventListenerManaged(this.overlay, 'click', event => void this.handleClick(event));
            this.addEventListenerManaged(this.query, 'input', () => this.applySearchFilter());
            this.listenersSetup = true;
        }
    }

    private async loadData(): Promise<void> {
        if (!this.source) return;
        this.list.innerHTML = '<div class="playlist-binding-empty">正在加载歌单...</div>';
        const [directories, playlists] = await Promise.all([
            librarySourceManagementService.getDirectories(),
            libraryDataService.getPlaylists()
        ]);
        const currentSource = directories.find(candidate => candidate.id === this.source?.id);
        if (!currentSource) {
            this.list.innerHTML = '<div class="playlist-binding-empty">音乐文件夹来源已不存在</div>';
            return;
        }
        this.source = currentSource;
        this.playlists = playlists;
        const sourcePath = this.overlay.querySelector<HTMLElement>('.folder-binding-source-path');
        if (sourcePath) {
            sourcePath.textContent = currentSource.path;
            sourcePath.title = currentSource.path;
        }
        this.renderPlaylists();
    }

    private renderPlaylists(): void {
        if (!this.source) return;
        if (this.playlists.length === 0) {
            this.list.innerHTML = `
                <div class="playlist-binding-empty">
                    <strong>尚未创建歌单</strong>
                    <span>请先创建一个歌单，再从这里建立文件夹绑定。</span>
                </div>
            `;
            return;
        }

        const bindings = new Map(this.source.bindings.map(binding => [binding.playlistId, binding]));
        this.list.innerHTML = this.playlists.map(playlist => (
            this.renderPlaylist(playlist, bindings.get(playlist.id))
        )).join('');
        this.applySearchFilter();
    }

    private renderPlaylist(playlist: Playlist, binding?: FolderPlaylistBindingSummary): string {
        const modified = binding?.lastSyncAt
            ? new Date(binding.lastSyncAt).toLocaleString('zh-CN')
            : '尚未同步';
        return `
            <article class="playlist-binding-item folder-binding-playlist" data-playlist-id="${this.escapeHtml(playlist.id)}"
                     data-playlist-name="${this.escapeHtml(playlist.name.toLocaleLowerCase())}">
                <div class="playlist-binding-info">
                    <strong class="playlist-binding-path">${this.escapeHtml(playlist.name)}</strong>
                    <div class="playlist-binding-meta">
                        ${binding ? `
                            <span>${binding.availableTrackCount} 首可用歌曲</span>
                            <span>${binding.excludedTrackCount} 首已排除</span>
                            <span>上次同步：${modified}</span>
                        ` : '<span>尚未绑定此文件夹</span>'}
                    </div>
                </div>
                <div class="playlist-binding-actions">
                    ${binding ? `
                        <button class="btn btn-outline" data-folder-binding-action="restore"
                                data-binding-id="${this.escapeHtml(binding.id)}"
                                ${binding.excludedTrackCount === 0 || this.busy ? 'disabled' : ''}>恢复排除</button>
                        <button class="btn btn-outline" data-folder-binding-action="unbind-keep"
                                data-binding-id="${this.escapeHtml(binding.id)}" ${this.busy ? 'disabled' : ''}>解绑并保留</button>
                        <button class="btn btn-danger" data-folder-binding-action="unbind-remove"
                                data-binding-id="${this.escapeHtml(binding.id)}" ${this.busy ? 'disabled' : ''}>解绑并移除</button>
                    ` : `
                        <button class="btn btn-primary" data-folder-binding-action="bind"
                                ${this.busy ? 'disabled' : ''}>绑定</button>
                    `}
                </div>
            </article>
        `;
    }

    private async handleClick(event: Event): Promise<void> {
        const target = event.target instanceof Element
            ? event.target.closest<HTMLElement>('[data-folder-binding-action]')
            : null;
        if (!target || target.hasAttribute('disabled')) return;
        const action = target.dataset.folderBindingAction;
        if (action === 'close') {
            this.hide();
            return;
        }
        if (!this.source || this.busy) return;

        const item = target.closest<HTMLElement>('[data-playlist-id]');
        const playlistId = item?.dataset.playlistId;
        const bindingId = target.dataset.bindingId;
        let changed = false;
        this.busy = true;
        this.renderPlaylists();
        try {
            if (action === 'bind' && playlistId) {
                changed = await librarySourceManagementService.bindToPlaylist(this.source.id, playlistId);
            } else if (action === 'restore' && bindingId) {
                changed = await playlistBindingService.restoreExclusions(bindingId);
            } else if ((action === 'unbind-keep' || action === 'unbind-remove') && bindingId) {
                changed = await playlistBindingService.unbind(
                    {id: bindingId} as Pick<PlaylistSourceBinding, 'id'>,
                    action === 'unbind-keep' ? 'keep' : 'remove'
                );
            }
        } finally {
            this.busy = false;
        }

        if (changed) {
            const sourceId = this.source.id;
            await this.loadData();
            this.emit('bindingsChanged', sourceId);
        } else {
            this.renderPlaylists();
        }
    }

    private applySearchFilter(): void {
        const query = this.query?.value.trim().toLocaleLowerCase() || '';
        let visibleCount = 0;
        this.list?.querySelectorAll<HTMLElement>('.folder-binding-playlist').forEach(item => {
            const matches = !query || (item.dataset.playlistName || '').includes(query);
            item.style.display = matches ? '' : 'none';
            if (matches) visibleCount++;
        });
        const empty = this.overlay?.querySelector<HTMLElement>('.folder-binding-search-empty');
        if (empty) empty.hidden = visibleCount > 0 || this.playlists.length === 0;
    }

    private getDisplayName(sourcePath: string): string {
        return sourcePath.replace(/[\\/]+$/, '').split(/[\\/]/).pop() || sourcePath;
    }

    private escapeHtml(value: unknown): string {
        const div = document.createElement('div');
        div.textContent = value == null ? '' : String(value);
        return div.innerHTML;
    }
}
