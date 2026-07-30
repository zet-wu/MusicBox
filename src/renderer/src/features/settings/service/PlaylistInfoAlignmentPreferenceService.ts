import {cacheManager} from "@/shared/cache";
import type {Unsubscribe} from "@api/types/common";
import type {PlaylistInfoAlignment} from "@api/types/settings";

type PlaylistInfoAlignmentListener = (alignment: PlaylistInfoAlignment) => void | Promise<void>;

class PlaylistInfoAlignmentPreferenceService {
    private readonly listeners = new Set<PlaylistInfoAlignmentListener>();
    private alignment = this.readAlignmentFromCache();

    getAlignment(): PlaylistInfoAlignment {
        return this.alignment;
    }

    setAlignment(alignment: PlaylistInfoAlignment): void {
        if (this.alignment === alignment) {
            return;
        }

        this.alignment = alignment;
        this.listeners.forEach((listener) => {
            try {
                void listener(alignment);
            } catch (error) {
                console.error('❌ PlaylistInfoAlignmentPreferenceService: 通知歌单信息对齐设置失败', error);
            }
        });
    }

    onChanged(listener: PlaylistInfoAlignmentListener): Unsubscribe {
        this.listeners.add(listener);
        return () => {
            this.listeners.delete(listener);
        };
    }

    refreshFromCache(): void {
        this.setAlignment(this.readAlignmentFromCache());
    }

    private readAlignmentFromCache(): PlaylistInfoAlignment {
        const settings = cacheManager.getLocalCache<Record<string, unknown>>('musicbox-settings') || {};
        const alignment = settings.playlistInfoAlignment;
        return alignment === 'center' || alignment === 'right' ? alignment : 'left';
    }
}

export const playlistInfoAlignmentPreferenceService = new PlaylistInfoAlignmentPreferenceService();
