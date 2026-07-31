import {beforeEach, describe, expect, it, vi} from 'vitest';
import type {PlaylistSourceBinding} from '../api/types/electron';
import {appConfirmationService} from '../features/appShell/service/AppConfirmationService';
import {appNotificationService} from '../features/appShell/service/AppNotificationService';
import {libraryDataService} from '../features/library/service/LibraryDataService';
import {mediaFileDialogService} from '../features/media/service/MediaFileDialogService';
import {PlaylistBindingService} from '../features/playlists/service/PlaylistBindingService';

const binding = {
    id: 'binding-1',
    playlistId: 'playlist-1',
    sourceId: 'source-1',
    managedFiles: [],
    excludedPaths: [],
    createdAt: 1
} as PlaylistSourceBinding;

describe('PlaylistBindingService', () => {
    beforeEach(() => {
        vi.restoreAllMocks();
        vi.spyOn(appNotificationService, 'showInfo').mockImplementation(() => undefined);
        vi.spyOn(appNotificationService, 'showSuccess').mockImplementation(() => undefined);
        vi.spyOn(appNotificationService, 'showError').mockImplementation(() => undefined);
    });

    it('把同时选择的多个文件夹依次绑定到目标歌单', async () => {
        vi.spyOn(mediaFileDialogService, 'openDirectories')
            .mockResolvedValue(['C:\\Music', 'D:\\Albums']);
        const bindDirectory = vi.spyOn(libraryDataService, 'bindDirectoryToPlaylist')
            .mockResolvedValue({success: true, binding});
        const service = new PlaylistBindingService();

        const changed = await service.addBindings('playlist-1');

        expect(bindDirectory).toHaveBeenNthCalledWith(1, 'playlist-1', 'C:\\Music');
        expect(bindDirectory).toHaveBeenNthCalledWith(2, 'playlist-1', 'D:\\Albums');
        expect(changed).toBe(true);
    });

    it('批量绑定部分失败时保留成功结果并报告失败', async () => {
        vi.spyOn(mediaFileDialogService, 'openDirectories')
            .mockResolvedValue(['C:\\Music', 'D:\\Albums']);
        vi.spyOn(libraryDataService, 'bindDirectoryToPlaylist')
            .mockResolvedValueOnce({success: true, binding})
            .mockResolvedValueOnce({success: false, error: '目录不可访问'});
        const showError = vi.spyOn(appNotificationService, 'showError');
        const service = new PlaylistBindingService();

        const changed = await service.addBindings('playlist-1');

        expect(changed).toBe(true);
        expect(showError).toHaveBeenCalledWith(expect.stringContaining('1 个失败'));
    });

    it('解绑移除模式必须经过危险操作确认', async () => {
        vi.spyOn(appConfirmationService, 'confirm').mockResolvedValue(true);
        const unbind = vi.spyOn(libraryDataService, 'unbindDirectoryFromPlaylist')
            .mockResolvedValue({success: true});
        const service = new PlaylistBindingService();

        const changed = await service.unbind(binding, 'remove');

        expect(appConfirmationService.confirm).toHaveBeenCalledWith(expect.objectContaining({
            type: 'danger',
            confirmText: '解绑并移除'
        }));
        expect(unbind).toHaveBeenCalledWith(binding.id, 'remove');
        expect(changed).toBe(true);
    });
});
