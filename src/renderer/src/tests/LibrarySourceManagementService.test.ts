import {beforeEach, describe, expect, it, vi} from 'vitest';
import type {LibraryDirectoryOverview} from '../api/types/electron';
import type {Track} from '../api/types/track';
import {appConfirmationService} from '../features/appShell/service/AppConfirmationService';
import {appNotificationService} from '../features/appShell/service/AppNotificationService';
import {libraryDataService} from '../features/library/service/LibraryDataService';
import {LibrarySourceManagementService} from '../features/library/service/LibrarySourceManagementService';
import {mediaFileDialogService} from '../features/media/service/MediaFileDialogService';

const source: LibraryDirectoryOverview = {
    id: 'directory-1',
    path: 'C:\\Music',
    origin: 'scan',
    createdAt: 1,
    trackCount: 12,
    bindings: [{
        id: 'binding-1',
        playlistId: 'playlist-1',
        playlistName: '收藏之外',
        availableTrackCount: 10,
        excludedTrackCount: 2,
        createdAt: 1
    }]
};

describe('LibrarySourceManagementService', () => {
    beforeEach(() => {
        vi.restoreAllMocks();
        vi.spyOn(appNotificationService, 'showInfo').mockImplementation(() => undefined);
        vi.spyOn(appNotificationService, 'showSuccess').mockImplementation(() => undefined);
        vi.spyOn(appNotificationService, 'showError').mockImplementation(() => undefined);
    });

    it('批量添加文件夹时保留部分成功结果', async () => {
        vi.spyOn(mediaFileDialogService, 'openDirectories')
            .mockResolvedValue(['C:\\Music', 'D:\\Unavailable']);
        const scan = vi.spyOn(libraryDataService, 'scanDirectory')
            .mockResolvedValueOnce(true)
            .mockResolvedValueOnce(false);
        const service = new LibrarySourceManagementService();

        const changed = await service.addDirectories();

        expect(scan).toHaveBeenNthCalledWith(1, 'C:\\Music');
        expect(scan).toHaveBeenNthCalledWith(2, 'D:\\Unavailable');
        expect(changed).toBe(true);
        expect(appNotificationService.showError).toHaveBeenCalledWith(expect.stringContaining('1 个扫描失败'));
    });

    it('取消选择文件夹时不触发扫描', async () => {
        vi.spyOn(mediaFileDialogService, 'openDirectories').mockResolvedValue([]);
        const scan = vi.spyOn(libraryDataService, 'scanDirectory');
        const service = new LibrarySourceManagementService();

        expect(await service.addDirectories()).toBe(false);
        expect(scan).not.toHaveBeenCalled();
    });

    it('确认后按来源 ID 移除且说明不会删除原始文件', async () => {
        const confirm = vi.spyOn(appConfirmationService, 'confirm').mockResolvedValue(true);
        const remove = vi.spyOn(libraryDataService, 'removeLibrarySource')
            .mockResolvedValue({success: true, removedTrackCount: 12});
        const service = new LibrarySourceManagementService();

        expect(await service.remove(source)).toBe(true);
        expect(confirm).toHaveBeenCalledWith(expect.objectContaining({
            message: expect.stringContaining('原始音频文件不会被删除')
        }));
        expect(remove).toHaveBeenCalledWith(source.id);
    });

    it('把已有来源直接绑定到目标歌单', async () => {
        const bind = vi.spyOn(libraryDataService, 'bindLibrarySourceToPlaylist')
            .mockResolvedValue({success: true});
        const service = new LibrarySourceManagementService();

        expect(await service.bindToPlaylist(source.id, 'playlist-2')).toBe(true);
        expect(bind).toHaveBeenCalledWith('playlist-2', source.id);
    });

    it('按来源 ID 获取详情歌曲', async () => {
        const tracks = [{fileId: 'track-1', title: '歌曲一'} as Track];
        const getTracks = vi.spyOn(libraryDataService, 'getTracksByLibrarySource')
            .mockResolvedValue(tracks);
        const service = new LibrarySourceManagementService();

        await expect(service.getTracks(source.id)).resolves.toEqual(tracks);
        expect(getTracks).toHaveBeenCalledWith(source.id);
    });
});
