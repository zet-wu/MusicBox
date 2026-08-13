import {formatTime} from "@/utils";
import {playbackUiStateService} from "@/features/playback/service/PlaybackUiStateService";
import type {Track} from "@api/types/track";
import type {AddLyricsDomListener} from "@ui/widgets/lyrics/LyricsDomEvents";

interface LyricsProgressElements {
    progressBar: HTMLElement;
    progressFill: HTMLElement;
    progressHandle: HTMLElement;
    currentTimeEl: HTMLElement;
    durationEl: HTMLElement;
}

interface LyricsProgressControllerOptions {
    elements: LyricsProgressElements;
    addDomListener: AddLyricsDomListener;
    getCurrentTrack: () => Track | null;
}

class LyricsProgressController {
    private readonly elements: LyricsProgressElements;
    private readonly addDomListener: AddLyricsDomListener;
    private readonly getCurrentTrack: () => Track | null;
    private dragging = false;
    private dragPercentage = 0;
    private bound = false;

    constructor(options: LyricsProgressControllerOptions) {
        this.elements = options.elements;
        this.addDomListener = options.addDomListener;
        this.getCurrentTrack = options.getCurrentTrack;
    }

    bind(): void {
        if (this.bound) return;

        this.addDomListener(this.elements.progressBar, 'pointerdown', (event) => {
            this.startProgressDrag(event as PointerEvent);
        });

        this.addDomListener(document, 'pointermove', (event) => {
            if (this.dragging) {
                this.updateProgressDrag(event as PointerEvent);
            }
        });

        this.addDomListener(document, 'pointerup', () => {
            if (this.dragging) {
                void this.endProgressDrag();
            }
        });

        this.addDomListener(document, 'pointercancel', () => {
            this.cancelProgressDrag();
        });

        this.bound = true;
    }

    updateDuration(duration: number): void {
        if (duration > 0) {
            this.elements.durationEl.textContent = formatTime(duration);
        }
    }

    updateProgress(currentTime: number, duration: number): void {
        if (this.dragging) {
            this.elements.durationEl.textContent = formatTime(duration);
            return;
        }

        if (duration > 0) {
            const percentage = (currentTime / duration) * 100;
            this.setProgressPercentage(percentage);
        }

        this.elements.currentTimeEl.textContent = formatTime(currentTime);
        this.elements.durationEl.textContent = formatTime(duration);
    }

    updateTrackDuration(duration: number | undefined): void {
        if (duration) {
            this.elements.durationEl.textContent = formatTime(duration);
        }
    }

    private startProgressDrag(event: PointerEvent): void {
        const duration = this.getPlaybackDuration();
        if (!this.getCurrentTrack() || duration <= 0) return;

        this.dragging = true;
        this.elements.progressBar.classList.add('dragging');
        this.elements.progressBar.setPointerCapture?.(event.pointerId);
        this.updateProgressDrag(event);
    }

    private updateProgressDrag(event: PointerEvent): void {
        const duration = this.getPlaybackDuration();
        if (!this.dragging || !this.getCurrentTrack() || duration <= 0) return;

        const rect = this.elements.progressBar.getBoundingClientRect();
        const dragX = Math.max(0, Math.min(rect.width, event.clientX - rect.left));
        const percentage = dragX / rect.width;
        this.dragPercentage = percentage;
        this.setProgressPercentage(percentage * 100);
        this.elements.currentTimeEl.textContent = formatTime(percentage * duration);
    }

    private async endProgressDrag(): Promise<void> {
        if (!this.dragging) return;

        this.dragging = false;
        this.elements.progressBar.classList.remove('dragging');

        const duration = this.getPlaybackDuration();
        await playbackUiStateService.seek(this.dragPercentage * (duration || 0));
    }

    private cancelProgressDrag(): void {
        if (!this.dragging) return;
        this.dragging = false;
        this.elements.progressBar.classList.remove('dragging');
    }

    private getPlaybackDuration(): number {
        const currentTrack = this.getCurrentTrack();
        return currentTrack?.duration || playbackUiStateService.getState().duration;
    }

    private setProgressPercentage(percentage: number): void {
        const clampedPercentage = Math.max(0, Math.min(100, percentage));
        this.elements.progressFill.style.width = `${clampedPercentage}%`;
        this.elements.progressHandle.style.left = `${clampedPercentage}%`;
    }
}

export {LyricsProgressController};
export type {LyricsProgressElements};
