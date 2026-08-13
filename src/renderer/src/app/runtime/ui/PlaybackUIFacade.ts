import type {PlayMode} from '@api/types/playback';
import type {Track} from '@api/types/track';
import type {AppComponentPort} from '../AppRuntimePorts';
import type {PlayerLike} from '../components/ComponentTypes';

export class PlaybackUIFacade {
    constructor(private readonly app: AppComponentPort) {}

    updatePlayModeDisplay(mode: PlayMode): void {
        this.app.components.player?.updatePlayModeDisplay(mode);
    }

    getActivePlayer(): PlayerLike | null {
        return this.app.components.player ?? null;
    }

    async updatePlayerTrackInfo(track: Track): Promise<void> {
        await this.app.components.player?.updateTrackInfo(track);
    }

    async updatePlayerUI(): Promise<void> {
        await this.app.components.player?.updateUI();
    }

    getPlayerVolume(): number | null {
        return this.app.components.player?.getVolume?.() ?? null;
    }

    async updateDesktopLyricsButtonVisibility(enabled: boolean): Promise<void> {
        await this.app.components.player?.updateDesktopLyricsButtonVisibility(enabled);
    }

    isLyricsVisible(): boolean {
        return Boolean(this.app.components.lyrics?.isVisible);
    }

    async toggleLyricsForTrack(track: Track | null): Promise<void> {
        if (!track && !this.isLyricsVisible()) {
            return;
        }
        await this.app.components.lyrics?.toggle(track);
    }

    async toggleLyricsPanel(track: Track | null): Promise<void> {
        const lyrics = this.app.components.lyrics;
        if (!lyrics) {
            return;
        }

        if (lyrics.isVisible) {
            lyrics.hide();
            return;
        }

        if (track) {
            await lyrics.show(track);
        }
    }

    exitLyricsPanel(): void {
        const lyrics = this.app.components.lyrics;
        if (!lyrics?.isVisible) {
            return;
        }

        if (lyrics.isFullscreen) {
            lyrics.exitFullscreen();
        } else {
            lyrics.hide();
        }
    }

    toggleLyricsFullscreen(requireVisible = true): void {
        const lyrics = this.app.components.lyrics;
        if (lyrics && (!requireVisible || lyrics.isVisible)) {
            lyrics.toggleFullscreen();
        }
    }

}
