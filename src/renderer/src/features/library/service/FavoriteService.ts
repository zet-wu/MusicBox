import {libraryGateway} from "@/infrastructure/electron";
import type {Unsubscribe} from "@api/types/common";
import type {FavoritesChangedData} from "@api/types/electron";
import type {Track} from "@api/types/track";

export const FAVORITES_PLAYLIST_ID = 'system:favorites';

export interface FavoriteMutationResult {
    success: boolean;
    favorite: boolean;
    error?: string;
}

type FavoriteChangedListener = (data: FavoritesChangedData) => void | Promise<void>;

interface FavoriteGateway {
    setTrackFavorite(trackFileId: string, favorite: boolean): Promise<{
        success: boolean;
        favorite?: boolean;
        error?: string;
    }>;
    onFavoritesChanged(handler: (data: FavoritesChangedData) => void): Unsubscribe;
}

export class FavoriteService {
    private readonly gateway: FavoriteGateway;
    private readonly listeners = new Set<FavoriteChangedListener>();
    private readonly states = new Map<string, boolean>();
    private readonly desiredStates = new Map<string, boolean>();
    private readonly queues = new Map<string, Promise<FavoriteMutationResult>>();
    private readonly unsubscribeGateway: Unsubscribe;

    constructor(gateway: FavoriteGateway = libraryGateway) {
        this.gateway = gateway;
        this.unsubscribeGateway = this.gateway.onFavoritesChanged((data) => {
            this.applyChangedData(data);
        });
    }

    isFavorite(track: Pick<Track, 'fileId' | 'favorite'> | null): boolean {
        if (!track) {
            return false;
        }

        const fileId = track.fileId;
        if (fileId && this.states.has(fileId)) {
            return this.states.get(fileId) === true;
        }

        return track.favorite === true;
    }

    toggle(track: Pick<Track, 'fileId' | 'favorite'>): Promise<FavoriteMutationResult> {
        const fileId = track.fileId;
        const currentState = fileId && this.desiredStates.has(fileId)
            ? this.desiredStates.get(fileId) === true
            : this.isFavorite(track);
        return this.setFavorite(track, !currentState);
    }

    setFavorite(
        track: Pick<Track, 'fileId' | 'favorite'>,
        favorite: boolean
    ): Promise<FavoriteMutationResult> {
        const fileId = track.fileId;
        if (!fileId) {
            return Promise.resolve({
                success: false,
                favorite: this.isFavorite(track),
                error: '歌曲缺少文件标识'
            });
        }

        this.desiredStates.set(fileId, favorite);
        const previous = this.queues.get(fileId);
        const operation = (previous ? previous.catch(() => ({
            success: false,
            favorite: this.isFavorite(track)
        })) : Promise.resolve())
            .then(async () => {
                try {
                    const result = await this.gateway.setTrackFavorite(fileId, favorite);
                    if (!result.success) {
                        return {
                            success: false,
                            favorite: this.states.get(fileId) ?? this.isFavorite(track),
                            error: result.error || '更新收藏状态失败'
                        };
                    }

                    const finalState = result.favorite ?? favorite;
                    this.publishState(fileId, finalState);
                    return {success: true, favorite: finalState};
                } catch (error) {
                    return {
                        success: false,
                        favorite: this.states.get(fileId) ?? this.isFavorite(track),
                        error: error instanceof Error ? error.message : String(error)
                    };
                }
            });

        this.queues.set(fileId, operation);
        void operation.finally(() => {
            if (this.queues.get(fileId) === operation) {
                this.queues.delete(fileId);
                this.desiredStates.delete(fileId);
            }
        });
        return operation;
    }

    onChanged(listener: FavoriteChangedListener): Unsubscribe {
        this.listeners.add(listener);
        return () => {
            this.listeners.delete(listener);
        };
    }

    destroy(): void {
        this.unsubscribeGateway();
        this.listeners.clear();
        this.states.clear();
        this.desiredStates.clear();
        this.queues.clear();
    }

    private applyChangedData(data: FavoritesChangedData): void {
        const trackIds = [...new Set(data.trackIds.filter(Boolean))];
        if (typeof data.favorite === 'boolean') {
            trackIds.forEach((trackId) => {
                this.states.set(trackId, data.favorite as boolean);
            });
        }
        this.notify({trackIds, favorite: data.favorite});
    }

    private publishState(trackId: string, favorite: boolean): void {
        if (this.states.get(trackId) === favorite) {
            return;
        }

        this.states.set(trackId, favorite);
        this.notify({trackIds: [trackId], favorite});
    }

    private notify(data: FavoritesChangedData): void {
        this.listeners.forEach((listener) => {
            try {
                void listener(data);
            } catch (error) {
                console.error('❌ FavoriteService: 通知收藏状态变化失败', error);
            }
        });
    }
}

export const favoriteService = new FavoriteService();
