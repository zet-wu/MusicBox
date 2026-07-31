import type {PlaylistSourceBinding} from '@api/types/electron';
import {appConfirmationService} from '@/features/appShell/service/AppConfirmationService';
import {appNotificationService} from '@/features/appShell/service/AppNotificationService';
import {libraryDataService} from '@/features/library/service/LibraryDataService';
import {mediaFileDialogService} from '@/features/media/service/MediaFileDialogService';

export class PlaylistBindingService {
    async getBindings(playlistId: string): Promise<PlaylistSourceBinding[]> {
        return await libraryDataService.getPlaylistBindings(playlistId);
    }

    async addBinding(playlistId: string): Promise<boolean> {
        const directoryPath = await mediaFileDialogService.openDirectory();
        if (!directoryPath) return false;

        appNotificationService.showInfo('正在绑定并扫描文件夹...');
        const result = await libraryDataService.bindDirectoryToPlaylist(playlistId, directoryPath);
        if (!result.success) {
            appNotificationService.showError(result.error || '绑定文件夹失败');
            return false;
        }
        appNotificationService.showSuccess('文件夹已绑定，歌曲将持续同步到歌单');
        return true;
    }

    async rescan(bindingId: string): Promise<boolean> {
        appNotificationService.showInfo('正在重新扫描绑定文件夹...');
        const result = await libraryDataService.rescanPlaylistBinding(bindingId);
        if (!result.success) {
            appNotificationService.showError(result.error || '重新扫描失败');
            return false;
        }
        appNotificationService.showSuccess('绑定文件夹扫描完成');
        return true;
    }

    async restoreExclusions(bindingId: string): Promise<boolean> {
        const result = await libraryDataService.restorePlaylistBindingExclusions(bindingId);
        if (!result.success) {
            appNotificationService.showError(result.error || '恢复排除歌曲失败');
            return false;
        }
        appNotificationService.showSuccess(`已恢复 ${result.restoredCount || 0} 首排除歌曲`);
        return true;
    }

    async unbind(binding: PlaylistSourceBinding, mode: 'keep' | 'remove'): Promise<boolean> {
        const keepTracks = mode === 'keep';
        const confirmed = await appConfirmationService.confirm({
            title: keepTracks ? '解绑并保留歌曲' : '解绑并移除歌曲',
            message: keepTracks
                ? '解绑后，当前由此文件夹加入的歌曲将转为手动歌单成员。文件夹仍保留为音乐库来源。'
                : '解绑后，仅由此绑定加入的歌曲将从该歌单移除。文件夹仍保留为音乐库来源，原始音频文件不会删除。',
            confirmText: keepTracks ? '解绑并保留' : '解绑并移除',
            cancelText: '取消',
            type: keepTracks ? 'warning' : 'danger'
        });
        if (!confirmed) return false;

        const result = await libraryDataService.unbindDirectoryFromPlaylist(binding.id, mode);
        if (!result.success) {
            appNotificationService.showError(result.error || '解绑文件夹失败');
            return false;
        }
        appNotificationService.showSuccess('文件夹绑定已解除');
        return true;
    }
}

export const playlistBindingService = new PlaylistBindingService();
