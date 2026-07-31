import type {Track} from '@api/types/library';
import {libraryDataService} from '@/features/library/service/LibraryDataService';
import {playlistCoverActionService, type PlaylistCoverActionResult} from '@/features/playlists/service/PlaylistCoverActionService';
import {Component} from '@ui/base/Component';

type CoverTrack = Track & {
    fileId?: string;
};

const COVER_PREVIEW_TIMEOUT_MS = 10_000;

class CoverPreviewTimeoutError extends Error {}

export class PlaylistCoverTrackDialog extends Component {
    private overlay!: HTMLElement;
    private list!: HTMLElement;
    private confirmButton!: HTMLButtonElement;
    private tracks: CoverTrack[] = [];
    private playlistId = '';
    private selectedTrackId: string | null = null;
    private observer: IntersectionObserver | null = null;
    private previewUrls = new Map<string, string>();
    private resolveResult: ((result: PlaylistCoverActionResult | null) => void) | null = null;
    private generation = 0;

    constructor() {
        super(null, false);
        this.ensureElements();
    }

    show(playlistId: string, tracks: CoverTrack[]): Promise<PlaylistCoverActionResult | null> {
        this.hide();
        this.generation += 1;
        this.playlistId = playlistId;
        this.tracks = tracks.filter(track => Boolean(track.fileId && track.filePath));
        this.selectedTrackId = null;
        this.confirmButton.disabled = true;
        this.overlay.style.display = 'flex';
        this.renderTracks();
        this.observePreviews(this.generation);
        return new Promise(resolve => {
            this.resolveResult = resolve;
        });
    }

    hide(result: PlaylistCoverActionResult | null = null): void {
        this.generation += 1;
        this.observer?.disconnect();
        this.observer = null;
        this.clearPreviewUrls();
        if (this.overlay) this.overlay.style.display = 'none';
        const resolve = this.resolveResult;
        this.resolveResult = null;
        resolve?.(result);
    }

    destroy(): void {
        this.hide();
        this.overlay.remove();
        super.destroy();
    }

    private ensureElements(): void {
        const container = document.createElement('div');
        container.innerHTML = `
            <div class="modal-overlay playlist-cover-track-overlay" style="display: none;">
                <div class="modal-dialog modal-dialog-large playlist-cover-track-dialog">
                    <div class="modal-header">
                        <div>
                            <h3 class="modal-title">从歌曲选择封面</h3>
                            <p class="playlist-cover-track-subtitle">仅使用音频文件中真实的内嵌封面，并保存为独立快照。</p>
                        </div>
                        <button class="modal-close-btn" data-cover-dialog-action="close" aria-label="关闭">×</button>
                    </div>
                    <div class="modal-body">
                        <div class="playlist-cover-track-list"></div>
                    </div>
                    <div class="modal-footer">
                        <button class="btn btn-secondary" data-cover-dialog-action="close">取消</button>
                        <button class="btn btn-primary" data-cover-dialog-action="confirm" disabled>使用此封面</button>
                    </div>
                </div>
            </div>
        `;
        this.overlay = container.firstElementChild as HTMLElement;
        document.body.appendChild(this.overlay);
        this.list = this.overlay.querySelector('.playlist-cover-track-list') as HTMLElement;
        this.confirmButton = this.overlay.querySelector('[data-cover-dialog-action="confirm"]') as HTMLButtonElement;
        this.addEventListenerManaged(this.overlay, 'click', event => {
            void this.handleClick(event);
        });
    }

    private renderTracks(): void {
        if (this.tracks.length === 0) {
            this.list.innerHTML = `
                <div class="playlist-cover-track-empty">
                    <strong>歌单中没有可选择的歌曲</strong>
                    <span>请先向歌单添加歌曲。</span>
                </div>
            `;
            return;
        }

        this.list.innerHTML = this.tracks.map(track => `
            <button class="playlist-cover-track-item" type="button"
                    data-cover-track-id="${this.escapeHtml(track.fileId || '')}" disabled>
                <span class="playlist-cover-track-preview">
                    <span class="playlist-cover-track-placeholder">♪</span>
                    <img alt="" hidden>
                </span>
                <span class="playlist-cover-track-info">
                    <strong>${this.escapeHtml(track.title || track.fileName || '未知歌曲')}</strong>
                    <span>${this.escapeHtml(track.artist || '未知艺术家')}</span>
                </span>
                <span class="playlist-cover-track-status">正在检查内嵌封面…</span>
            </button>
        `).join('');
    }

    private observePreviews(generation: number): void {
        this.observer = new IntersectionObserver(entries => {
            for (const entry of entries) {
                if (!entry.isIntersecting) continue;
                const item = entry.target as HTMLButtonElement;
                this.observer?.unobserve(item);
                void this.loadPreview(item, generation);
            }
        }, {root: this.list.closest('.modal-body'), rootMargin: '120px'});

        this.list.querySelectorAll<HTMLElement>('[data-cover-track-id]').forEach(item => {
            this.observer?.observe(item);
        });
    }

    private async loadPreview(item: HTMLButtonElement, generation: number): Promise<void> {
        const trackId = item.dataset.coverTrackId;
        const track = this.tracks.find(candidate => candidate.fileId === trackId);
        if (!track?.filePath || !trackId) return;

        const status = item.querySelector<HTMLElement>('.playlist-cover-track-status');
        try {
            const cover = await this.getTrackCoverWithTimeout(track.filePath);
            if (generation !== this.generation) return;
            if (!cover?.data) {
                if (status) status.textContent = '无内嵌封面';
                return;
            }
            const bytes = cover.data instanceof Uint8Array ? cover.data : new Uint8Array(cover.data);
            const imageBuffer = new ArrayBuffer(bytes.byteLength);
            new Uint8Array(imageBuffer).set(bytes);
            const url = URL.createObjectURL(new Blob([imageBuffer], {type: cover.format || 'application/octet-stream'}));
            this.manageObjectUrl(url);
            this.previewUrls.set(trackId, url);
            const image = item.querySelector<HTMLImageElement>('img');
            if (image) {
                image.src = url;
                image.hidden = false;
            }
            item.querySelector<HTMLElement>('.playlist-cover-track-placeholder')?.setAttribute('hidden', '');
            if (status) status.textContent = '可用';
            item.disabled = false;
        } catch (error) {
            console.warn('⚠️ 检查歌曲内嵌封面失败:', error);
            if (generation !== this.generation) return;
            if (status) {
                status.textContent = error instanceof CoverPreviewTimeoutError ? '检测超时' : '检测失败';
            }
        }
    }

    private async getTrackCoverWithTimeout(filePath: string) {
        let timeoutId: ReturnType<typeof setTimeout> | null = null;
        try {
            return await Promise.race([
                libraryDataService.getTrackCover(filePath),
                new Promise<never>((_resolve, reject) => {
                    timeoutId = setTimeout(() => {
                        reject(new CoverPreviewTimeoutError('内嵌封面检测超时'));
                    }, COVER_PREVIEW_TIMEOUT_MS);
                })
            ]);
        } finally {
            if (timeoutId) clearTimeout(timeoutId);
        }
    }

    private async handleClick(event: Event): Promise<void> {
        const target = event.target instanceof Element ? event.target : null;
        const action = target?.closest<HTMLElement>('[data-cover-dialog-action]')?.dataset.coverDialogAction;
        if (action === 'close') {
            this.hide();
            return;
        }
        if (action === 'confirm') {
            await this.confirmSelection();
            return;
        }

        const item = target?.closest<HTMLButtonElement>('[data-cover-track-id]');
        if (!item || item.disabled || !item.dataset.coverTrackId) return;
        this.selectedTrackId = item.dataset.coverTrackId;
        this.list.querySelectorAll('.playlist-cover-track-item').forEach(element => {
            element.classList.toggle('selected', element === item);
        });
        this.confirmButton.disabled = false;
    }

    private async confirmSelection(): Promise<void> {
        if (!this.selectedTrackId || this.confirmButton.disabled) return;
        this.confirmButton.disabled = true;
        this.confirmButton.textContent = '正在保存…';
        const result = await playlistCoverActionService.setCoverFromTrack(this.playlistId, this.selectedTrackId);
        this.confirmButton.textContent = '使用此封面';
        if (result.changed) {
            this.hide(result);
            return;
        }
        this.confirmButton.disabled = false;
    }

    private clearPreviewUrls(): void {
        for (const url of this.previewUrls.values()) this.revokeObjectUrlManaged(url);
        this.previewUrls.clear();
    }

    private escapeHtml(text: string): string {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
}
