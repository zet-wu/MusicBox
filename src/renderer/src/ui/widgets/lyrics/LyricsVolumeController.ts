import {playbackUiStateService} from "@/features/playback/service/PlaybackUiStateService";
import type {AddLyricsDomListener} from "@ui/widgets/lyrics/LyricsDomEvents";

interface LyricsVolumeElements {
    volumeBtn: HTMLElement;
    volumeSliderContainer: HTMLElement;
    volumeFill: HTMLElement;
    volumeHandle: HTMLElement;
    volumeIcon: HTMLElement;
    volumeMuteIcon: HTMLElement;
    volumeHalfIcon: HTMLElement;
}

interface LyricsVolumeControllerOptions {
    elements: LyricsVolumeElements;
    addDomListener: AddLyricsDomListener;
}

class LyricsVolumeController {
    private readonly elements: LyricsVolumeElements;
    private readonly addDomListener: AddLyricsDomListener;
    private currentVolume = 50;
    private previousVolume = 50;
    private dragging = false;
    private bound = false;

    constructor(options: LyricsVolumeControllerOptions) {
        this.elements = options.elements;
        this.addDomListener = options.addDomListener;
    }

    bind(): void {
        if (this.bound) return;

        this.addDomListener(this.elements.volumeBtn, 'click', () => {
            void this.toggleVolumeMute();
        });

        this.addDomListener(this.elements.volumeSliderContainer, 'pointerdown', (event) => {
            this.startVolumeDrag(event as PointerEvent);
        });

        this.addDomListener(document, 'pointermove', (event) => {
            if (this.dragging) {
                this.previewVolumeFromEvent(event as PointerEvent);
            }
        });

        this.addDomListener(document, 'pointerup', () => {
            if (this.dragging) {
                this.dragging = false;
                void this.commitVolume();
            }
        });

        this.addDomListener(document, 'pointercancel', () => {
            this.dragging = false;
            this.setVolumeFromRuntime(playbackUiStateService.getVolume());
        });

        this.addDomListener(this.elements.volumeSliderContainer, 'wheel', (event) => {
            const wheelEvent = event as WheelEvent;
            wheelEvent.preventDefault();
            const delta = wheelEvent.deltaY < 0 ? 1 : -1;
            void this.setVolume(this.currentVolume + delta);
        }, {passive: false});

        this.bound = true;
    }

    async setVolume(volume: number): Promise<void> {
        this.currentVolume = Math.max(0, Math.min(100, volume));
        if (this.currentVolume > 0) {
            this.previousVolume = this.currentVolume;
        }
        this.updateVolumeDisplay();
        await playbackUiStateService.setVolume(this.currentVolume / 100);
    }

    setVolumeFromRuntime(volume: number): void {
        this.currentVolume = Math.max(0, Math.min(100, volume * 100));
        if (this.currentVolume > 0) {
            this.previousVolume = this.currentVolume;
        }
        this.updateVolumeDisplay();
    }

    private updateVolumeDisplay(): void {
        this.elements.volumeFill.style.width = `${this.currentVolume}%`;
        this.elements.volumeHandle.style.left = `${this.currentVolume}%`;

        this.elements.volumeIcon.style.display = 'none';
        this.elements.volumeHalfIcon.style.display = 'none';
        this.elements.volumeMuteIcon.style.display = 'none';

        if (this.currentVolume === 0) {
            this.elements.volumeMuteIcon.style.display = 'block';
        } else if (this.currentVolume <= 50) {
            this.elements.volumeHalfIcon.style.display = 'block';
        } else {
            this.elements.volumeIcon.style.display = 'block';
            this.elements.volumeMuteIcon.style.display = 'none';
            this.elements.volumeHalfIcon.style.display = 'none';
        }
    }

    private startVolumeDrag(event: PointerEvent): void {
        this.dragging = true;
        this.elements.volumeSliderContainer.setPointerCapture?.(event.pointerId);
        this.previewVolumeFromEvent(event);
    }

    private previewVolumeFromEvent(event: PointerEvent): void {
        const rect = this.elements.volumeSliderContainer.getBoundingClientRect();
        const clickX = event.clientX - rect.left;
        const percentage = Math.max(0, Math.min(1, clickX / rect.width));
        this.currentVolume = Math.round(percentage * 100);
        this.updateVolumeDisplay();
    }

    private async commitVolume(): Promise<void> {
        await this.setVolume(this.currentVolume);
    }

    private async toggleVolumeMute(): Promise<void> {
        if (this.currentVolume > 0) {
            this.previousVolume = this.currentVolume;
            await this.setVolume(0);
        } else {
            await this.setVolume(this.previousVolume || 50);
        }
    }
}

export {LyricsVolumeController};
export type {LyricsVolumeElements};
