import type {Track} from "@api/types/library";
import type {PlaylistDoubleClickMode} from "@api/types/settings";
import {appNotificationService} from "@/features/appShell/service";
import {cacheManager} from "@/shared/cache";
import type {MusicBoxSettings} from "@api/types/settings";

export class PlaylistPlaybackActionService {
    getPlayableTracks(tracks: Track[]): Track[] | null {
        if (tracks.length === 0) {
            appNotificationService.showInfo('歌单为空，无法播放');
            return null;
        }

        return tracks;
    }

    getShuffledPlayableTracks(tracks: Track[]): Track[] | null {
        const playableTracks = this.getPlayableTracks(tracks);
        return playableTracks ? this.shuffleTracks(playableTracks) : null;
    }

    getDoubleClickMode(): PlaylistDoubleClickMode {
        const settings = (cacheManager.getLocalCache('musicbox-settings') || {}) as MusicBoxSettings;
        return settings.playlistDoubleClickMode === 'sequence' ? 'sequence' : 'shuffle';
    }

    shuffleTracks(tracks: Track[]): Track[] {
        const result = [...tracks];
        for (let index = result.length - 1; index > 0; index -= 1) {
            const swapIndex = Math.floor(Math.random() * (index + 1));
            [result[index], result[swapIndex]] = [result[swapIndex], result[index]];
        }
        return result;
    }
}

export const playlistPlaybackActionService = new PlaylistPlaybackActionService();
