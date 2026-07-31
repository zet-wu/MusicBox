import type {LibraryDirectoryOverview} from '@api/types/electron';
import type {Unsubscribe} from '@api/types/common';
import {appConfirmationService, appNotificationService} from '@/features/appShell/service';
import {mediaFileDialogService} from '@/features/media/service/MediaFileDialogService';
import {systemGateway} from '@/infrastructure/electron/SystemGateway';
import {libraryDataService} from './LibraryDataService';

export class LibrarySourceManagementService {
    getDirectories(): Promise<LibraryDirectoryOverview[]> {
        return libraryDataService.getLibraryDirectoryOverviews();
    }

    onSourcesUpdated(handler: () => void): Unsubscribe {
        return libraryDataService.onSourcesUpdated(handler);
    }

    async addDirectories(): Promise<boolean> {
        const paths = await mediaFileDialogService.openDirectories();
        if (paths.length === 0) return false;

        appNotificationService.showInfo(`正在添加并扫描 ${paths.length} 个文件夹...`);
        let successCount = 0;
        const failedPaths: string[] = [];
        for (const directoryPath of paths) {
            if (await libraryDataService.scanDirectory(directoryPath)) {
                successCount++;
            } else {
                failedPaths.push(directoryPath);
            }
        }

        if (failedPaths.length === 0) {
            appNotificationService.showSuccess(`已添加并扫描 ${successCount} 个文件夹`);
        } else if (successCount > 0) {
            appNotificationService.showError(`已添加 ${successCount} 个文件夹，${failedPaths.length} 个扫描失败`);
        } else {
            appNotificationService.showError('添加文件夹失败，请检查目录是否可访问');
        }
        return successCount > 0;
    }

    async rescan(source: LibraryDirectoryOverview): Promise<boolean> {
        appNotificationService.showInfo(`正在扫描 ${this.getDisplayName(source.path)}...`);
        const result = await libraryDataService.rescanLibrarySource(source.id);
        if (!result.success) {
            appNotificationService.showError(result.error || '重新扫描文件夹失败');
            return false;
        }
        appNotificationService.showSuccess('文件夹扫描完成');
        return true;
    }

    async remove(source: LibraryDirectoryOverview): Promise<boolean> {
        const confirmed = await appConfirmationService.confirm({
            title: '移除音乐源',
            message: `确定要移除此音乐文件夹吗？\n\n${source.path}\n\n将同时解除 ${source.bindings.length} 个歌单绑定，并移除仅由此来源覆盖的索引歌曲。原始音频文件不会被删除。`,
            confirmText: '移除',
            cancelText: '取消',
            type: 'warning'
        });
        if (!confirmed) return false;

        const result = await libraryDataService.removeLibrarySource(source.id);
        if (!result.success) {
            appNotificationService.showError(result.error || '移除音乐源失败');
            return false;
        }
        appNotificationService.showSuccess(`音乐源已移除，共清理 ${result.removedTrackCount || 0} 首索引歌曲`);
        return true;
    }

    async open(source: LibraryDirectoryOverview): Promise<boolean> {
        const result = await systemGateway.openPath(source.path);
        if (!result.success) {
            appNotificationService.showError(result.error || '无法打开文件夹');
            return false;
        }
        return true;
    }

    async bindToPlaylist(sourceId: string, playlistId: string): Promise<boolean> {
        const result = await libraryDataService.bindLibrarySourceToPlaylist(playlistId, sourceId);
        if (!result.success) {
            appNotificationService.showError(result.error || '绑定歌单失败');
            return false;
        }
        appNotificationService.showSuccess('文件夹已绑定到歌单');
        return true;
    }

    private getDisplayName(sourcePath: string): string {
        return sourcePath.replace(/[\\/]+$/, '').split(/[\\/]/).pop() || sourcePath;
    }
}

export const librarySourceManagementService = new LibrarySourceManagementService();
