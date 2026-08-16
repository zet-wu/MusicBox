import {desktopLyricsService} from "@/features/desktopLyrics/service/DesktopLyricsService";
import {getLyricsService} from '@/features/lyrics/service/defaultLyricsServices';
import type {LyricsDocument} from '@/features/lyrics/domain/types';
import type {LyricsService} from '@/features/lyrics/service/LyricsService';
import {getLyricsTrackIdentity, type LyricsTrack} from "@ui/widgets/lyrics/LyricsTypes";

interface LyricsLoaderControllerOptions {
    setDocument: (document: LyricsDocument, editableCanonical: boolean) => void;
    showLoading: () => void;
    showNoLyrics: () => void;
    service?: LyricsService;
}

class LyricsLoaderController {
    private readonly setDocument: (document: LyricsDocument, editableCanonical: boolean) => void;
    private readonly showLoading: () => void;
    private readonly showNoLyrics: () => void;
    private loadGeneration = 0;
    private currentTrackIdentity: string | null = null;
    private abortController: AbortController | null = null;
    private readonly service: LyricsService;

    constructor(options: LyricsLoaderControllerOptions) {
        this.setDocument = options.setDocument;
        this.showLoading = options.showLoading;
        this.showNoLyrics = options.showNoLyrics;
        this.service = options.service ?? getLyricsService();
    }

    reset(): void {
        this.loadGeneration++;
        this.currentTrackIdentity = null;
        this.abortController?.abort();
        this.abortController = null;
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
        this.abortController?.abort();
        this.abortController = new AbortController();

        if (!track.lyrics) {
            this.showLoading();
        }

        try {
            const result = await this.service.load(track, this.abortController.signal);
            if (!this.isCurrentLoad(generation, trackIdentity)) {
                return;
            }

            if (result.document && result.document.render.lines.length > 0) {
                this.setDocument(result.document, Boolean(result.binding));
                await desktopLyricsService.syncLyrics(result.document.render.lines);
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
