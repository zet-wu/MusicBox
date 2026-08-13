import {libraryGateway} from '@/infrastructure/electron';
import type {Result} from '@api/types/common';
import type {LibraryIndexRebuildResult} from '@api/types/electron';
import type {CacheValidationResult, MusicBoxAPIEvents, ScanProgress} from '@api/types/events';
import type {Track} from '@api/types/track';
import {libraryDataService, type PlaylistCoverDataResult} from './LibraryDataService';

type Emit = <K extends keyof MusicBoxAPIEvents>(event: K, data: MusicBoxAPIEvents[K]) => void;

interface LibraryBridgeOptions {
    emit: Emit;
}

export class LibraryBridge {
    private readonly emit: Emit;

    constructor({emit}: LibraryBridgeOptions) {
        this.emit = emit;
    }

    bindEvents(): void {
        if (!libraryGateway.isAvailable()) {
            return;
        }

        libraryGateway.onLibraryUpdated((data) => {
            this.emit('libraryUpdated', data);
        });

        libraryGateway.onScanProgress((progress) => {
            this.emit('scanProgress', progress);
        });
    }

    async scanDirectory(path: string): Promise<boolean> {
        try {
            // 音乐库更新由主进程的 library:updated 统一发布。
            return await libraryDataService.scanDirectory(path);
        } catch (error) {
            console.error('Failed to scan directory:', error);
            return false;
        }
    }

    async scanNetworkDrive(driveId: string | number, relativePath = '/'): Promise<boolean> {
        try {
            return await libraryDataService.scanNetworkDrive(driveId, relativePath);
        } catch (error) {
            console.error('❌ 网络磁盘扫描失败:', error);
            return false;
        }
    }

    async addTrackToLibrary(audioFile: Partial<Track> | unknown): Promise<{success: boolean; track?: Track; error?: string; isNew?: boolean}> {
        try {
            return await libraryDataService.addTrackToLibrary(audioFile);
        } catch (error) {
            console.error('❌ [API] 添加文件到音乐库失败:', error);
            return {success: false, error: error instanceof Error ? error.message : String(error)};
        }
    }

    async loadCachedTracks(): Promise<Track[]> {
        try {
            const tracks = await libraryDataService.loadCachedTracks();
            if (tracks && tracks.length > 0) {
                return tracks;
            }
            return [];
        } catch (error) {
            console.error('❌ 加载缓存音乐库失败:', error);
            return [];
        }
    }

    async validateCache(): Promise<CacheValidationResult | null> {
        try {
            const progressListener = libraryGateway.onCacheValidationProgress((progress: ScanProgress) => {
                this.emit('cacheValidationProgress', progress);
            });

            const result = await libraryGateway.validateCache();

            if (progressListener) {
                progressListener();
            }

            if (result) {
                console.log(`✅ 缓存验证完成 - 有效: ${result.valid}, 无效: ${result.invalid}, 已修改: ${result.modified}`);
                this.emit('cacheValidationCompleted', result);

                if (result.tracks && result.invalid > 0) {
                    this.emit('libraryUpdated', result.tracks);
                }
                return result;
            }

            throw new Error('缓存验证失败');
        } catch (error) {
            console.error('❌ 缓存验证失败:', error);
            this.emit('cacheValidationError', error instanceof Error ? error.message : String(error));
            return null;
        }
    }

    async rebuildLibraryIndex(): Promise<LibraryIndexRebuildResult> {
        try {
            const result = await libraryDataService.rebuildLibraryIndex();
            return result;
        } catch (error) {
            console.error('❌ 重建音乐库索引失败:', error);
            return {
                success: false,
                state: 'failed',
                configuredSourceCount: 0,
                scannedSourceCount: 0,
                directorySourceCount: 0,
                fileSourceCount: 0,
                configuredFolderCount: 0,
                scannedFolderCount: 0,
                rebuiltTrackCount: 0,
                failedSources: [],
                failedFolders: [],
                error: error instanceof Error ? error.message : String(error)
            };
        }
    }

    async updatePlaylistCover(playlistId: string, imagePath: string): Promise<PlaylistCoverDataResult> {
        const result = await libraryDataService.updatePlaylistCover(playlistId, imagePath);
        if (result.success) {
            this.emit('playlistCoverUpdated', {playlistId, imagePath: result.coverPath || imagePath});
            return result;
        }

        return result;
    }

    async setPlaylistCoverFromTrack(playlistId: string, trackId: string): Promise<PlaylistCoverDataResult> {
        const result = await libraryDataService.setPlaylistCoverFromTrack(playlistId, trackId);
        if (result.success) {
            this.emit('playlistCoverUpdated', {playlistId, imagePath: result.coverPath || ''});
        }
        return result;
    }

    async getPlaylistCover(playlistId: string): Promise<{success: boolean; coverPath?: string; error?: string}> {
        const result = await libraryDataService.getPlaylistCover(playlistId);
        if (result.success) {
            return {success: true, coverPath: result.coverPath};
        }

        return {success: false, error: '获取歌单封面失败'};
    }

    async removePlaylistCover(playlistId: string): Promise<Result> {
        const result = await libraryDataService.removePlaylistCover(playlistId);
        if (result.success) {
            this.emit('playlistCoverRemoved', {playlistId});
            return {success: true};
        }

        return {success: false, error: '移除歌单封面失败'};
    }
}
