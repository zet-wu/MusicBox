import {describe, expect, it} from 'vitest';
import {
    getCollectionCapabilities
} from '../features/playlists/domain/CollectionCapabilities';

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
            canAddSongs: false,
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
});
