export type ContentViewKey =
    | 'home-page'
    | 'playlist-detail'
    | 'playlists'
    | 'network-drive-detail'
    | 'folders'
    | 'recent'
    | 'artists'
    | 'albums'
    | 'statistics';

/**
 * 为共享内容区内的页面提供稳定且互不覆盖的挂载节点。
 */
export class ContentMountManager {
    private readonly mounts = new Map<ContentViewKey, HTMLElement>();
    private shellMount: HTMLElement | null = null;

    constructor(private readonly contentAreaSelector = '#content-area') {}

    acquire(key: ContentViewKey): HTMLElement {
        const existing = this.mounts.get(key);
        if (existing?.isConnected) {
            return existing;
        }

        const mount = document.createElement('section');
        mount.className = 'content-view-root';
        mount.dataset.contentView = key;
        mount.style.display = 'none';
        this.requireContentArea().appendChild(mount);
        this.mounts.set(key, mount);
        return mount;
    }

    activate(key: ContentViewKey): HTMLElement {
        const activeMount = this.acquire(key);
        this.mounts.forEach((mount, mountKey) => {
            mount.style.display = mountKey === key ? 'block' : 'none';
        });
        this.hideShell();
        return activeMount;
    }

    hideAllPages(): void {
        this.mounts.forEach((mount) => {
            mount.style.display = 'none';
        });
    }

    release(key: ContentViewKey): void {
        this.mounts.get(key)?.remove();
        this.mounts.delete(key);
    }

    showShell(content: string, overlay = false): HTMLElement {
        const shellMount = this.acquireShellMount();
        if (!overlay) {
            this.hideAllPages();
        }
        shellMount.classList.toggle('is-overlay', overlay);
        shellMount.innerHTML = content;
        shellMount.style.display = 'block';
        return shellMount;
    }

    hideShell(): void {
        if (!this.shellMount) return;
        this.shellMount.style.display = 'none';
        this.shellMount.classList.remove('is-overlay');
    }

    destroy(): void {
        this.mounts.forEach((mount) => mount.remove());
        this.mounts.clear();
        this.shellMount?.remove();
        this.shellMount = null;
    }

    private acquireShellMount(): HTMLElement {
        if (this.shellMount?.isConnected) {
            return this.shellMount;
        }
        this.shellMount = document.createElement('section');
        this.shellMount.className = 'content-shell-root';
        this.shellMount.style.display = 'none';
        this.requireContentArea().appendChild(this.shellMount);
        return this.shellMount;
    }

    private requireContentArea(): HTMLElement {
        const contentArea = document.querySelector<HTMLElement>(this.contentAreaSelector);
        if (!contentArea) {
            throw new Error(`Content mount root not found: ${this.contentAreaSelector}`);
        }
        return contentArea;
    }
}
