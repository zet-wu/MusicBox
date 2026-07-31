import {cacheManager} from "@/shared/cache";
import type {ArtistViewMode} from "@api/types/settings";

class ArtistViewModePreferenceService {
    private readonly cacheKey = 'musicbox-settings';

    getMode(): ArtistViewMode {
        const settings = cacheManager.getLocalCache<Record<string, unknown>>(this.cacheKey) || {};
        return settings.artistViewMode === 'list' ? 'list' : 'grid';
    }

    setMode(mode: ArtistViewMode): void {
        const settings = cacheManager.getLocalCache<Record<string, unknown>>(this.cacheKey) || {};
        cacheManager.setLocalCache(this.cacheKey, {
            ...settings,
            artistViewMode: mode
        });
    }
}

export const artistViewModePreferenceService = new ArtistViewModePreferenceService();
