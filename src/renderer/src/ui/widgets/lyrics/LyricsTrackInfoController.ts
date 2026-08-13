import {getLyricsTrackIdentity, type LyricsTrack} from "@ui/widgets/lyrics/LyricsTypes";

interface LyricsTrackInfoElements {
    trackTitle: HTMLElement;
    trackArtist: HTMLElement;
}

interface LyricsTrackInfoControllerOptions {
    elements: LyricsTrackInfoElements;
    updateTrackDuration: (duration: number | undefined) => void;
    loadLyrics: (track: LyricsTrack) => Promise<void>;
    updateCoverArt: (track: LyricsTrack) => Promise<void>;
}

class LyricsTrackInfoController {
    private readonly elements: LyricsTrackInfoElements;
    private readonly updateTrackDuration: (duration: number | undefined) => void;
    private readonly loadLyrics: (track: LyricsTrack) => Promise<void>;
    private readonly updateCoverArt: (track: LyricsTrack) => Promise<void>;
    private lastTrackIdentity: string | null = null;
    private updateGeneration = 0;
    private pendingUpdatePromise: Promise<void> | null = null;

    constructor(options: LyricsTrackInfoControllerOptions) {
        this.elements = options.elements;
        this.updateTrackDuration = options.updateTrackDuration;
        this.loadLyrics = options.loadLyrics;
        this.updateCoverArt = options.updateCoverArt;
    }

    reset(): void {
        this.updateGeneration++;
        this.lastTrackIdentity = null;
        this.pendingUpdatePromise = null;
    }

    async updateTrackInfo(track: LyricsTrack | null): Promise<void> {
        if (!track) return;

        const trackIdentity = getLyricsTrackIdentity(track);
        if (this.lastTrackIdentity === trackIdentity && this.pendingUpdatePromise) {
            await this.pendingUpdatePromise;
            return;
        }

        if (this.lastTrackIdentity === trackIdentity) {
            return;
        }

        const generation = ++this.updateGeneration;
        this.lastTrackIdentity = trackIdentity;
        const updatePromise = this.doUpdateTrackInfo(track);
        this.pendingUpdatePromise = updatePromise;

        try {
            await updatePromise;
        } finally {
            if (generation === this.updateGeneration) {
                this.pendingUpdatePromise = null;
            }
        }
    }

    private async doUpdateTrackInfo(track: LyricsTrack): Promise<void> {
        try {
            console.log('🎵 Lyrics: 开始更新歌曲信息', track.title, '时间戳:', Date.now());

            this.elements.trackTitle.textContent = track.title || '未知歌曲';
            this.elements.trackArtist.textContent = track.artist || '未知艺术家';

            this.updateTrackDuration(track.duration);
            await Promise.all([
                this.loadLyrics(track),
                this.updateCoverArt(track)
            ]);
        } catch (error) {
            console.error('❌ Lyrics: 歌曲信息更新失败:', error);
            throw error;
        }
    }
}

export {LyricsTrackInfoController};
