import {afterEach, describe, expect, it, vi} from 'vitest';
import {libraryGateway} from '../infrastructure/electron';
import {
    LibraryDataService,
    libraryDataService
} from '../features/library/service/LibraryDataService';
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
});
