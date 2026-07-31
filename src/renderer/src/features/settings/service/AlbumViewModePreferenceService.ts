import {cacheManager} from "@/shared/cache";
import type {AlbumViewMode} from "@api/types/settings";

class AlbumViewModePreferenceService {
    private readonly cacheKey = 'musicbox-settings';

    getMode(): AlbumViewMode {
        const settings = cacheManager.getLocalCache<Record<string, unknown>>(this.cacheKey) || {};
        return settings.albumViewMode === 'list' ? 'list' : 'grid';
    }

    setMode(mode: AlbumViewMode): void {
        const settings = cacheManager.getLocalCache<Record<string, unknown>>(this.cacheKey) || {};
        cacheManager.setLocalCache(this.cacheKey, {
            ...settings,
            albumViewMode: mode
        });
    }
}

export const albumViewModePreferenceService = new AlbumViewModePreferenceService();
