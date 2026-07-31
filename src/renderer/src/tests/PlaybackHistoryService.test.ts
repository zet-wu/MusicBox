import {beforeEach, describe, expect, it} from 'vitest';
import type {PlaybackStartedEvent} from '../api/types/events';
import type {Track} from '../api/types/track';
import {RecentPlaybackHistoryService} from '../features/playback/service/RecentPlaybackHistoryService';

class MemoryStorage {
    private readonly data = new Map<string, string>();

    get length(): number {
        return this.data.size;
    }

    clear(): void {
        this.data.clear();
    }

    getItem(key: string): string | null {
        return this.data.get(key) ?? null;
    }

    key(index: number): string | null {
        return Array.from(this.data.keys())[index] ?? null;
    }

    removeItem(key: string): void {
        this.data.delete(key);
    }

    setItem(key: string, value: string): void {
        this.data.set(key, value);
    }
}

function createTrack(index: number, artist = `艺术家 ${index}`): Track {
    return {
        fileId: `track-${index}`,
        filePath: `C:\\Music\\track-${index}.flac`,
        title: `歌曲 ${index}`,
        artist,
        album: `专辑 ${index}`,
        duration: 180
    };
}

function createPlaybackStartedEvent(
    track: Track,
    sessionId: string,
    startedAt = Date.now()
): PlaybackStartedEvent {
    return {track, sessionId, startedAt};
}

describe('RecentPlaybackHistoryService', () => {
    let service: RecentPlaybackHistoryService;

    beforeEach(() => {
        Object.defineProperty(globalThis, 'localStorage', {
            configurable: true,
            value: new MemoryStorage()
        });
        service = new RecentPlaybackHistoryService();
    });

    it('不读取或迁移旧版播放历史缓存', () => {
        localStorage.setItem('musicbox_cache_musicbox-play-history', JSON.stringify({
            data: [createTrack(1)]
        }));
        localStorage.setItem('musicbox_cache_musicbox-play-count-stats', JSON.stringify({
            data: {'歌曲 1_艺术家 1_专辑 1': 12}
        }));

        expect(service.loadHistory()).toEqual([]);
        expect(service.loadPlayCountStats()).toEqual({});
    });

    it('最近播放只保留最新 100 首而累计统计不受上限影响', () => {
        for (let index = 1; index <= 101; index += 1) {
            service.recordPlaybackStarted(createPlaybackStartedEvent(
                createTrack(index),
                `session-${index}`,
                index
            ));
        }

        const recentTracks = service.loadHistory();
        expect(recentTracks).toHaveLength(100);
        expect(recentTracks[0].fileId).toBe('track-101');
        expect(recentTracks.at(-1)?.fileId).toBe('track-2');
        expect(Object.keys(service.loadPlayCountStats())).toHaveLength(101);
        expect(service.calculatePlayStats([], recentTracks).totalPlayedSongs).toBe(101);
    });

    it('同一会话只记录一次，新会话会累计并把歌曲移到顶部', () => {
        const firstTrack = createTrack(1, '共同艺术家');
        const secondTrack = createTrack(2, '共同艺术家');

        service.recordPlaybackStarted(createPlaybackStartedEvent(firstTrack, 'session-1', 1));
        service.recordPlaybackStarted(createPlaybackStartedEvent(firstTrack, 'session-1', 1));
        service.recordPlaybackStarted(createPlaybackStartedEvent(secondTrack, 'session-2', 2));
        service.recordPlaybackStarted(createPlaybackStartedEvent(firstTrack, 'session-3', 3));

        const recentTracks = service.loadHistory();
        const stats = service.calculatePlayStats([], recentTracks);

        expect(recentTracks.map(track => track.fileId)).toEqual(['track-1', 'track-2']);
        expect(stats.totalPlayedSongs).toBe(3);
        expect(stats.favoriteArtist).toBe('共同艺术家');
        expect(stats.mostPlayedTracks[0]).toMatchObject({
            title: '歌曲 1',
            playCount: 2
        });
    });

    it('最近记录与累计统计可以分别清空', () => {
        const track = createTrack(1);
        service.recordPlaybackStarted(createPlaybackStartedEvent(track, 'session-1'));

        service.clearHistory();
        expect(service.loadHistory()).toEqual([]);
        expect(service.calculatePlayStats([], []).totalPlayedSongs).toBe(1);

        service.recordPlaybackStarted(createPlaybackStartedEvent(track, 'session-2'));
        service.clearPlayStatistics();
        expect(service.loadHistory()).toHaveLength(1);
        expect(service.loadPlayCountStats()).toEqual({});
    });
});
