import {beforeEach, describe, expect, it, vi} from 'vitest';
import {appNotificationService} from '../features/appShell/service/AppNotificationService';
import {libraryDataService} from '../features/library/service/LibraryDataService';
import {mediaFileDialogService} from '../features/media/service/MediaFileDialogService';
import {PlaylistFileImportService} from '../features/playlists/service/PlaylistFileImportService';

describe('PlaylistFileImportService', () => {
    beforeEach(() => {
        vi.restoreAllMocks();
        vi.spyOn(appNotificationService, 'showInfo').mockImplementation(() => undefined);
        vi.spyOn(appNotificationService, 'showSuccess').mockImplementation(() => undefined);
        vi.spyOn(appNotificationService, 'showError').mockImplementation(() => undefined);
    });

    it('把系统对话框选择的多个文件作为精确来源导入目标歌单', async () => {
        const filePaths = ['C:\\Music\\one.flac', 'C:\\Music\\two.mp3'];
        vi.spyOn(mediaFileDialogService, 'openFiles').mockResolvedValue(filePaths);
        const importLibraryFiles = vi.spyOn(libraryDataService, 'importLibraryFiles').mockResolvedValue({
            success: true,
            tracks: [{fileId: 'one'}, {fileId: 'two'}] as any,
            failedPaths: []
        });
        const service = new PlaylistFileImportService();

        const result = await service.addFromFiles('playlist-1');

        expect(importLibraryFiles).toHaveBeenCalledOnce();
        expect(importLibraryFiles).toHaveBeenCalledWith(filePaths, 'playlist-1');
        expect(result.changed).toBe(true);
    });

    it('用户取消文件选择时不调用导入 API', async () => {
        vi.spyOn(mediaFileDialogService, 'openFiles').mockResolvedValue([]);
        const importLibraryFiles = vi.spyOn(libraryDataService, 'importLibraryFiles');
        const service = new PlaylistFileImportService();

        const result = await service.addFromFiles('playlist-1');

        expect(importLibraryFiles).not.toHaveBeenCalled();
        expect(result.changed).toBe(false);
    });
});
