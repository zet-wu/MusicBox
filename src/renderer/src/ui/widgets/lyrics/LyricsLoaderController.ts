import {desktopLyricsService} from "@/features/desktopLyrics/service/DesktopLyricsService";
import {lyricsContentService} from "@/features/mediaAssets/service/LyricsContentService";
import {getLyricsTrackIdentity, type LyricsTrack, type RenderLyricLine} from "@ui/widgets/lyrics/LyricsTypes";

interface LyricsLoaderControllerOptions {
    setLyrics: (lyrics: RenderLyricLine[]) => void;
    renderLyrics: () => void;
    showLoading: () => void;
    showNoLyrics: () => void;
}

class LyricsLoaderController {
    private readonly setLyrics: (lyrics: RenderLyricLine[]) => void;
    private readonly renderLyrics: () => void;
    private readonly showLoading: () => void;
    private readonly showNoLyrics: () => void;
    private loadGeneration = 0;
    private currentTrackIdentity: string | null = null;

    constructor(options: LyricsLoaderControllerOptions) {
        this.setLyrics = options.setLyrics;
        this.renderLyrics = options.renderLyrics;
        this.showLoading = options.showLoading;
        this.showNoLyrics = options.showNoLyrics;
    }

    reset(): void {
        this.loadGeneration++;
        this.currentTrackIdentity = null;
    }

    async loadLyrics(track: LyricsTrack): Promise<void> {
        if (!track) {
            this.showNoLyrics();
            return;
        }

        const trackIdentity = getLyricsTrackIdentity(track);
        if (this.currentTrackIdentity === trackIdentity) {
            return;
        }

        const generation = ++this.loadGeneration;
        this.currentTrackIdentity = trackIdentity;

        if (!track.lyrics) {
            this.showLoading();
        }

        try {
            const result = await lyricsContentService.loadTrackLyrics(track);
            if (!this.isCurrentLoad(generation, trackIdentity)) {
                return;
            }

            if (result.success && result.lyrics.length > 0) {
                const lyrics = result.lyrics as RenderLyricLine[];
                this.setLyrics(lyrics);
                this.renderLyrics();
                await desktopLyricsService.syncLyrics(lyrics);
            } else {
                this.showNoLyrics();
                console.log(`❌ Lyrics: ${result.error || '歌词获取失败'}`);
            }
        } catch (error) {
            if (!this.isCurrentLoad(generation, trackIdentity)) {
                return;
            }
            console.error('❌ Lyrics: 歌词加载失败:', error);
            this.showNoLyrics();
        }
    }

    private isCurrentLoad(generation: number, trackIdentity: string): boolean {
        return generation === this.loadGeneration && trackIdentity === this.currentTrackIdentity;
    }
}

export {LyricsLoaderController};
