import {beforeEach, describe, expect, it, vi} from 'vitest';

vi.mock('electron', () => ({
    app: {
        getPath: () => '.'
    }
}));

import {
    FAVORITES_PLAYLIST_ID,
    LibraryCacheManager
} from '../../../main/services/library/LibraryCacheManager';

function createTrack(fileId, favorite = false) {
    return {
        fileId,
        filePath: `C:\\Music\\${fileId}.flac`,
        fileName: `${fileId}.flac`,
        fileSize: 100,
        lastModified: 1,
        addedToCache: 1,
        hasCover: false,
        title: fileId,
        favorite
    };
}

describe('LibraryCacheManager 系统收藏', () => {
    let manager;

    beforeEach(() => {
        manager = new LibraryCacheManager();
        manager.cache.tracks = [
            createTrack('legacy-favorite', true),
            createTrack('second')
        ];
    });

    it('自动创建固定系统歌单，并从普通歌单与统计中排除', () => {
        const favorites = manager.getPlaylistById(FAVORITES_PLAYLIST_ID);

        expect(favorites).toMatchObject({
            id: FAVORITES_PLAYLIST_ID,
            name: '收藏',
            systemType: 'favorites',
            trackIds: []
        });
        expect(manager.getAllPlaylists()).toEqual([]);
        expect(manager.getCacheStatistics().totalPlaylists).toBe(0);
    });

    it('仅以系统歌单派生收藏状态，不采用旧歌曲字段', () => {
        expect(manager.getTracks().map((track) => track.favorite)).toEqual([false, false]);
        expect(manager.getTracks({favorite: true})).toEqual([]);

        manager.setTrackFavorite('legacy-favorite', true);

        expect(manager.getTracks({favorite: true}).map((track) => track.fileId)).toEqual(['legacy-favorite']);
    });

    it('收藏设置幂等、去重并保持首次收藏顺序', () => {
        manager.setTrackFavorite('legacy-favorite', true);
        manager.setTrackFavorite('legacy-favorite', true);
        manager.setTrackFavorite('second', true);

        expect(manager.getPlaylistById(FAVORITES_PLAYLIST_ID)?.trackIds).toEqual([
            'legacy-favorite',
            'second'
        ]);

        manager.setTrackFavorite('legacy-favorite', false);
        manager.setTrackFavorite('legacy-favorite', false);
        expect(manager.getPlaylistById(FAVORITES_PLAYLIST_ID)?.trackIds).toEqual(['second']);
    });

    it('保护系统歌单元数据，但允许增删和清空歌曲', () => {
        expect(() => manager.renamePlaylist(FAVORITES_PLAYLIST_ID, '新名称')).toThrow('系统收藏歌单');
        expect(() => manager.deletePlaylist(FAVORITES_PLAYLIST_ID)).toThrow('系统收藏歌单');
        expect(() => manager.updatePlaylistCover(FAVORITES_PLAYLIST_ID, 'cover.png')).toThrow('系统收藏歌单');
        expect(() => manager.removePlaylistCover(FAVORITES_PLAYLIST_ID)).toThrow('系统收藏歌单');

        manager.addTrackToPlaylist(FAVORITES_PLAYLIST_ID, 'legacy-favorite');
        expect(manager.getPlaylistById(FAVORITES_PLAYLIST_ID)?.trackIds).toEqual(['legacy-favorite']);
        manager.removeTrackFromPlaylist(FAVORITES_PLAYLIST_ID, 'legacy-favorite');
        expect(manager.getPlaylistById(FAVORITES_PLAYLIST_ID)?.trackIds).toEqual([]);
    });

    it('同名普通歌单保持用户歌单身份', () => {
        const userPlaylist = manager.createPlaylist('收藏');

        expect(userPlaylist.systemType).toBeUndefined();
        expect(manager.getAllPlaylists()).toEqual([{
            ...userPlaylist,
            trackIds: [],
            resolvedTrackCount: 0
        }]);
        expect(manager.getCacheStatistics().totalPlaylists).toBe(1);
    });
});
