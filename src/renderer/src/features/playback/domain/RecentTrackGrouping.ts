import type {Track} from '@api/types/library';

export interface RecentTrack extends Track {
    playTime?: number;
    cover?: string | null;
}

export interface RecentTrackEntry {
    track: RecentTrack;
    index: number;
}

export type RecentTrackGroups = Record<string, RecentTrackEntry[]>;

export function groupRecentTracksByDate(tracks: RecentTrack[], now = new Date()): RecentTrackGroups {
    const groups: RecentTrackGroups = {};

    tracks.forEach((track, index) => {
        const playDate = new Date(track.playTime || now.getTime());
        const diffDays = Math.floor((now.getTime() - playDate.getTime()) / (1000 * 60 * 60 * 24));

        let dateKey: string;
        if (diffDays === 0) {
            dateKey = '今天';
        } else if (diffDays === 1) {
            dateKey = '昨天';
        } else if (diffDays < 7) {
            dateKey = `${diffDays} 天前`;
        } else if (diffDays < 30) {
            const weeks = Math.floor(diffDays / 7);
            dateKey = `${weeks} 周前`;
        } else {
            dateKey = playDate.toLocaleDateString('zh-CN', {
                year: 'numeric',
                month: 'long'
            });
        }

        if (!groups[dateKey]) groups[dateKey] = [];
        groups[dateKey].push({track, index});
    });

    return groups;
}
