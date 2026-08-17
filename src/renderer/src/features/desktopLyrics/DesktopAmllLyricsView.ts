import {LyricPlayer} from '@applemusic-like-lyrics/core';
import '@applemusic-like-lyrics/core/style.css';
import {projectLyricsForDesktop} from './DesktopLyricsProjection';
import type {DesktopLyricLine} from './DesktopLyricsTypes';

interface DesktopAmllGroup {
    element: HTMLElement;
    isActive: boolean;
}

interface DesktopAmllPlayerPort {
    currentLyricGroups?: DesktopAmllGroup[];
    getElement(): HTMLElement;
    setLyricLines(lines: DesktopLyricLine[], initialTime?: number): void;
    setCurrentTime(time: number, isSeek?: boolean): void;
    pause(): void;
    resume(): void;
    update(delta?: number): void;
    dispose(): void;
    setEnableBlur?(enable: boolean): void;
    setEnableScale?(enable?: boolean): void;
    setAlignPosition?(position: number): void;
}

interface DesktopAmllLyricsViewOptions {
    container: HTMLElement;
    createPlayer?: () => DesktopAmllPlayerPort;
}

export class DesktopAmllLyricsView {
    private readonly player: DesktopAmllPlayerPort;
    private readonly stateElement: HTMLElement;
    private animationFrame: number | null = null;
    private lastFrameTime = performance.now();
    private currentPositionSeconds = 0;
    private timelinePreviewDeltaMs = 0;
    private isPlaying = false;

    constructor(private readonly options: DesktopAmllLyricsViewOptions) {
        this.player = options.createPlayer?.() ?? new LyricPlayer();
        this.player.setEnableBlur?.(false);
        this.player.setEnableScale?.(false);
        this.player.setAlignPosition?.(0.5);
        this.player.pause();

        this.stateElement = document.createElement('div');
        this.stateElement.className = 'desktop-lyrics-state';
        this.stateElement.textContent = '暂无歌词';
        this.options.container.replaceChildren(this.player.getElement(), this.stateElement);
        this.player.getElement().hidden = true;
    }

    updateLyrics(lines: DesktopLyricLine[] | unknown): void {
        if (!Array.isArray(lines)) {
            this.reset();
            return;
        }
        this.timelinePreviewDeltaMs = 0;
        const projected = projectLyricsForDesktop(lines as DesktopLyricLine[]);
        this.player.setLyricLines(projected, this.getEffectiveTimeMs());
        this.player.update(0);
        this.decorateLineState();
        this.stateElement.hidden = projected.length > 0;
        this.player.getElement().hidden = projected.length === 0;
    }

    updatePosition(positionSeconds: number): number | null {
        if (!Number.isFinite(positionSeconds)) return null;
        this.currentPositionSeconds = positionSeconds;
        this.applyEffectiveTime();
        return positionSeconds;
    }

    updateTimelinePreview(deltaMs: number): number | null {
        if (!Number.isFinite(deltaMs)) return null;
        this.timelinePreviewDeltaMs = Math.trunc(deltaMs);
        this.applyEffectiveTime(true);
        return this.timelinePreviewDeltaMs;
    }

    setPlaying(isPlaying: boolean): void {
        if (this.isPlaying === isPlaying) return;
        this.isPlaying = isPlaying;
        if (isPlaying) {
            this.applyEffectiveTime();
            this.player.resume();
            this.startAnimationLoop();
            return;
        }
        this.stopAnimationLoop();
        this.player.pause();
    }

    reset(): void {
        this.currentPositionSeconds = 0;
        this.timelinePreviewDeltaMs = 0;
        this.player.setLyricLines([]);
        this.stateElement.hidden = false;
        this.player.getElement().hidden = true;
    }

    destroy(): void {
        this.stopAnimationLoop();
        this.player.dispose();
        this.options.container.replaceChildren();
    }

    private startAnimationLoop(): void {
        if (this.animationFrame !== null) return;
        this.lastFrameTime = performance.now();
        const update = (timestamp: number): void => {
            const delta = Math.min(100, timestamp - this.lastFrameTime);
            this.lastFrameTime = timestamp;
            this.player.update(delta);
            this.decorateLineState();
            this.animationFrame = requestAnimationFrame(update);
        };
        this.animationFrame = requestAnimationFrame(update);
    }

    private stopAnimationLoop(): void {
        if (this.animationFrame !== null) cancelAnimationFrame(this.animationFrame);
        this.animationFrame = null;
    }

    private applyEffectiveTime(isSeek = false): void {
        this.player.setCurrentTime(this.getEffectiveTimeMs(), isSeek);
        this.player.update(0);
        this.decorateLineState();
    }

    private getEffectiveTimeMs(): number {
        return Math.max(0, this.currentPositionSeconds * 1000 - this.timelinePreviewDeltaMs);
    }

    private decorateLineState(): void {
        for (const group of this.player.currentLyricGroups ?? []) {
            group.element.dataset.desktopActive = String(group.isActive);
        }
    }
}

export type {DesktopAmllPlayerPort};
