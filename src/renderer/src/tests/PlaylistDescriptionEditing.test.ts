import {afterEach, describe, expect, it, vi} from 'vitest';
import {libraryGateway} from '../infrastructure/electron';
import {
    LibraryDataService,
    libraryDataService
} from '../features/library/service/LibraryDataService';
import {PlaylistController} from '../features/playlists/PlaylistController';
import {PlaylistDialogActionService} from '../features/playlists/service/PlaylistDialogActionService';

describe('歌单描述编辑', () => {
    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('从编辑对话框操作服务向数据服务传递描述', async () => {
        const renamePlaylist = vi.spyOn(libraryDataService, 'renamePlaylist')
            .mockResolvedValue({success: true});
        const service = new PlaylistDialogActionService();

        await service.renamePlaylist('playlist-id', '新歌单名', '新的歌单描述');

        expect(renamePlaylist).toHaveBeenCalledWith(
            'playlist-id',
            '新歌单名',
            '新的歌单描述'
        );
    });

    it('从数据服务向 Electron 网关传递描述', async () => {
        const renamePlaylist = vi.spyOn(libraryGateway, 'renamePlaylist')
            .mockResolvedValue({success: true});
        const service = new LibraryDataService();

        await service.renamePlaylist('playlist-id', '新歌单名', '新的歌单描述');

        expect(renamePlaylist).toHaveBeenCalledWith(
            'playlist-id',
            '新歌单名',
            '新的歌单描述'
        );
    });

    it('编辑当前活动歌单后立即更新详情页并刷新侧边栏', async () => {
        const updatePlaylistDetailInfo = vi.fn(() => true);
        const refreshNavigationPlaylists = vi.fn(async () => undefined);
        const controller = new PlaylistController({
            app: {currentView: 'playlist-detail'},
            playback: {},
            ui: {updatePlaylistDetailInfo, refreshNavigationPlaylists}
        } as any);
        const playlist = {
            id: 'playlist-id',
            name: '新歌单名',
            description: '第一行\n第二行',
            tracks: []
        };

        await controller.handlePlaylistRenamed(playlist);

        expect(updatePlaylistDetailInfo).toHaveBeenCalledWith(playlist);
        expect(refreshNavigationPlaylists).toHaveBeenCalledOnce();
    });

    it('编辑非活动歌单时只刷新侧边栏', async () => {
        const updatePlaylistDetailInfo = vi.fn(() => true);
        const refreshNavigationPlaylists = vi.fn(async () => undefined);
        const controller = new PlaylistController({
            app: {currentView: 'home'},
            playback: {},
            ui: {updatePlaylistDetailInfo, refreshNavigationPlaylists}
        } as any);

        await controller.handlePlaylistRenamed({
            id: 'playlist-id',
            name: '新歌单名',
            description: '新的歌单描述',
            tracks: []
        });

        expect(updatePlaylistDetailInfo).not.toHaveBeenCalled();
        expect(refreshNavigationPlaylists).toHaveBeenCalledOnce();
    });
});
