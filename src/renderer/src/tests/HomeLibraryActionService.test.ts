import {beforeEach, describe, expect, it, vi} from 'vitest';
import {HomeLibraryActionService} from '../features/library/service/HomeLibraryActionService';
import {libraryService} from '../features/library/service/LibraryService';
import {mediaFileDialogService} from '../features/media/service/MediaFileDialogService';

describe('HomeLibraryActionService', () => {
    beforeEach(() => {
        vi.restoreAllMocks();
    });

    it('依次扫描主页同时选择的多个音乐文件夹', async () => {
        vi.spyOn(mediaFileDialogService, 'openDirectories')
            .mockResolvedValue(['C:\\Music', 'D:\\Albums']);
        const scanDirectory = vi.spyOn(libraryService, 'scanDirectory')
            .mockResolvedValue(true);
        vi.spyOn(libraryService, 'getTracks').mockResolvedValue([]);
        const service = new HomeLibraryActionService();

        const result = await service.scanSelectedFolders();

        expect(scanDirectory).toHaveBeenNthCalledWith(1, 'C:\\Music');
        expect(scanDirectory).toHaveBeenNthCalledWith(2, 'D:\\Albums');
        expect(result.changed).toBe(true);
    });

    it('选择多个文件夹时允许部分扫描成功', async () => {
        vi.spyOn(mediaFileDialogService, 'openDirectories')
            .mockResolvedValue(['C:\\Music', 'D:\\Albums']);
        vi.spyOn(libraryService, 'scanDirectory')
            .mockResolvedValueOnce(true)
            .mockResolvedValueOnce(false);
        const getTracks = vi.spyOn(libraryService, 'getTracks').mockResolvedValue([]);
        const service = new HomeLibraryActionService();

        const result = await service.scanSelectedFolders();

        expect(result.changed).toBe(true);
        expect(getTracks).toHaveBeenCalledOnce();
    });
});
