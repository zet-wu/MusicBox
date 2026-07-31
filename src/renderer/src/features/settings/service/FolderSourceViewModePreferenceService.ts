import {cacheManager} from '@/shared/cache';
import type {FolderSourceViewMode} from '@api/types/settings';

class FolderSourceViewModePreferenceService {
    private readonly cacheKey = 'musicbox-settings';

    getMode(): FolderSourceViewMode {
        const settings = cacheManager.getLocalCache<Record<string, unknown>>(this.cacheKey) || {};
        return settings.folderSourceViewMode === 'list' ? 'list' : 'grid';
    }

    setMode(mode: FolderSourceViewMode): void {
        const settings = cacheManager.getLocalCache<Record<string, unknown>>(this.cacheKey) || {};
        cacheManager.setLocalCache(this.cacheKey, {
            ...settings,
            folderSourceViewMode: mode
        });
    }
}

export const folderSourceViewModePreferenceService = new FolderSourceViewModePreferenceService();
