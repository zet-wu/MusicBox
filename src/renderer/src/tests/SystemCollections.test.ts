import {describe, expect, it} from 'vitest';
import {
    getCollectionCapabilities
} from '../features/playlists/domain/CollectionCapabilities';
import {
    resolvePlaylistDoubleClickMode
} from '../features/playlists/domain/PlaylistDoubleClickMode';

describe('系统歌曲页面', () => {
    it('普通歌单、收藏和全部歌曲具有各自的页面能力', () => {
        expect(getCollectionCapabilities('playlist')).toEqual({
            canAddSongs: true,
            canClear: true,
            canEditCover: true,
            canRemoveTracks: true,
            showCreatedDate: true
        });
        expect(getCollectionCapabilities('favorites')).toEqual({
            canAddSongs: true,
            canClear: true,
            canEditCover: false,
            canRemoveTracks: false,
            showCreatedDate: false
        });
        expect(getCollectionCapabilities('all-tracks')).toEqual({
            canAddSongs: false,
            canClear: false,
            canEditCover: false,
            canRemoveTracks: false,
            showCreatedDate: false
        });
    });

    it('系统页面复用歌单双击播放模式设置', () => {
        expect(resolvePlaylistDoubleClickMode({playlistDoubleClickMode: 'sequence'})).toBe('sequence');
        expect(resolvePlaylistDoubleClickMode({playlistDoubleClickMode: 'shuffle'})).toBe('shuffle');
        expect(resolvePlaylistDoubleClickMode(undefined)).toBe('shuffle');
    });
});
