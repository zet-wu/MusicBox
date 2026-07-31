import {appConfirmationService} from "@/features/appShell/service/AppConfirmationService";
import {getTrackPath} from "@/features/playback/domain/TrackIdentity";
import {cacheManager} from "@/shared/cache";
import type {PlaybackStartedEvent} from "@api/types/events";
import type {Track} from "@api/types/library";

const PLAYBACK_HISTORY_STORAGE_KEY = 'musicbox-playback-history-v1';
const PLAYBACK_HISTORY_VERSION = 1;
const RECENT_TRACK_LIMIT = 100;

export interface RecentTrack extends Track {
    playTime?: number;
}

export interface TrackPlayAggregate {
    track: RecentTrack;
    playCount: number;
    lastPlayedAt: number;
}

export type PlayCountStats = Record<string, TrackPlayAggregate>;

export interface PlaybackHistoryState {
    version: number;
    recent: RecentTrack[];
    aggregates: PlayCountStats;
}

export interface MostPlayedTrack {
    title: string;
    artist: string;
    album: string;
    playCount: number;
}

export interface PlayStats {
    totalTracks: number;
    totalDuration: number;
    favoriteArtist: string;
    uniqueArtists: number;
    uniqueAlbums: number;
    totalPlayedSongs: number;
    totalPlayedDuration: number;
    mostPlayedTracks: MostPlayedTrack[];
}

type HistoryChangedListener = () => void;

export class RecentPlaybackHistoryService {
    private readonly listeners = new Set<HistoryChangedListener>();
    private lastRecordedSessionId: string | null = null;

    loadHistory(limit?: number): RecentTrack[] {
        const tracks = this.loadState().recent;
        return typeof limit === 'number' ? tracks.slice(0, limit) : tracks;
    }

    recordPlaybackStarted(event: PlaybackStartedEvent): void {
        if (
            !event.track?.filePath
            || !event.sessionId
            || event.sessionId === this.lastRecordedSessionId
        ) {
            return;
        }

        const state = this.loadState();
        const track = this.createTrackSnapshot(event.track, event.startedAt);
        const trackKey = this.getTrackKey(track);
        const existingAggregate = state.aggregates[trackKey];

        state.recent = [
            track,
            ...state.recent.filter(item => this.getTrackKey(item) !== trackKey)
        ].slice(0, RECENT_TRACK_LIMIT);
        state.aggregates[trackKey] = {
            track,
            playCount: (existingAggregate?.playCount || 0) + 1,
            lastPlayedAt: event.startedAt
        };

        this.lastRecordedSessionId = event.sessionId;
        this.saveState(state);
    }

    clearHistory(): RecentTrack[] {
        const state = this.loadState();
        state.recent = [];
        this.saveState(state);
        return [];
    }

    clearPlayStatistics(): void {
        const state = this.loadState();
        state.aggregates = {};
        this.saveState(state);
    }

    removeHistoryItem(trackPath: string): RecentTrack[] {
        const state = this.loadState();
        state.recent = state.recent.filter(item => getTrackPath(item) !== this.normalizePath(trackPath));
        this.saveState(state);
        return state.recent;
    }

    loadPlayCountStats(): PlayCountStats {
        return this.loadState().aggregates;
    }

    calculatePlayStats(tracks: Track[], recentTracks: RecentTrack[]): PlayStats {
        const playCountStats = this.loadPlayCountStats();
        const totalPlayCount = Object.values(playCountStats)
            .reduce((sum, aggregate) => sum + aggregate.playCount, 0);

        return {
            totalTracks: tracks.length,
            totalDuration: tracks.reduce((sum, track) => sum + (track.duration || 0), 0),
            favoriteArtist: this.getMostPlayedArtist(playCountStats),
            uniqueArtists: this.getUniqueArtists(tracks).length,
            uniqueAlbums: this.getUniqueAlbums(tracks).length,
            totalPlayedSongs: totalPlayCount,
            totalPlayedDuration: recentTracks.reduce((sum, track) => sum + (track.duration || 0), 0),
            mostPlayedTracks: this.getMostPlayedTracks(playCountStats, 5)
        };
    }

    getMostPlayedTracks(playCountStats: PlayCountStats, limit = 10): MostPlayedTrack[] {
        return Object.values(playCountStats)
            .sort((left, right) => (
                right.playCount - left.playCount
                || right.lastPlayedAt - left.lastPlayedAt
            ))
            .slice(0, limit)
            .map(({track, playCount}) => ({
                title: track.title || 'Unknown',
                artist: track.artist || 'Unknown',
                album: track.album || 'Unknown',
                playCount
            }));
    }

    getMostPlayedArtist(playCountStats: PlayCountStats): string {
        const artistCounts: Record<string, number> = {};
        Object.values(playCountStats).forEach(({track, playCount}) => {
            if (track.artist) {
                artistCounts[track.artist] = (artistCounts[track.artist] || 0) + playCount;
            }
        });

        return Object.entries(artistCounts)
            .sort(([, left], [, right]) => right - left)[0]?.[0] || '暂无';
    }

    getUniqueArtists(tracks: Track[]): string[] {
        return Array.from(new Set(tracks.map(track => track.artist).filter(Boolean)));
    }

    getUniqueAlbums(tracks: Track[]): string[] {
        return Array.from(new Set(tracks.map(track => track.album).filter(Boolean) as string[]));
    }

    subscribe(listener: HistoryChangedListener): () => void {
        this.listeners.add(listener);
        return () => this.listeners.delete(listener);
    }

    async confirmClearHistory(): Promise<boolean> {
        return await appConfirmationService.confirm({
            title: '清空最近播放记录',
            message: '确定要清空最近播放记录吗？累计播放统计不会受到影响。',
            confirmText: '清空',
            type: 'warning'
        });
    }

    async confirmClearPlayStatistics(): Promise<boolean> {
        return await appConfirmationService.confirm({
            title: '清空播放统计',
            message: '确定要清空累计播放次数吗？最近播放记录不会受到影响。',
            confirmText: '清空',
            type: 'warning'
        });
    }

    async confirmRemoveHistoryItem(trackTitle: string): Promise<boolean> {
        return await appConfirmationService.confirm({
            title: '移除最近播放记录',
            message: `确定要从最近播放中移除 "${trackTitle}" 吗？`,
            confirmText: '移除',
            type: 'warning'
        });
    }

    private loadState(): PlaybackHistoryState {
        try {
            const state = cacheManager.getLocalCache<PlaybackHistoryState>(PLAYBACK_HISTORY_STORAGE_KEY);
            if (
                state?.version === PLAYBACK_HISTORY_VERSION
                && Array.isArray(state.recent)
                && state.aggregates
                && typeof state.aggregates === 'object'
            ) {
                return {
                    version: PLAYBACK_HISTORY_VERSION,
                    recent: state.recent,
                    aggregates: state.aggregates
                };
            }
        } catch (error) {
            console.error('❌ RecentPlaybackHistoryService: 加载播放历史失败:', error);
        }

        return this.createEmptyState();
    }

    private saveState(state: PlaybackHistoryState): void {
        cacheManager.setLocalCache(PLAYBACK_HISTORY_STORAGE_KEY, state);
        this.listeners.forEach(listener => listener());
    }

    private createEmptyState(): PlaybackHistoryState {
        return {
            version: PLAYBACK_HISTORY_VERSION,
            recent: [],
            aggregates: {}
        };
    }

    private createTrackSnapshot(track: Track, playTime: number): RecentTrack {
        return {
            id: track.id,
            fileId: track.fileId,
            filePath: track.filePath,
            path: track.path,
            title: track.title || 'Unknown',
            artist: track.artist || 'Unknown',
            album: track.album,
            albumArtist: track.albumArtist,
            duration: track.duration,
            fileName: track.fileName,
            format: track.format,
            playTime
        };
    }

    private getTrackKey(track: Track): string {
        if (track.fileId) {
            return `file-id:${track.fileId}`;
        }

        return `path:${getTrackPath(track) || track.filePath}`;
    }

    private normalizePath(trackPath: string): string {
        return trackPath.trim().replace(/\\/g, '/');
    }
}

export const recentPlaybackHistoryService = new RecentPlaybackHistoryService();
