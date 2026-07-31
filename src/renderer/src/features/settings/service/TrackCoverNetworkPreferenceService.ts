import {cacheManager} from "@/shared/cache";
import type {Unsubscribe} from "@api/types/common";

type TrackCoverNetworkPreferenceListener = (enabled: boolean) => void | Promise<void>;

class TrackCoverNetworkPreferenceService {
    private readonly listeners = new Set<TrackCoverNetworkPreferenceListener>();
    private enabled = this.readEnabledFromCache();

    isEnabled(): boolean {
        return this.enabled;
    }

    setEnabled(enabled: boolean): void {
        if (this.enabled === enabled) {
            return;
        }

        this.enabled = enabled;
        this.listeners.forEach((listener) => {
            try {
                void listener(enabled);
            } catch (error) {
                console.error('❌ TrackCoverNetworkPreferenceService: 通知联网封面设置失败', error);
            }
        });
    }

    onChanged(listener: TrackCoverNetworkPreferenceListener): Unsubscribe {
        this.listeners.add(listener);
        return () => {
            this.listeners.delete(listener);
        };
    }

    private readEnabledFromCache(): boolean {
        const settings = cacheManager.getLocalCache<Record<string, boolean>>('musicbox-settings') || {};
        return settings.autoFetchMissingTrackCovers === true;
    }
}

export const trackCoverNetworkPreferenceService = new TrackCoverNetworkPreferenceService();
