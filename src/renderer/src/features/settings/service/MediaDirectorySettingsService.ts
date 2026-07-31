import {settingsShellService} from "@/features/appShell/service";
import {localCoverManager} from "@/features/mediaAssets/service/LocalCoverManager";
import {localLyricsManager} from "@/features/mediaAssets/service/LocalLyricsManager";
import {mediaAssetsService} from "@/features/mediaAssets/service/MediaAssetsService";

interface DirectoryResult {
    directory: string | null;
    shouldPersist: boolean;
    error?: string;
}

class MediaDirectorySettingsService {
    async selectDirectory(): Promise<string | null> {
        const result = await settingsShellService.selectFolder();
        if (!result || !result.filePaths || result.filePaths.length === 0) {
            return null;
        }

        return result.filePaths[0];
    }

    applyLyricsDirectory(directory: string): void {
        localLyricsManager.setLyricsDirectory(directory);
    }

    applyCoverDirectory(directory: string): void {
        localCoverManager.setCoverDirectory(directory);
    }

    async resolveCoverCacheDirectory(savedDirectory: string | null): Promise<DirectoryResult> {
        const resolved = await mediaAssetsService.resolveCoverCacheDirectory(savedDirectory);
        if (!resolved.success || !resolved.path) {
            return {
                directory: null,
                shouldPersist: false,
                error: resolved.error || '获取封面缓存路径失败'
            };
        }

        return {
            directory: resolved.path,
            shouldPersist: !savedDirectory
        };
    }
}

export const mediaDirectorySettingsService = new MediaDirectorySettingsService();
