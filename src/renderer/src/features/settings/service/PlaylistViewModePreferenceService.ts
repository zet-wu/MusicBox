import {cacheManager} from "@/shared/cache";
import type {PlaylistViewMode} from "@api/types/settings";

class PlaylistViewModePreferenceService {
    private readonly cacheKey = 'musicbox-settings';

    getMode(): PlaylistViewMode {
        const settings = cacheManager.getLocalCache<Record<string, unknown>>(this.cacheKey) || {};
        return settings.playlistViewMode === 'list' ? 'list' : 'grid';
    }

    setMode(mode: PlaylistViewMode): void {
        const settings = cacheManager.getLocalCache<Record<string, unknown>>(this.cacheKey) || {};
        cacheManager.setLocalCache(this.cacheKey, {
            ...settings,
            playlistViewMode: mode
        });
    }
}

export const playlistViewModePreferenceService = new PlaylistViewModePreferenceService();
