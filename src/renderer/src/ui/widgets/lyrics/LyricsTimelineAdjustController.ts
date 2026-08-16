import type {LyricsDocument} from '@/features/lyrics/domain/types';
import {getLyricsService} from '@/features/lyrics/service/defaultLyricsServices';
import {toTrackLyricsQuery, type LyricsService} from '@/features/lyrics/service/LyricsService';
import {desktopLyricsService} from '@/features/desktopLyrics/service/DesktopLyricsService';
import type {AddLyricsDomListener} from './LyricsDomEvents';
import type {LyricsTrack} from './LyricsTypes';

interface LyricsTimelineAdjustElements {
    container: HTMLElement;
    earlierButton: HTMLButtonElement;
    laterButton: HTMLButtonElement;
}

interface LyricsTimelineAdjustControllerOptions {
    elements: LyricsTimelineAdjustElements;
    addDomListener: AddLyricsDomListener;
    getCurrentTrack: () => LyricsTrack | null;
    service?: LyricsService;
    dispatchDocumentApplied?: (trackId: string, document: LyricsDocument) => void;
    syncDesktopLyrics?: (document: LyricsDocument) => Promise<void>;
}

export class LyricsTimelineAdjustController {
    private readonly service: LyricsService;
    private readonly dispatchDocumentApplied: (trackId: string, document: LyricsDocument) => void;
    private readonly syncDesktopLyrics: (document: LyricsDocument) => Promise<void>;
    private queue: Promise<void> = Promise.resolve();

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
        this.setEditableDocument(null);
    }

    bind(): void {
        this.options.addDomListener(this.options.elements.earlierButton, 'click', () => {
            this.enqueue(-100);
        });
        this.options.addDomListener(this.options.elements.laterButton, 'click', () => {
            this.enqueue(100);
        });
    }

    setEditableDocument(document: LyricsDocument | null): void {
        this.options.elements.container.hidden = !document || document.render.lines.length === 0;
    }

    private enqueue(deltaMs: number): void {
        const track = this.options.getCurrentTrack();
        if (!track) return;
        const query = toTrackLyricsQuery(track);
        this.queue = this.queue
            .then(async () => {
                const result = await this.service.shiftCanonicalTimeline(query, deltaMs);
                if (!result.document) throw new Error(result.error ?? '歌词时间轴调整失败');

                this.dispatchDocumentApplied(query.trackId, result.document);
                const currentTrack = this.options.getCurrentTrack();
                if (currentTrack && toTrackLyricsQuery(currentTrack).trackId === query.trackId) {
                    await this.syncDesktopLyrics(result.document);
                }
            })
            .catch(error => {
                console.error('❌ Lyrics: 时间轴调整失败', error);
            });
    }
}

export type {LyricsTimelineAdjustElements};
