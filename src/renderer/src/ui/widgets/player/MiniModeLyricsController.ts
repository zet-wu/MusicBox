import type {AmllLyricLine} from '@applemusic-like-lyrics/ttml';
import {getLyricsService} from '@/features/lyrics/service/defaultLyricsServices';
import {playbackUiStateService} from '@/features/playback/service/PlaybackUiStateService';
import type {Unsubscribe} from '@/features/playback/PlaybackStore';
import type {Track} from '@api/types/track';

class MiniModeLyricsController {
    private readonly rootElement: Element | null;
    private active = false;
    private currentLyricIndex = -1;
    private lyrics: AmllLyricLine[] = [];
    private positionUnsubscribe: Unsubscribe | null = null;
    private loadController: AbortController | null = null;

    constructor(rootElement: Element | null) {
        this.rootElement = rootElement;
    }

    start(): void {
        this.active = true;
        this.unsubscribePositionChanges();
        this.positionUnsubscribe = playbackUiStateService.on('positionChanged', position => {
            this.updateLyricIndex(position * 1000);
        });
    }

    stop(): void {
        this.active = false;
        this.unsubscribePositionChanges();
        this.loadController?.abort();
        this.loadController = null;
        this.resetLyrics(false);
        this.removeElement();
    }

    clear(): void {
        this.resetLyrics(true);
    }

    removeElement(): void {
        document.querySelectorAll('.mini-mode-lyrics').forEach(element => element.remove());
    }

    async loadTrackLyrics(track: Track | null, currentTime: number): Promise<void> {
        if (!track?.title || !track.artist) {
            this.resetLyrics(true);
            return;
        }
        this.loadController?.abort();
        const controller = new AbortController();
        this.loadController = controller;
        try {
            const result = await getLyricsService().load(track, controller.signal);
            if (controller.signal.aborted || !result.document?.render.lines.length) return;
            this.lyrics = result.document.render.lines.filter(line => !line.isBG);
            this.currentLyricIndex = findLine(this.lyrics, currentTime * 1000);
            this.updateLyrics();
        } catch (error) {
            if (!controller.signal.aborted) {
                console.error('❌ MiniModeLyricsController: 迷你模式歌词加载失败:', error);
                this.resetLyrics(true);
            }
        }
    }

    private updateLyricIndex(currentTimeMs: number): void {
        if (this.lyrics.length === 0) return;
        const index = findLine(this.lyrics, currentTimeMs);
        if (index !== this.currentLyricIndex) {
            this.currentLyricIndex = index;
            this.updateLyrics();
        }
    }

    private updateLyrics(): void {
        if (!this.active) return;
        const line = this.lyrics[this.currentLyricIndex];
        const element = this.getOrCreateLyricsElement();
        if (!element) return;
        element.textContent = line ? line.words.map(word => word.word).join('') : '暂无歌词';
    }

    private resetLyrics(renderEmptyState: boolean): void {
        this.lyrics = [];
        this.currentLyricIndex = -1;
        if (renderEmptyState) this.updateLyrics();
    }

    private unsubscribePositionChanges(): void {
        this.positionUnsubscribe?.();
        this.positionUnsubscribe = null;
    }

    private getOrCreateLyricsElement(): HTMLElement | null {
        let element = document.querySelector<HTMLElement>('.mini-mode-lyrics');
        if (element) return element;
        element = document.createElement('div');
        element.className = 'mini-mode-lyrics';
        const controls = this.rootElement?.querySelector('.controls');
        if (!controls) return null;
        controls.appendChild(element);
        return element;
    }
}

function findLine(lines: AmllLyricLine[], currentTimeMs: number): number {
    let active = 0;
    for (let index = 0; index < lines.length; index += 1) {
        if (lines[index].startTime > currentTimeMs) break;
        active = index;
    }
    return active;
}

export {MiniModeLyricsController};
