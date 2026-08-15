import {LyricPlayer, type LyricLineMouseEvent} from '@applemusic-like-lyrics/core';
import '@applemusic-like-lyrics/core/style.css';
import type {LyricsDocument} from '../domain/types';

interface AmllPlayerPort extends EventTarget {
    getElement(): HTMLElement;
    setLyricLines(lines: LyricsDocument['render']['lines'], initialTime?: number): void;
    setCurrentTime(time: number, isSeek?: boolean): void;
    pause(): void;
    resume(): void;
    update(delta?: number): void;
    dispose(): void;
}

export interface AmllLyricsViewOptions {
    container: HTMLElement;
    isVisible: () => boolean;
    seek: (timeSeconds: number) => Promise<void>;
    createPlayer?: () => AmllPlayerPort;
}

export class AmllLyricsView {
    private readonly container: HTMLElement;
    private readonly isVisible: () => boolean;
    private readonly seek: (timeSeconds: number) => Promise<void>;
    private readonly player: AmllPlayerPort;
    private readonly stateElement: HTMLElement;
    private animationFrame: number | null = null;
    private lastFrameTime = performance.now();

    constructor(options: AmllLyricsViewOptions) {
        this.container = options.container;
        this.isVisible = options.isVisible;
        this.seek = options.seek;
        this.player = options.createPlayer?.() ?? new LyricPlayer();
        this.stateElement = document.createElement('div');
        this.stateElement.className = 'amll-lyrics-state';

        this.container.textContent = '';
        this.container.classList.add('amll-lyrics-host');
        this.container.append(this.player.getElement(), this.stateElement);
        this.player.addEventListener('line-click', this.handleLineClick);
        this.startAnimationLoop();
    }

    setDocument(document: LyricsDocument, initialTimeSeconds = 0): void {
        this.hideState();
        this.player.setLyricLines(document.render.lines, initialTimeSeconds * 1000);
        this.player.update(0);
    }

    showLoading(): void {
        this.player.setLyricLines([]);
        this.showState('正在加载歌词...');
    }

    showNoLyrics(): void {
        this.player.setLyricLines([]);
        this.showState('暂无歌词', '请欣赏音乐');
    }

    handlePlaybackPositionChanged(positionSeconds: number, isSeek = false): void {
        if (!this.isVisible()) return;
        this.player.setCurrentTime(positionSeconds * 1000, isSeek);
    }

    setPlaying(isPlaying: boolean): void {
        if (isPlaying) this.player.resume();
        else this.player.pause();
    }

    reset(): void {
        this.player.setLyricLines([]);
        this.showNoLyrics();
    }

    destroy(): void {
        if (this.animationFrame !== null) cancelAnimationFrame(this.animationFrame);
        this.animationFrame = null;
        this.player.removeEventListener('line-click', this.handleLineClick);
        this.player.dispose();
        this.container.classList.remove('amll-lyrics-host');
        this.container.textContent = '';
    }

    private readonly handleLineClick = (event: Event): void => {
        const lineEvent = event as LyricLineMouseEvent;
        const line = lineEvent.line?.getLine();
        if (line) void this.seek(line.startTime / 1000);
    };

    private startAnimationLoop(): void {
        const update = (timestamp: number): void => {
            const delta = Math.min(100, timestamp - this.lastFrameTime);
            this.lastFrameTime = timestamp;
            if (this.isVisible()) this.player.update(delta);
            this.animationFrame = requestAnimationFrame(update);
        };
        this.animationFrame = requestAnimationFrame(update);
    }

    private showState(title: string, subtitle?: string): void {
        this.stateElement.replaceChildren();
        const titleElement = document.createElement('p');
        titleElement.textContent = title;
        this.stateElement.appendChild(titleElement);
        if (subtitle) {
            const subtitleElement = document.createElement('p');
            subtitleElement.textContent = subtitle;
            this.stateElement.appendChild(subtitleElement);
        }
        this.stateElement.hidden = false;
        this.player.getElement().hidden = true;
    }

    private hideState(): void {
        this.stateElement.hidden = true;
        this.player.getElement().hidden = false;
    }
}
