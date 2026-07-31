import {cacheMaintenanceService} from "./CacheMaintenanceService";

interface CacheStatisticsDisplay {
    success: boolean;
    description?: string;
    toastMessage?: string;
    error?: string;
}

interface CacheActionDisplay {
    success: boolean;
    message: string;
    description?: string;
}

class CacheSettingsService {
    async getStatisticsDisplay(): Promise<CacheStatisticsDisplay> {
        const stats = await cacheMaintenanceService.getStatistics();
        if (!stats) {
            return {
                success: false,
                error: '获取缓存统计失败'
            };
        }

        const totalSizeMB = (stats.totalSize / (1024 * 1024)).toFixed(2);
        const cacheAgeDays = Math.floor((stats.cacheAge || 0) / (1000 * 60 * 60 * 24));

        return {
            success: true,
            description: `缓存了 ${stats.totalTracks} 个音乐文件，总大小 ${totalSizeMB} MB，已扫描 ${stats.scannedDirectories || 0} 个目录，缓存时间 ${cacheAgeDays} 天`,
            toastMessage: `缓存统计: ${stats.totalTracks} 个文件，${totalSizeMB} MB`
        };
    }

    async validateCache(): Promise<CacheActionDisplay> {
        const result = await cacheMaintenanceService.validate();
        if (!result) {
            return {
                success: false,
                message: '缓存验证失败'
            };
        }

        return {
            success: true,
            message: `缓存验证完成 - 有效: ${result.valid}, 无效: ${result.invalid}, 已修改: ${result.modified}`
        };
    }

    async rebuildLibraryIndex(): Promise<CacheActionDisplay> {
        const result = await cacheMaintenanceService.rebuildLibraryIndex();
        if (result.state === 'no_folders') {
            return {
                success: true,
                message: '音乐库索引已清除',
                description: '未配置音乐文件夹，当前音乐库为空；歌单、收藏、忽略列表和原始音乐文件均已保留。'
            };
        }

        if (result.state === 'partial') {
            return {
                success: true,
                message: `音乐库索引已部分重建，恢复 ${result.rebuiltTrackCount} 首歌曲`,
                description: `${result.scannedFolderCount}/${result.configuredFolderCount} 个音乐文件夹扫描成功；失败目录：${result.failedFolders.join('、')}`
            };
        }

        return {
            success: result.success,
            message: result.success
                ? `音乐库索引已重建，共恢复 ${result.rebuiltTrackCount} 首歌曲`
                : result.error || '重建音乐库索引失败',
            description: result.success
                ? `已扫描 ${result.scannedFolderCount} 个音乐文件夹；歌单、收藏、忽略列表和原始音乐文件均已保留。`
                : undefined
        };
    }

    async clearCoverCache(): Promise<CacheActionDisplay> {
        const result = await cacheMaintenanceService.clearCoverCache();
        return {
            success: result.success,
            message: result.success
                ? `封面缓存已清除，共删除 ${result.deletedFileCount} 个磁盘缓存项`
                : result.error || '清除封面缓存失败',
            description: result.success && result.preservedUnknownFileCount > 0
                ? `已保留 ${result.preservedUnknownFileCount} 个无法确认归属的文件。`
                : result.success ? '内存封面、Blob URL 和应用管理的磁盘封面缓存已释放。' : undefined
        };
    }
}

export const cacheSettingsService = new CacheSettingsService();
