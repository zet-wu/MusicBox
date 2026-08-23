import type {Track} from '@api/types/track';
import {appNotificationService} from '@/features/appShell/service';
import {toTrackLyricsQuery} from '@/features/lyrics/service/LyricsService';
import {getLyricsSourcePicker} from '@/features/lyrics/ui/LyricsSourcePicker';
import {lyricsGateway} from '@/infrastructure/electron';
import {buildTtmlExportName} from './LyricsExportFileName';

interface LyricsContextMenuDependencies {
    readCanonical: typeof lyricsGateway.readCanonical;
    exportTtml: typeof lyricsGateway.exportTtml;
    openSourcePicker: (track: Track) => Promise<void>;
    showSuccess: (message: string) => void;
    showError: (message: string) => void;
}

const MENU_MARGIN = 8;

export class LyricsContextMenu {
    private readonly element: HTMLElement;
    private readonly selectButton: HTMLButtonElement;
    private readonly saveButton: HTMLButtonElement;
    private readonly dependencies: LyricsContextMenuDependencies;
    private currentTrack: Track | null = null;
    private currentTrackId: string | null = null;
    private canonicalTtml: string | null = null;
    private generation = 0;

    constructor(dependencies: Partial<LyricsContextMenuDependencies> = {}) {
        this.dependencies = {
            readCanonical: lyricsGateway.readCanonical.bind(lyricsGateway),
            exportTtml: lyricsGateway.exportTtml.bind(lyricsGateway),
            openSourcePicker: track => getLyricsSourcePicker().open(track),
            showSuccess: message => appNotificationService.showSuccess(message),
            showError: message => appNotificationService.showError(message),
            ...dependencies
        };
        this.element = document.createElement('div');
        this.element.className = 'context-menu lyrics-context-menu';
        this.element.hidden = true;
        this.element.setAttribute('role', 'menu');
        this.selectButton = this.createMenuButton('选择歌词', 'select');
        this.saveButton = this.createMenuButton('保存当前 TTML 歌词', 'save');
        this.element.append(this.selectButton, this.saveButton);
        document.body.appendChild(this.element);

        this.selectButton.addEventListener('click', this.handleSelect);
        this.saveButton.addEventListener('click', this.handleSave);
        document.addEventListener('pointerdown', this.handlePointerDown);
        document.addEventListener('keydown', this.handleKeyDown);
    }

    show(x: number, y: number, track: Track): void {
        const generation = ++this.generation;
        const trackId = toTrackLyricsQuery(track).trackId;
        this.currentTrack = track;
        this.currentTrackId = trackId;
        this.canonicalTtml = null;
        this.saveButton.disabled = true;
        this.element.hidden = false;
        this.positionWithinWindow(x, y);

        void this.dependencies.readCanonical(trackId).then(result => {
            if (generation !== this.generation || trackId !== this.currentTrackId) return;
            const ttml = result.success && typeof result.ttml === 'string' && result.ttml.trim()
                ? result.ttml
                : null;
            this.canonicalTtml = ttml;
            this.saveButton.disabled = !ttml;
        }).catch(() => undefined);
    }

    hide(): void {
        this.generation += 1;
        this.element.hidden = true;
        this.currentTrack = null;
        this.currentTrackId = null;
        this.canonicalTtml = null;
        this.saveButton.disabled = true;
    }

    destroy(): void {
        this.hide();
        this.selectButton.removeEventListener('click', this.handleSelect);
        this.saveButton.removeEventListener('click', this.handleSave);
        document.removeEventListener('pointerdown', this.handlePointerDown);
        document.removeEventListener('keydown', this.handleKeyDown);
        this.element.remove();
    }

    private createMenuButton(label: string, action: string): HTMLButtonElement {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'context-menu-item';
        button.dataset.action = action;
        button.setAttribute('role', 'menuitem');
        const text = document.createElement('span');
        text.textContent = label;
        button.appendChild(text);
        return button;
    }

    private positionWithinWindow(x: number, y: number): void {
        this.element.style.left = `${Math.max(MENU_MARGIN, x)}px`;
        this.element.style.top = `${Math.max(MENU_MARGIN, y)}px`;
        const rect = this.element.getBoundingClientRect();
        const maxLeft = Math.max(MENU_MARGIN, window.innerWidth - rect.width - MENU_MARGIN);
        const maxTop = Math.max(MENU_MARGIN, window.innerHeight - rect.height - MENU_MARGIN);
        this.element.style.left = `${Math.min(Math.max(MENU_MARGIN, x), maxLeft)}px`;
        this.element.style.top = `${Math.min(Math.max(MENU_MARGIN, y), maxTop)}px`;
    }

    private readonly handleSelect = (): void => {
        const track = this.currentTrack;
        this.hide();
        if (track) void this.dependencies.openSourcePicker(track);
    };

    private readonly handleSave = (): void => {
        const track = this.currentTrack;
        const content = this.canonicalTtml;
        if (!track || !content || this.saveButton.disabled) return;
        this.hide();
        void this.dependencies.exportTtml(buildTtmlExportName(track), content).then(result => {
            if (result.success) {
                this.dependencies.showSuccess('TTML 歌词已保存');
            } else if (!result.cancelled) {
                this.dependencies.showError(result.error || '保存 TTML 歌词失败');
            }
        }).catch(error => {
            this.dependencies.showError(error instanceof Error ? error.message : '保存 TTML 歌词失败');
        });
    };

    private readonly handlePointerDown = (event: PointerEvent): void => {
        if (!this.element.hidden && event.target instanceof Node && !this.element.contains(event.target)) {
            this.hide();
        }
    };

    private readonly handleKeyDown = (event: KeyboardEvent): void => {
        if (!this.element.hidden && event.key === 'Escape') this.hide();
    };
}
