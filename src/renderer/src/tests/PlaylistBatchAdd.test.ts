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

    it('从文件夹创建歌单后自动绑定且不重复手工加歌', async () => {
        vi.spyOn(libraryDataService, 'createPlaylist').mockResolvedValue({
            success: true,
            playlist
        });
        const addToPlaylist = vi.spyOn(libraryDataService, 'addToPlaylist');
        const bind = vi.spyOn(libraryDataService, 'bindLibrarySourceToPlaylist')
            .mockResolvedValue({success: true});
        const service = new PlaylistDialogActionService();

        const result = await service.createPlaylist('测试歌单', '', tracks, 'source-1');

        expect(result).toMatchObject({success: true, playlist});
        expect(bind).toHaveBeenCalledWith(playlist.id, 'source-1');
        expect(addToPlaylist).not.toHaveBeenCalled();
    });

    it('绑定失败时保留已创建歌单并返回部分失败信息', async () => {
        vi.spyOn(libraryDataService, 'createPlaylist').mockResolvedValue({
            success: true,
            playlist
        });
        vi.spyOn(libraryDataService, 'bindLibrarySourceToPlaylist').mockResolvedValue({
            success: false,
            error: '来源已删除'
        });
        const service = new PlaylistDialogActionService();

        await expect(service.createPlaylist('测试歌单', '', [], 'missing-source')).resolves.toEqual({
            success: false,
            playlist,
            bindingError: '来源已删除'
        });
    });

    it('创建歌单失败时不尝试绑定来源', async () => {
        vi.spyOn(libraryDataService, 'createPlaylist').mockResolvedValue({
            success: false,
            error: '歌单名称已存在'
        });
        const bind = vi.spyOn(libraryDataService, 'bindLibrarySourceToPlaylist');
        const service = new PlaylistDialogActionService();

        await expect(service.createPlaylist('测试歌单', '', [], 'source-1')).resolves.toMatchObject({
            success: false,
            error: '歌单名称已存在'
        });
        expect(bind).not.toHaveBeenCalled();
    });
});
