import {beforeEach, describe, expect, it, vi} from 'vitest';
import {libraryDataService} from '../features/library/service/LibraryDataService';
import {PlaylistDialogActionService} from '../features/playlists/service/PlaylistDialogActionService';
import type {Playlist, Track} from '../api/types/library';

const playlist: Playlist = {
    id: 'playlist-1',
    name: '测试歌单',
    description: '',
    trackIds: [],
    createdAt: 1
};

const tracks = [
    {fileId: 'track-1', title: '一'} as Track,
    {fileId: 'track-2', title: '二'} as Track
];

describe('PlaylistDialogActionService 批量加入歌单', () => {
    beforeEach(() => {
        vi.restoreAllMocks();
    });

    it('一次提交全部选中歌曲', async () => {
        const addToPlaylist = vi.spyOn(libraryDataService, 'addToPlaylist').mockResolvedValue({
            success: true,
            results: [
                {id: 'track-1', success: true},
                {id: 'track-2', success: true}
            ]
        } as any);
        const service = new PlaylistDialogActionService();

        const result = await service.addTracksToPlaylist(playlist.id, tracks, [playlist]);

        expect(addToPlaylist).toHaveBeenCalledOnce();
        expect(addToPlaylist).toHaveBeenCalledWith(playlist.id, ['track-1', 'track-2']);
        expect(result).toMatchObject({success: true, addedCount: 2, playlist});
    });

    it('新建歌单后一次提交全部歌曲', async () => {
        vi.spyOn(libraryDataService, 'createPlaylist').mockResolvedValue({
            success: true,
            playlist
        });
        const addToPlaylist = vi.spyOn(libraryDataService, 'addToPlaylist').mockResolvedValue({
            success: true
        });
        const service = new PlaylistDialogActionService();

        await service.createPlaylist('测试歌单', '', tracks);

        expect(addToPlaylist).toHaveBeenCalledOnce();
        expect(addToPlaylist).toHaveBeenCalledWith(playlist.id, ['track-1', 'track-2']);
    });
});
