import {playbackUiStateService} from "@/features/playback/service/PlaybackUiStateService";
import {LyricsCoverArtController} from "@ui/widgets/lyrics/LyricsCoverArtController";
import {resolveLyricsElements} from "@ui/widgets/lyrics/LyricsElementRegistry";
import {LyricsLayoutController} from "@ui/widgets/lyrics/LyricsLayoutController";
import {LyricsLoaderController} from "@ui/widgets/lyrics/LyricsLoaderController";
import {LyricsPlaybackControlsController} from "@ui/widgets/lyrics/LyricsPlaybackControlsController";
import {LyricsPlaybackStateController} from "@ui/widgets/lyrics/LyricsPlaybackStateController";
import {AmllLyricsView} from '@/features/lyrics/ui/AmllLyricsView';
import {LyricsTrackInfoController} from "@ui/widgets/lyrics/LyricsTrackInfoController";
import type {PlayMode} from "@api/types/playback";
import type {AddLyricsDomListener} from "@ui/widgets/lyrics/LyricsDomEvents";
import type {LyricsElements} from "@ui/widgets/lyrics/LyricsElementRegistry";
import type {LyricsTrack} from "@ui/widgets/lyrics/LyricsTypes";
import type {LyricsDocument} from '@/features/lyrics/domain/types';
import {getLyricsSourcePicker} from '@/features/lyrics/ui/LyricsSourcePicker';
import {LyricsTimelineAdjustController} from './LyricsTimelineAdjustController';

interface LyricsWidgetCompositionOptions {
    root: Element | null;
    addDomListener: AddLyricsDomListener;
    isVisible: () => boolean;
    getCurrentTrack: () => LyricsTrack | null;
    setCurrentTrack: (track: LyricsTrack | null) => void;
    onClose: () => void;
}

class LyricsWidgetComposition {
    readonly elements: LyricsElements;
    private readonly coverArtController: LyricsCoverArtController;
    private readonly layoutController: LyricsLayoutController;
    private readonly lyricsLoader: LyricsLoaderController;
    private readonly playbackControls: LyricsPlaybackControlsController;
    private readonly playbackStateController: LyricsPlaybackStateController;
    private readonly lyricsView: AmllLyricsView;
    private readonly trackInfoController: LyricsTrackInfoController;
    private readonly timelineAdjustController: LyricsTimelineAdjustController;
    private readonly addDomListener: AddLyricsDomListener;
    private readonly isVisible: () => boolean;
    private readonly getCurrentTrack: () => LyricsTrack | null;
    private readonly setCurrentTrack: (track: LyricsTrack | null) => void;
    private readonly onClose: () => void;
    private bound = false;

    constructor(options: LyricsWidgetCompositionOptions) {
        this.addDomListener = options.addDomListener;
        this.isVisible = options.isVisible;
        this.getCurrentTrack = options.getCurrentTrack;
        this.setCurrentTrack = options.setCurrentTrack;
        this.onClose = options.onClose;
        this.elements = resolveLyricsElements(options.root);

        this.coverArtController = new LyricsCoverArtController({
            background: this.elements.background,
            trackCover: this.elements.trackCover
        });

        this.layoutController = new LyricsLayoutController({
            elements: this.elements.layout,
            addDomListener: this.addDomListener,
            isVisible: this.isVisible
        });

        this.lyricsView = new AmllLyricsView({
            container: this.elements.lyricsDisplay,
            isVisible: this.isVisible,
            seek: async (time) => {
                await playbackUiStateService.seek(time);
            }
        });

        this.timelineAdjustController = new LyricsTimelineAdjustController({
            elements: this.elements.timelineAdjust,
            addDomListener: this.addDomListener,
            getCurrentTrack: this.getCurrentTrack
        });

        this.lyricsLoader = new LyricsLoaderController({
            setDocument: (document, editableCanonical) => {
                this.lyricsView.setDocument(document, playbackUiStateService.getState().position);
                this.timelineAdjustController.setEditableDocument(editableCanonical ? document : null);
            },
            showLoading: () => {
                this.lyricsView.showLoading();
                this.timelineAdjustController.setEditableDocument(null);
            },
            showNoLyrics: () => {
                this.lyricsView.showNoLyrics();
                this.timelineAdjustController.setEditableDocument(null);
            }
        });

        this.playbackControls = new LyricsPlaybackControlsController({
            elements: this.elements.playback,
            addDomListener: this.addDomListener,
            getCurrentTrack: this.getCurrentTrack
        });

        this.playbackStateController = new LyricsPlaybackStateController({
            isVisible: this.isVisible,
            onPositionChanged: (position, duration) => {
                this.lyricsView.handlePlaybackPositionChanged(position);
                this.playbackControls.updateProgress(position, duration);
            },
            onPlaybackStateChanged: (isPlaying) => {
                this.playbackControls.setPlaying(isPlaying);
                this.lyricsView.setPlaying(isPlaying);
            },
            onDurationChanged: (duration) => {
                this.playbackControls.updateDuration(duration);
            },
            onTrackChanged: (track) => {
                this.setCurrentTrack(track);
                return this.updateTrackAndPlaybackState(track);
            },
            onVolumeChanged: (volume) => {
                this.playbackControls.setVolumeFromRuntime(volume);
            },
            onPlayModeChanged: (mode) => {
                this.updatePlayModeDisplay(mode);
            }
        });

        this.trackInfoController = new LyricsTrackInfoController({
            elements: {
                trackTitle: this.elements.trackTitle,
                trackArtist: this.elements.trackArtist
            },
            updateTrackDuration: (duration) => {
                this.playbackControls.updateTrackDuration(duration);
            },
            loadLyrics: (track) => {
                return this.lyricsLoader.loadLyrics(track);
            },
            updateCoverArt: (track) => {
                return this.coverArtController.updateCoverArt(track);
            }
        });
    }

    bind(): void {
        if (this.bound) {
            return;
        }

        this.addDomListener(this.elements.closeBtn, 'click', () => {
            this.onClose();
        });
        this.addDomListener(this.elements.lyricsDisplay, 'contextmenu', event => {
            event.preventDefault();
            const track = this.getCurrentTrack();
            if (track) void getLyricsSourcePicker().open(track);
        });

        this.layoutController.bind();
        this.timelineAdjustController.bind();
        this.playbackControls.bind();
        this.playbackStateController.bind();
        this.bound = true;
    }

    resetAfterHide(): void {
        this.trackInfoController.reset();
        this.lyricsLoader.reset();
        this.coverArtController.reset();
        this.lyricsView.reset();
        if (this.layoutController.isFullscreen()) {
            this.layoutController.exitFullscreen();
        }
        this.layoutController.resetLayoutState();
    }

    destroy(): void {
        this.playbackStateController.destroy();
        this.coverArtController.destroy();
        this.lyricsView.destroy();
        this.layoutController.resetLayoutState();
        this.bound = false;
    }

    async updateTrackInfo(track: LyricsTrack | null): Promise<void> {
        await this.trackInfoController.updateTrackInfo(track);
    }

    async initializeControls(): Promise<void> {
        await this.playbackControls.initialize();
        this.lyricsView.setPlaying(playbackUiStateService.getState().isPlaying);
    }

    syncCurrentPlaybackState(forceScroll = false): void {
        const state = playbackUiStateService.getState();
        this.playbackControls.updateProgress(state.position, state.duration);
        this.lyricsView.setPlaying(state.isPlaying);
        this.lyricsView.handlePlaybackPositionChanged(state.position, forceScroll);
    }

    async togglePlayPause(): Promise<void> {
        await this.playbackControls.togglePlayPause();
    }

    async setVolume(volume: number): Promise<void> {
        await this.playbackControls.setVolume(volume);
    }

    updateVolumeDisplay(): void {
        this.playbackControls.setVolumeFromRuntime(playbackUiStateService.getState().volume);
    }

    updatePlayModeDisplay(mode: PlayMode): void {
        this.playbackControls.updatePlayModeDisplay(mode);
    }

    toggleFullscreen(): void {
        this.layoutController.toggleFullscreen();
    }

    enterFullscreen(): void {
        this.layoutController.enterFullscreen();
    }

    exitFullscreen(): void {
        this.layoutController.exitFullscreen();
    }

    updateFullscreenState(): boolean {
        return this.layoutController.updateFullscreenState();
    }

    resetLayoutState(): void {
        this.layoutController.resetLayoutState();
    }

    applyDocument(document: LyricsDocument): void {
        this.lyricsView.setDocument(document, playbackUiStateService.getState().position);
        this.timelineAdjustController.setEditableDocument(document);
        this.syncCurrentPlaybackState(true);
    }

    private async updateTrackAndPlaybackState(track: LyricsTrack | null): Promise<void> {
        if (!track) {
            this.onClose();
            return;
        }
        await this.updateTrackInfo(track);
        this.syncCurrentPlaybackState(true);
    }
}

export {LyricsWidgetComposition};
