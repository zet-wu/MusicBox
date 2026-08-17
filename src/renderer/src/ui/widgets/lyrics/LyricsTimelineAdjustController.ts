import type {LyricsDocument} from '@/features/lyrics/domain/types';
import {constrainTimelineDelta} from '@/features/lyrics/format/TtmlTimelineEditor';
import {getLyricsService} from '@/features/lyrics/service/defaultLyricsServices';
import {toTrackLyricsQuery, type LyricsService} from '@/features/lyrics/service/LyricsService';
import {desktopLyricsService} from '@/features/desktopLyrics/service/DesktopLyricsService';
import type {AddLyricsDomListener} from './LyricsDomEvents';
import type {LyricsTrack} from './LyricsTypes';

const INITIAL_REPEAT_DELAY_MS = 400;
const REPEAT_INTERVAL_MS = 170;

interface LyricsTimelineAdjustElements {
    container: HTMLElement;
    earlierButton: HTMLButtonElement;
    laterButton: HTMLButtonElement;
}

interface TimelinePreviewClearOptions {
    refresh?: boolean;
}

interface LyricsTimelineAdjustControllerOptions {
    elements: LyricsTimelineAdjustElements;
    addDomListener: AddLyricsDomListener;
    getCurrentTrack: () => LyricsTrack | null;
    service?: LyricsService;
    dispatchDocumentApplied?: (trackId: string, document: LyricsDocument) => void;
    syncDesktopLyrics?: (document: LyricsDocument) => Promise<void>;
    setTimelinePreviewDelta?: (deltaMs: number) => void;
    clearTimelinePreview?: (options?: TimelinePreviewClearOptions) => void;
}

interface TimelineGesture {
    pointerId: number;
    direction: -1 | 1;
    startedAt: number;
    totalDeltaMs: number;
    trackId: string;
    timer: ReturnType<typeof setTimeout> | null;
    button: HTMLButtonElement;
}

export class LyricsTimelineAdjustController {
    private readonly service: LyricsService;
    private readonly dispatchDocumentApplied: (trackId: string, document: LyricsDocument) => void;
    private readonly syncDesktopLyrics: (document: LyricsDocument) => Promise<void>;
    private readonly setTimelinePreviewDelta: (deltaMs: number) => void;
    private readonly clearTimelinePreview: (options?: TimelinePreviewClearOptions) => void;
    private editableDocument: LyricsDocument | null = null;
    private gesture: TimelineGesture | null = null;
    private isCommitting = false;
    private suppressPointerClick = false;
    private suppressClickTimer: ReturnType<typeof setTimeout> | null = null;

    constructor(private readonly options: LyricsTimelineAdjustControllerOptions) {
        this.service = options.service ?? getLyricsService();
        this.dispatchDocumentApplied = options.dispatchDocumentApplied ?? ((trackId, document) => {
            window.dispatchEvent(new CustomEvent('lyrics:document-applied', {
                detail: {trackId, document}
            }));
        });
        this.syncDesktopLyrics = options.syncDesktopLyrics ?? (async document => {
            await desktopLyricsService.syncLyrics(document.render.lines);
        });
        this.setTimelinePreviewDelta = options.setTimelinePreviewDelta ?? (() => undefined);
        this.clearTimelinePreview = options.clearTimelinePreview ?? (() => undefined);
        this.updateAvailability();
    }

    bind(): void {
        this.bindButton(this.options.elements.earlierButton, -1);
        this.bindButton(this.options.elements.laterButton, 1);
        if (typeof window !== 'undefined') {
            this.options.addDomListener(window, 'blur', () => this.cancelGesture());
        }
    }

    setEditableDocument(document: LyricsDocument | null): void {
        this.cancelGesture();
        this.editableDocument = document?.render.lines.length ? document : null;
        this.updateAvailability();
    }

    destroy(): void {
        this.cancelGesture();
        if (this.suppressClickTimer !== null) clearTimeout(this.suppressClickTimer);
        this.suppressClickTimer = null;
    }

    private bindButton(button: HTMLButtonElement, direction: -1 | 1): void {
        this.options.addDomListener(button, 'pointerdown', event => {
            this.beginGesture(event as PointerEvent, button, direction);
        });
        this.options.addDomListener(button, 'pointerup', event => {
            this.finishGesture(event as PointerEvent);
        });
        this.options.addDomListener(button, 'pointercancel', () => this.cancelGesture());
        this.options.addDomListener(button, 'click', event => {
            this.handleClick(event as MouseEvent, direction);
        });
    }

    private beginGesture(event: PointerEvent, button: HTMLButtonElement, direction: -1 | 1): void {
        if (this.gesture || this.isCommitting || !this.editableDocument) return;
        if (event.button !== undefined && event.button !== 0) return;
        const track = this.options.getCurrentTrack();
        if (!track) return;

        const pointerId = event.pointerId ?? 0;
        this.gesture = {
            pointerId,
            direction,
            startedAt: Date.now(),
            totalDeltaMs: 0,
            trackId: toTrackLyricsQuery(track).trackId,
            timer: null,
            button
        };
        button.setPointerCapture?.(pointerId);
        event.preventDefault();
        this.applyPreviewStep(100);
        this.scheduleRepeat(INITIAL_REPEAT_DELAY_MS);
    }

    private finishGesture(event: PointerEvent): void {
        const gesture = this.gesture;
        if (!gesture || (event.pointerId ?? 0) !== gesture.pointerId) return;
        const totalDeltaMs = gesture.totalDeltaMs;
        const trackId = gesture.trackId;
        this.releaseGestureCapture(gesture);
        this.clearGestureTimer(gesture);
        this.gesture = null;
        this.suppressPointerClick = true;
        if (this.suppressClickTimer !== null) clearTimeout(this.suppressClickTimer);
        this.suppressClickTimer = setTimeout(() => {
            this.suppressPointerClick = false;
            this.suppressClickTimer = null;
        }, 0);
        void this.commit(totalDeltaMs, trackId);
    }

    private handleClick(event: MouseEvent, direction: -1 | 1): void {
        if (event.detail !== 0) {
            if (this.suppressPointerClick) {
                this.suppressPointerClick = false;
                if (this.suppressClickTimer !== null) clearTimeout(this.suppressClickTimer);
                this.suppressClickTimer = null;
            }
            return;
        }
        if (this.isCommitting || !this.editableDocument) return;
        const track = this.options.getCurrentTrack();
        if (!track) return;
        const deltaMs = constrainTimelineDelta(this.editableDocument.ttml, direction * 100);
        void this.commit(deltaMs, toTrackLyricsQuery(track).trackId);
    }

    private applyPreviewStep(stepMagnitudeMs: number): void {
        const gesture = this.gesture;
        if (!gesture || !this.editableDocument) return;
        const requestedDeltaMs = gesture.totalDeltaMs + gesture.direction * stepMagnitudeMs;
        gesture.totalDeltaMs = constrainTimelineDelta(this.editableDocument.ttml, requestedDeltaMs);
        this.setTimelinePreviewDelta(gesture.totalDeltaMs);
    }

    private scheduleRepeat(delayMs: number): void {
        const gesture = this.gesture;
        if (!gesture) return;
        gesture.timer = setTimeout(() => {
            const currentGesture = this.gesture;
            if (!currentGesture) return;
            this.applyPreviewStep(this.getStepMagnitude(Date.now() - currentGesture.startedAt));
            this.scheduleRepeat(REPEAT_INTERVAL_MS);
        }, delayMs);
    }

    private getStepMagnitude(elapsedMs: number): number {
        if (elapsedMs < 1200) return 100;
        if (elapsedMs < 2400) return 200;
        if (elapsedMs < 4000) return 500;
        return 1000;
    }

    private cancelGesture(): void {
        const gesture = this.gesture;
        if (!gesture) return;
        this.releaseGestureCapture(gesture);
        this.clearGestureTimer(gesture);
        this.gesture = null;
        this.clearTimelinePreview();
    }

    private releaseGestureCapture(gesture: TimelineGesture): void {
        if (gesture.button.hasPointerCapture?.(gesture.pointerId)) {
            gesture.button.releasePointerCapture?.(gesture.pointerId);
        }
    }

    private clearGestureTimer(gesture: TimelineGesture): void {
        if (gesture.timer !== null) clearTimeout(gesture.timer);
        gesture.timer = null;
    }

    private async commit(deltaMs: number, trackId: string): Promise<void> {
        if (this.isCommitting || deltaMs === 0) {
            this.clearTimelinePreview();
            return;
        }
        const track = this.options.getCurrentTrack();
        if (!track) {
            this.clearTimelinePreview();
            return;
        }
        const query = toTrackLyricsQuery(track);
        if (query.trackId !== trackId) {
            this.clearTimelinePreview();
            return;
        }

        this.isCommitting = true;
        this.updateAvailability();
        try {
            const result = await this.service.shiftCanonicalTimeline(query, deltaMs);
            if (!result.document) throw new Error(result.error ?? '歌词时间轴调整失败');

            this.clearTimelinePreview({refresh: false});
            this.dispatchDocumentApplied(query.trackId, result.document);
            const currentTrack = this.options.getCurrentTrack();
            if (currentTrack && toTrackLyricsQuery(currentTrack).trackId === query.trackId) {
                await this.syncDesktopLyrics(result.document);
            }
        } catch (error) {
            this.clearTimelinePreview();
            console.error('❌ Lyrics: 时间轴调整失败', error);
        } finally {
            this.isCommitting = false;
            this.updateAvailability();
        }
    }

    private updateAvailability(): void {
        const unavailable = !this.editableDocument;
        this.options.elements.container.hidden = unavailable;
        this.options.elements.earlierButton.disabled = unavailable || this.isCommitting;
        this.options.elements.laterButton.disabled = unavailable || this.isCommitting;
    }
}

export type {LyricsTimelineAdjustElements, TimelinePreviewClearOptions};
