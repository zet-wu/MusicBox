import {cacheManager} from "@/shared/cache";
import type {Unsubscribe} from "@api/types/common";

type AlbumGroupingPreferenceListener = (splitByArtist: boolean) => void | Promise<void>;

class AlbumGroupingPreferenceService {
    private readonly listeners = new Set<AlbumGroupingPreferenceListener>();
    private splitByArtist = this.readFromCache();

    shouldSplitByArtist(): boolean {
        return this.splitByArtist;
    }

    setSplitByArtist(splitByArtist: boolean): void {
        if (this.splitByArtist === splitByArtist) {
            return;
        }

        this.splitByArtist = splitByArtist;
        this.listeners.forEach((listener) => {
            try {
                void listener(splitByArtist);
            } catch (error) {
                console.error('❌ AlbumGroupingPreferenceService: 通知专辑分组设置失败', error);
            }
        });
    }

    onChanged(listener: AlbumGroupingPreferenceListener): Unsubscribe {
        this.listeners.add(listener);
        return () => {
            this.listeners.delete(listener);
        };
    }

    private readFromCache(): boolean {
        const settings = cacheManager.getLocalCache<Record<string, unknown>>('musicbox-settings') || {};
        return settings.splitAlbumsByArtist === true;
    }
}

export const albumGroupingPreferenceService = new AlbumGroupingPreferenceService();
