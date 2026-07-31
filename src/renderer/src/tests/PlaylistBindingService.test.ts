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

    it('把所选文件夹绑定到目标歌单', async () => {
        vi.spyOn(mediaFileDialogService, 'openDirectory').mockResolvedValue('C:\\Music');
        const bindDirectory = vi.spyOn(libraryDataService, 'bindDirectoryToPlaylist')
            .mockResolvedValue({success: true, binding});
        const service = new PlaylistBindingService();

        const changed = await service.addBinding('playlist-1');

        expect(bindDirectory).toHaveBeenCalledWith('playlist-1', 'C:\\Music');
        expect(changed).toBe(true);
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
