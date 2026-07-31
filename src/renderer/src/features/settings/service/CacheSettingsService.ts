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

    async clearLibraryIndex(): Promise<CacheActionDisplay> {
        const result = await cacheMaintenanceService.clearLibraryIndex();
        return {
            success: result.success,
            message: result.success
                ? `音乐库索引已清除，共移除 ${result.clearedTrackCount || 0} 首歌曲`
                : result.error || '清除音乐库索引失败',
            description: result.success
                ? '歌单、收藏、忽略列表和音乐文件夹设置已保留；请重新扫描音乐文件夹以恢复歌曲。'
                : undefined
        };
    }
}

export const cacheSettingsService = new CacheSettingsService();
