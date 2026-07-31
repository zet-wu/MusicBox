import {appNotificationService} from '@/features/appShell/service/AppNotificationService';
import {libraryDataService} from '@/features/library/service/LibraryDataService';
import {mediaFileDialogService} from '@/features/media/service/MediaFileDialogService';

export interface PlaylistFileImportResult {
    changed: boolean;
}

export class PlaylistFileImportService {
    async addFromFiles(playlistId: string): Promise<PlaylistFileImportResult> {
        try {
            const filePaths = await mediaFileDialogService.openFiles();
            if (filePaths.length === 0) return {changed: false};

            appNotificationService.showInfo(`正在导入 ${filePaths.length} 个音乐文件...`);
            const result = await libraryDataService.importLibraryFiles(filePaths, playlistId);
            const importedCount = result.tracks.length;
            const failedCount = result.failedPaths.length;

            if (importedCount === 0) {
                appNotificationService.showError(result.error || '没有可导入的音乐文件');
                return {changed: false};
            }

            const message = failedCount > 0
                ? `已添加 ${importedCount} 首歌曲，${failedCount} 个文件失败`
                : `已添加 ${importedCount} 首歌曲到歌单`;
            appNotificationService.showSuccess(message);
            return {changed: true};
        } catch (error) {
            console.error('❌ PlaylistFileImportService: 从文件添加音乐失败', error);
            appNotificationService.showError('从文件添加音乐失败，请重试');
            return {changed: false};
        }
    }
}

export const playlistFileImportService = new PlaylistFileImportService();
