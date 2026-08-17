import {urlValidator} from "@utils/URLValidator";
import type {Track} from "@api/types/track";
import {lyricsCoverArtService} from '@/features/mediaAssets/service/LyricsCoverArtService';

type LyricsCoverTrack = Track & {
    path?: string;
};

interface LyricsCoverArtElements {
    background: HTMLElement;
    trackCover: HTMLImageElement;
}

class LyricsCoverArtController {
    private readonly elements: LyricsCoverArtElements;
    private backgroundObjectUrl: string | null = null;
    private updateGeneration = 0;

    constructor(elements: LyricsCoverArtElements) {
        this.elements = elements;
    }

    async updateCoverArt(track: LyricsCoverTrack): Promise<void> {
        const generation = ++this.updateGeneration;
        this.elements.trackCover.src = 'assets/images/default-cover.svg';
        this.elements.trackCover.classList.add('loading');
        await this.setBackgroundImage(null);

        try {
            let finalImageUrl: string | null = null;
            if (track.title && track.artist) {
                const coverResult = await lyricsCoverArtService.loadTrackCover(track);
                if (!this.isCurrentUpdate(generation)) return;
                if (coverResult.success && coverResult.imageUrl) {
                    finalImageUrl = coverResult.imageUrl;
                } else {
                    console.log('❌ Lyrics: 封面获取失败，使用默认封面', coverResult.error);
                }
            }

            if (finalImageUrl) {
                await this.setCoverAndBackground(finalImageUrl, generation);
            }
        } catch (error) {
            console.error('❌ Lyrics: 封面更新失败:', error);
        } finally {
            if (this.isCurrentUpdate(generation)) {
                this.elements.trackCover.classList.remove('loading');
            }
        }
    }

    destroy(): void {
        this.reset();
    }

    reset(): void {
        this.updateGeneration++;
        this.setBackgroundImageUrl(null);
        this.elements.trackCover.src = 'assets/images/default-cover.svg';
        this.elements.trackCover.classList.remove('loading');
    }

    private async setBackgroundImage(imageUrl: string | null, generation?: number): Promise<void> {
        if (imageUrl) {
            try {
                const processedUrl = await lyricsCoverArtService.normalizeImageUrl(imageUrl);
                if (generation !== undefined && !this.isCurrentUpdate(generation)) {
                    if (this.shouldOwnProcessedUrl(imageUrl, processedUrl)) {
                        URL.revokeObjectURL(processedUrl as string);
                    }
                    return;
                }
                this.setBackgroundImageUrl(processedUrl, this.shouldOwnProcessedUrl(imageUrl, processedUrl));
            } catch (error) {
                console.error('❌ Lyrics: 背景图片设置失败:', error);
                if (generation === undefined || this.isCurrentUpdate(generation)) {
                    this.setBackgroundImageUrl(null);
                }
            }
        } else {
            this.setBackgroundImageUrl(null);
        }
    }

    private setBackgroundImageUrl(imageUrl: string | null, ownsObjectUrl = false): void {
        if (this.backgroundObjectUrl) {
            URL.revokeObjectURL(this.backgroundObjectUrl);
            this.backgroundObjectUrl = null;
        }

        if (!imageUrl) {
            this.elements.background.style.backgroundImage = 'none';
            return;
        }

        if (ownsObjectUrl && imageUrl.startsWith('blob:')) {
            this.backgroundObjectUrl = imageUrl;
        }
        this.elements.background.style.backgroundImage = `url("${imageUrl}")`;
    }

    private shouldOwnProcessedUrl(originalUrl: string, processedUrl: string | null): boolean {
        return Boolean(processedUrl?.startsWith('blob:') && !originalUrl.startsWith('blob:'));
    }

    private async setCoverAndBackground(imageUrl: string, generation: number): Promise<void> {
        try {
            const success = await urlValidator.isValidUrl(imageUrl);
            if (!this.isCurrentUpdate(generation)) return;

            if (success) {
                this.elements.trackCover.src = imageUrl;
            } else {
                this.elements.trackCover.src = 'assets/images/default-cover.svg';
            }

            if (!this.isCurrentUpdate(generation)) return;
            await this.setBackgroundImage(imageUrl, generation);
        } catch (error) {
            if (!this.isCurrentUpdate(generation)) return;
            console.error('❌ Lyrics: 封面和背景设置失败:', error);
            this.elements.trackCover.src = 'assets/images/default-cover.svg';
            await this.setBackgroundImage(null);
        }
    }

    private isCurrentUpdate(generation: number): boolean {
        return generation === this.updateGeneration;
    }
}

export {LyricsCoverArtController};
