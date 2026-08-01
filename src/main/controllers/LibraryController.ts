// 音乐库控制器

import * as fs from 'fs';
import * as path from 'path';
import {BaseController, Controller, IpcHandle} from '../decorators/IpcHandler';
import {
    FAVORITES_PLAYLIST_ID,
    LibraryCacheManager,
    CachedTrack,
    GetTracksOptions,
    LibraryIndexClearSummary
} from '../services/library/LibraryCacheManager';
import {MetadataHandler} from '../services/library/MetadataHandler';
import {EmbeddedCoverService, type EmbeddedCoverResult} from '../services/library/EmbeddedCoverService';
import {PlaylistCoverStorage} from '../services/library/PlaylistCoverStorage';
import {
    LibrarySourceManager,
    partitionPlaylistBindings,
    type LibrarySourceKnownFile,
    type PlaylistSourceBinding
} from '../services/library/LibrarySourceManager';
import {NetworkFileAdapter} from '../services/network/NetworkFileAdapter';
import {NetworkDriveManager} from '../services/network/NetworkDriveManager';
import {WindowManager} from '../core/WindowManager';
import type {TrackMetadata} from '../types/global';

const AUDIO_EXTENSIONS = ['.mp3', '.wav', '.flac', '.ogg', '.m4a', '.aac', '.wma', '.ape'];
const BATCH_SIZE = 10;

export interface LibraryIndexRebuildResult extends LibraryIndexClearSummary {
    success: boolean;
    state: 'rebuilt' | 'no_sources' | 'partial' | 'failed';
    configuredSourceCount: number;
    scannedSourceCount: number;
    directorySourceCount: number;
    fileSourceCount: number;
    configuredFolderCount: number;
    scannedFolderCount: number;
    rebuiltTrackCount: number;
    failedSources: string[];
    failedFolders: string[];
    error?: string;
}

export interface LibraryImportResult {
    success: boolean;
    tracks: CachedTrack[];
    failedPaths: string[];
    coverUpdated?: boolean;
    coverPath?: string;
    error?: string;
}

export interface FolderPlaylistBindingSummary {
    id: string;
    playlistId: string;
    playlistName: string;
    availableTrackCount: number;
    excludedTrackCount: number;
    createdAt: number;
    lastSyncAt?: number;
}

export interface LibraryDirectoryOverview {
    id: string;
    path: string;
    origin: string;
    createdAt: number;
    lastScanAt?: number;
    trackCount: number;
    bindings: FolderPlaylistBindingSummary[];
}

interface PlaylistCoverUpdateResult {
    coverUpdated: boolean;
    coverPath?: string;
}

@Controller('library')
export class LibraryController extends BaseController {
    // shared audio engine state (reference shared with AudioController)
    readonly audioEngineState: any;

    constructor(
        private libraryCacheManager: LibraryCacheManager,
        private metadataHandler: MetadataHandler,
        private networkDriveManager: NetworkDriveManager,
        private networkFileAdapter: NetworkFileAdapter,
        private windowManager: WindowManager,
        private embeddedCoverService: EmbeddedCoverService,
        private playlistCoverStorage: PlaylistCoverStorage,
        private parseMetadata: (filePath: string, adapter?: any, opts?: any) => Promise<TrackMetadata>,
        private loadMusicFolders: () => Promise<string[]>,
        private librarySourceManager: LibrarySourceManager,
        private removeMusicFolder: (folderPath: string) => Promise<any>,
        private loadAutoPlaylistCoverSetting: () => Promise<boolean>,
        audioEngineState: any
    ) {
        super();
        this.audioEngineState = audioEngineState;
    }

    // ── 缓存 ──────────────────────────────────────────────

    @IpcHandle('library:loadCachedTracks')
    async loadCachedTracks(): Promise<CachedTrack[]> {
        try {
            const tracks = this.libraryCacheManager.getTracks();
            console.log(`✅ 从缓存加载 ${tracks.length} 个音乐文件`);
            return tracks;
        } catch (error) {
            console.error('❌ 加载缓存音乐库失败:', error);
            return [];
        }
    }

    @IpcHandle('library:validateCache')
    async validateCache(): Promise<any> {
        try {
            const mountedDrives = Array.from(this.networkDriveManager.getMountedDrives().keys());
            const result = await this.libraryCacheManager.validateCachedTracks((progress: any) => {
                this.windowManager.sendToMainWindow('library:cacheValidationProgress', progress);
            });

            const hasInvalid = result.invalid.length > 0;
            if (hasInvalid) {
                this.libraryCacheManager.removeInvalidTracks(result.invalid);
                await this.libraryCacheManager.saveCache();
            }

            console.log(`✅ 缓存验证完成 - 有效: ${result.valid.length}, 无效: ${result.invalid.length}, 已修改: ${result.modified.length}`);
            return {
                valid: result.valid.length,
                invalid: result.invalid.length,
                modified: result.modified.length,
                tracks: hasInvalid ? this.libraryCacheManager.getTracks() : undefined,
                mountedDrives,
            };
        } catch (error: any) {
            console.error('❌ 验证缓存失败:', error);
            return {success: false, error: error.message};
        }
    }

    @IpcHandle('library:removeTrack')
    async removeTrack(trackFileId: string): Promise<{ success: boolean; error?: string }> {
        try {
            const track = this.libraryCacheManager.removeTrack(trackFileId);
            await this.libraryCacheManager.saveCache();
            console.log(`🗑️ 从音乐库删除: ${track.title}`);
            return {success: true};
        } catch (error: any) {
            return {success: false, error: error.message};
        }
    }

    @IpcHandle('library:removeTracksByDrive')
    async removeTracksByDrive(driveId: string): Promise<{ success: boolean; removedCount?: number; error?: string }> {
        try {
            const removedCount = this.libraryCacheManager.removeTracksByDrive(driveId);
            await this.libraryCacheManager.saveCache();
            return {success: true, removedCount};
        } catch (error: any) {
            return {success: false, error: error.message};
        }
    }

    @IpcHandle('library:clearIgnoreList')
    async clearIgnoreList(): Promise<{ success: boolean; error?: string }> {
        try {
            this.libraryCacheManager.clearIgnoreList();
            await this.libraryCacheManager.saveCache();
            return {success: true};
        } catch (error: any) {
            return {success: false, error: error.message};
        }
    }

    // ── 查询 ──────────────────────────────────────────────

    @IpcHandle('library:getTracks')
    async getTracks(options: GetTracksOptions = {}): Promise<any[]> {
        return this.libraryCacheManager.getTracks(options);
    }

    @IpcHandle('library:search')
    async search(query: string): Promise<any[]> {
        try {
            return this.libraryCacheManager.searchTracks(query);
        } catch (error) {
            console.error('❌ 搜索失败:', error);
            return [];
        }
    }

    // ── 歌单 ──────────────────────────────────────────────

    @IpcHandle('library:createPlaylist')
    async createPlaylist(name: string, description = ''): Promise<{
        success: boolean;
        playlist?: any;
        error?: string
    }> {
        try {
            const playlist = this.libraryCacheManager.createPlaylist(name, description);
            await this.libraryCacheManager.saveCache();
            return {success: true, playlist};
        } catch (error: any) {
            return {success: false, error: error.message};
        }
    }

    @IpcHandle('library:getPlaylists')
    async getPlaylists(): Promise<any[]> {
        try {
            return this.libraryCacheManager.getAllPlaylists();
        } catch (error) {
            console.error('❌ 获取歌单列表失败:', error);
            return [];
        }
    }

    @IpcHandle('library:getPlaylistDetail')
    async getPlaylistDetail(playlistId: string): Promise<any> {
        try {
            const playlist = this.libraryCacheManager.getPlaylistById(playlistId);
            if (!playlist) return {success: false, error: '歌单不存在'};
            const allTracks = this.libraryCacheManager.getTracks();
            const tracks = playlist.trackIds
                .map((id: string) => allTracks.find((t: any) => t.fileId === id))
                .filter(Boolean);
            return {
                success: true,
                playlist: {
                    ...playlist,
                    coverImage: this.libraryCacheManager.getPlaylistCover(playlistId),
                    trackIds: [...playlist.trackIds],
                    resolvedTrackCount: tracks.length
                },
                tracks
            };
        } catch (error: any) {
            return {success: false, error: error.message};
        }
    }

    @IpcHandle('library:deletePlaylist')
    async deletePlaylist(playlistId: string): Promise<{ success: boolean; error?: string }> {
        try {
            await this.ensureLibrarySourcesLoaded();
            const coverFileName = this.libraryCacheManager.getPlaylistCoverFileName(playlistId);
            await this.librarySourceManager.removePlaylistBindings(playlistId);
            this.libraryCacheManager.deletePlaylist(playlistId);
            await this.libraryCacheManager.saveCache();
            await this.playlistCoverStorage.remove(coverFileName).catch(error => {
                console.warn('⚠️ 删除歌单封面快照失败:', error);
            });
            return {success: true};
        } catch (error: any) {
            return {success: false, error: error.message};
        }
    }

    @IpcHandle('library:renamePlaylist')
    async renamePlaylist(playlistId: string, newName: string, description = ''): Promise<{
        success: boolean;
        playlist?: any;
        error?: string
    }> {
        try {
            const playlist = this.libraryCacheManager.renamePlaylist(playlistId, newName, description);
            await this.libraryCacheManager.saveCache();
            return {success: true, playlist};
        } catch (error: any) {
            return {success: false, error: error.message};
        }
    }

    @IpcHandle('library:addTracksToPlaylist')
    async addTracksToPlaylist(playlistId: string, trackIds: string[]): Promise<{
        success: boolean;
        results?: any[];
        coverUpdated?: boolean;
        coverPath?: string;
        error?: string
    }> {
        try {
            const results = trackIds.map(id => {
                try {
                    this.libraryCacheManager.addTrackToPlaylist(playlistId, id);
                    return {id, success: true};
                } catch (e: any) {
                    return {id, success: false, error: e.message};
                }
            });
            await this.libraryCacheManager.saveCache();
            const addedTrackIds = results
                .filter(result => result.success)
                .map(result => result.id);
            const coverResult = await this.maybeSetAutomaticPlaylistCover(playlistId, addedTrackIds);
            if (playlistId === FAVORITES_PLAYLIST_ID) {
                this.emitFavoritesChanged(addedTrackIds, true);
            }
            this.emitPlaylistsUpdated();
            return {success: true, results, ...coverResult};
        } catch (error: any) {
            return {success: false, error: error.message};
        }
    }

    @IpcHandle('library:removeTracksFromPlaylist')
    async removeTracksFromPlaylist(playlistId: string, trackIds: string[]): Promise<{
        success: boolean;
        results?: any[];
        error?: string
    }> {
        try {
            await this.ensureLibrarySourcesLoaded();
            const filePaths = trackIds.flatMap(id => {
                const track = this.libraryCacheManager.getTrackByFileId(id);
                return track ? [track.filePath] : [];
            });
            await this.librarySourceManager.excludePlaylistFiles(playlistId, filePaths);
            const results = trackIds.map(id => {
                try {
                    this.libraryCacheManager.removeTrackFromPlaylist(playlistId, id);
                    return {id, success: true};
                } catch (e: any) {
                    return {id, success: false, error: e.message};
                }
            });
            this.recomputePlaylistMembership(playlistId);
            await this.libraryCacheManager.saveCache();
            if (playlistId === FAVORITES_PLAYLIST_ID) {
                this.emitFavoritesChanged(
                    results.filter(result => result.success).map(result => result.id),
                    false
                );
            }
            return {success: true, results};
        } catch (error: any) {
            return {success: false, error: error.message};
        }
    }

    @IpcHandle('library:cleanupPlaylists')
    async cleanupPlaylists(): Promise<{ success: boolean; cleanedCount?: number; error?: string }> {
        try {
            const cleanedCount = this.libraryCacheManager.cleanupPlaylistReferences();
            if (cleanedCount > 0) await this.libraryCacheManager.saveCache();
            return {success: true, cleanedCount};
        } catch (error: any) {
            return {success: false, error: error.message};
        }
    }

    // ── 扫描 ──────────────────────────────────────────────

    async scanDirectories(directoryPaths: string[]): Promise<{scannedFolderCount: number; failedFolders: string[]}> {
        const failedFolders: string[] = [];
        let scannedFolderCount = 0;

        for (const directoryPath of directoryPaths) {
            const result = await this.importLibraryDirectory(directoryPath);
            if (result.success) {
                scannedFolderCount++;
            } else {
                failedFolders.push(directoryPath);
            }
        }

        return {scannedFolderCount, failedFolders};
    }

    @IpcHandle('library:scanDirectory')
    async scanDirectory(directoryPath: string): Promise<boolean> {
        return (await this.importLibraryDirectory(directoryPath)).success;
    }

    @IpcHandle('library:importLibraryDirectory')
    async importLibraryDirectory(directoryPath: string): Promise<LibraryImportResult> {
        try {
            await this.ensureLibrarySourcesLoaded();
            const {source} = await this.librarySourceManager.ensureSource('directory', directoryPath, 'scan');
            const success = await this.scanDirectorySource(directoryPath, source.id);
            this.emitSourcesUpdated();
            return {
                success,
                tracks: success ? this.getTracksForSource(source.id) : [],
                failedPaths: success ? [] : [directoryPath],
                error: success ? undefined : '目录扫描失败'
            };
        } catch (error: any) {
            console.error('❌ 导入音乐文件夹失败:', error);
            return {success: false, tracks: [], failedPaths: [directoryPath], error: error.message};
        }
    }

    private async scanDirectorySource(
        directoryPath: string,
        sourceId: string,
        publishUpdates = true
    ): Promise<boolean> {
        try {
            const scanStartTime = Date.now();
            const isNetwork = this.networkFileAdapter.isNetworkPath(directoryPath);

            if (isNetwork) {
                return this.scanNetworkDirectory(directoryPath, scanStartTime, sourceId, publishUpdates);
            }

            const tracks: any[] = [];
            const tracksToCache: any[] = [];
            const fsPromises = fs.promises;
            const rootStat = await fsPromises.stat(directoryPath);
            if (!rootStat.isDirectory()) {
                throw new Error('扫描路径不是目录');
            }

            const collectFiles = async (dir: string): Promise<{ path: string; stat: fs.Stats; name: string }[]> => {
                const files: any[] = [];
                try {
                    const items = await fsPromises.readdir(dir);
                    const itemPaths = items.map(i => path.join(dir, i));
                    const stats = await Promise.all(itemPaths.map(p => fsPromises.stat(p).catch(() => null)));
                    for (let i = 0; i < items.length; i++) {
                        const stat = stats[i];
                        if (!stat) continue;
                        if (stat.isDirectory()) files.push(...await collectFiles(itemPaths[i]));
                        else if (AUDIO_EXTENSIONS.includes(path.extname(items[i]).toLowerCase())) {
                            files.push({path: itemPaths[i], stat, name: items[i]});
                        }
                    }
                } catch (e: any) {
                    console.error(`扫描目录错误 ${dir}:`, e.message);
                }
                return files;
            };

            const files = await collectFiles(directoryPath);

            for (let i = 0; i < files.length; i += BATCH_SIZE) {
                const batch = files.slice(i, i + BATCH_SIZE);
                const results = await Promise.all(batch.map(async ({path: fp, stat, name}) => {
                    try {
                        const metadata = await this.parseMetadata(fp, null, {skipCover: true, skipLyrics: true});
                        return {
                            trackData: {
                                filePath: fp, fileName: name,
                                title: metadata.title, artist: metadata.artist, album: metadata.album,
                                duration: metadata.duration, bitrate: metadata.bitrate, sampleRate: metadata.sampleRate,
                                year: metadata.year, genre: metadata.genre,
                                track: (metadata as any).track, disc: (metadata as any).disc,
                                fileSize: stat.size, embeddedLyrics: metadata.embeddedLyrics
                            },
                            filePath: fp,
                            stats: stat
                        };
                    } catch (e: any) {
                        console.warn(`解析失败 ${fp}:`, e.message);
                        return null;
                    }
                }));

                for (const r of results) {
                    if (r) {
                        tracks.push(r.trackData);
                        tracksToCache.push(r);
                    }
                }

                const win = this.windowManager.getMainWindow();
                if (win && tracks.length > 0) {
                    win.webContents.send('library:scanProgress', {
                        current: i + batch.length,
                        total: files.length,
                        tracks: tracks.length
                    });
                }
            }

            if (tracksToCache.length > 0) {
                this.libraryCacheManager.addTracks(tracksToCache);
            }
            this.libraryCacheManager.addScannedDirectory(directoryPath);
            const scanDuration = Date.now() - scanStartTime;
            this.libraryCacheManager.updateScanStatistics(scanStartTime, scanDuration);
            await this.libraryCacheManager.saveCache();
            await this.librarySourceManager.updateSourceScan(
                sourceId,
                this.createKnownFiles(files.map(file => file.path)),
                true
            );
            await this.synchronizeBindingsForSource(sourceId, publishUpdates);

            if (publishUpdates) {
                const allTracks = this.libraryCacheManager.getTracks();
                const win = this.windowManager.getMainWindow();
                if (win) win.webContents.send('library:updated', allTracks);
            }
            return true;
        } catch (error: any) {
            console.error('❌ 扫描目录失败:', error);
            return false;
        }
    }

    private async scanNetworkDirectory(
        networkPath: string,
        scanStartTime: number,
        sourceId: string,
        publishUpdates: boolean
    ): Promise<boolean> {
        const tracks: any[] = [];
        const tracksToCache: any[] = [];
        const rootStat = await this.networkFileAdapter.stat(networkPath);
        if (typeof rootStat.isDirectory === 'function' && !rootStat.isDirectory()) {
            throw new Error('网络扫描路径不是目录');
        }

        const collectNetworkFiles = async (dirPath: string): Promise<{ path: string; stat: any; name: string }[]> => {
            const files: any[] = [];
            try {
                const items = await this.networkFileAdapter.readdir(dirPath);
                const itemPaths = items.map(item => this.networkFileAdapter.joinNetworkPath(dirPath, item));
                const stats = await Promise.all(
                    itemPaths.map(p => this.networkFileAdapter.stat(p).catch(() => null))
                );
                for (let i = 0; i < items.length; i++) {
                    const stat = stats[i];
                    if (!stat) continue;
                    const isDir = typeof stat.isDirectory === 'function' ? stat.isDirectory() : false;
                    if (isDir) files.push(...await collectNetworkFiles(itemPaths[i]));
                    else if (AUDIO_EXTENSIONS.includes(path.extname(items[i]).toLowerCase())) {
                        files.push({path: itemPaths[i], stat, name: items[i]});
                    }
                }
            } catch (e: any) {
                console.error(`扫描网络目录错误 ${dirPath}:`, e.message);
            }
            return files;
        };

        const files = await collectNetworkFiles(networkPath);

        for (let i = 0; i < files.length; i += BATCH_SIZE) {
            const batch = files.slice(i, i + BATCH_SIZE);
            const results = await Promise.all(batch.map(async ({path: fp, stat, name}) => {
                try {
                    const metadata = await this.parseMetadata(fp, this.networkFileAdapter, {
                        skipCover: true,
                        skipLyrics: true
                    });
                    return {
                        trackData: {
                            filePath: fp, fileName: name,
                            title: metadata.title, artist: metadata.artist, album: metadata.album,
                            duration: metadata.duration, bitrate: metadata.bitrate, sampleRate: metadata.sampleRate,
                            year: metadata.year, genre: metadata.genre,
                            track: (metadata as any).track, disc: (metadata as any).disc,
                            fileSize: stat.size, embeddedLyrics: metadata.embeddedLyrics, isNetworkFile: true
                        },
                        filePath: fp,
                        stats: stat
                    };
                } catch (e: any) {
                    console.warn(`处理网络文件失败 ${fp}:`, e.message);
                    return null;
                }
            }));

            for (const r of results) {
                if (r) {
                    tracks.push(r.trackData);
                    tracksToCache.push(r);
                }
            }

            const win = this.windowManager.getMainWindow();
            if (win) win.webContents.send('library:scanProgress', {
                current: i + batch.length,
                total: files.length,
                tracks: tracks.length
            });
        }

        if (tracksToCache.length > 0) {
            this.libraryCacheManager.addTracks(tracksToCache);
        }
        this.libraryCacheManager.addScannedDirectory(networkPath);
        const scanDuration = Date.now() - scanStartTime;
        this.libraryCacheManager.updateScanStatistics(scanStartTime, scanDuration);
        await this.libraryCacheManager.saveCache();
        await this.librarySourceManager.updateSourceScan(
            sourceId,
            this.createKnownFiles(files.map(file => file.path)),
            true
        );
        await this.synchronizeBindingsForSource(sourceId, publishUpdates);

        console.log(`✅ 网络扫描完成，找到 ${tracks.length} 个音频文件`);
        if (publishUpdates) {
            const allTracks = this.libraryCacheManager.getTracks();
            const win = this.windowManager.getMainWindow();
            if (win) win.webContents.send('library:updated', allTracks);
        }
        return true;
    }

    // ── 元数据 ──────────────────────────────────────────────

    @IpcHandle('library:getTrackCover')
    async getTrackCover(filePath: string): Promise<EmbeddedCoverResult | null> {
        try {
            if (!filePath) {
                console.warn('⚠️ getTrackCover: 未提供文件路径');
                return null;
            }
            return await this.embeddedCoverService.getCover(filePath, this.networkFileAdapter);
        } catch (error) {
            console.error('❌ 获取内嵌封面失败:', error);
            return null;
        }
    }

    @IpcHandle('library:getTrackMetadata')
    async getTrackMetadata(filePath: string): Promise<any> {
        try {
            if (!filePath) {
                console.warn('⚠️ getTrackMetadata: 未提供文件路径');
                return null;
            }
            const metadata = await this.parseMetadata(filePath, this.networkFileAdapter.isNetworkPath(filePath) ? this.networkFileAdapter : undefined);
            return {
                filePath,
                title: metadata.title, artist: metadata.artist, album: metadata.album,
                duration: metadata.duration, bitrate: metadata.bitrate, sampleRate: metadata.sampleRate,
                year: metadata.year, genre: metadata.genre,
                track: (metadata as any).track, disc: (metadata as any).disc,
                cover: metadata.cover ? {format: metadata.cover.format, data: Array.from(metadata.cover.data)} : null,
                embeddedLyrics: metadata.embeddedLyrics
            };
        } catch (error: any) {
            console.error('❌ 获取元数据失败:', error);
            return null;
        }
    }

    @IpcHandle('library:getTrackPlaybackMetadata')
    async getTrackPlaybackMetadata(filePath: string): Promise<any> {
        try {
            if (!filePath) {
                console.warn('⚠️ getTrackPlaybackMetadata: 未提供文件路径');
                return null;
            }

            const cachedTrack = this.libraryCacheManager.getTrackByPath(filePath);
            if (cachedTrack) {
                return {
                    filePath,
                    title: cachedTrack.title,
                    artist: cachedTrack.artist,
                    album: cachedTrack.album,
                    duration: cachedTrack.duration,
                    bitrate: cachedTrack.bitrate,
                    sampleRate: cachedTrack.sampleRate,
                    year: cachedTrack.year,
                    genre: cachedTrack.genre,
                    track: (cachedTrack as any).track,
                    disc: (cachedTrack as any).disc,
                    cover: null,
                    embeddedLyrics: null
                };
            }

            const metadata = await this.parseMetadata(
                filePath,
                this.networkFileAdapter.isNetworkPath(filePath) ? this.networkFileAdapter : undefined,
                {skipCover: true, skipLyrics: true}
            );

            return {
                filePath,
                title: metadata.title,
                artist: metadata.artist,
                album: metadata.album,
                duration: metadata.duration,
                bitrate: metadata.bitrate,
                sampleRate: metadata.sampleRate,
                year: metadata.year,
                genre: metadata.genre,
                track: (metadata as any).track,
                disc: (metadata as any).disc,
                cover: null,
                embeddedLyrics: null
            };
        } catch (error: any) {
            console.error('❌ 获取播放元数据失败:', error);
            return null;
        }
    }

    @IpcHandle('library:updateMetadata')
    async updateMetadata(filePath: string, metadata: any): Promise<{ success: boolean; updatedMetadata?: any; coverUpdated?: boolean; error?: string }> {
        try {
            const isNetwork = this.networkFileAdapter.isNetworkPath(filePath);
            let result: any;

            if (isNetwork) {
                result = await this.updateNetworkFileMetadata(filePath, metadata);
            } else {
                if (!this.metadataHandler.isFormatSupported(filePath)) {
                    return {success: false, error: `不支持的格式: ${path.extname(filePath)}`};
                }
                result = await this.metadataHandler.updateMetadata(filePath, metadata);
            }

            if (result.success) {
                this.libraryCacheManager.updateTrackInCache(filePath, {
                    title: metadata.title, artist: metadata.artist,
                    album: metadata.album, year: metadata.year, genre: metadata.genre
                });
                await this.libraryCacheManager.saveCache();

                // 返回更新后的元数据
                return {
                    success: true,
                    updatedMetadata: {
                        filePath,
                        title: metadata.title,
                        artist: metadata.artist,
                        album: metadata.album,
                        year: metadata.year,
                        genre: metadata.genre
                    },
                    coverUpdated: !!metadata.cover
                };
            }
            return result;
        } catch (error: any) {
            return {success: false, error: error.message};
        }
    }

    // channel aliases for backward compat
    @IpcHandle('library:addToPlaylist')
    async addToPlaylist(playlistId: string, trackFileIds: string | string[]): Promise<any> {
        const trackIds = Array.isArray(trackFileIds) ? trackFileIds : [trackFileIds];
        return this.addTracksToPlaylist(playlistId, trackIds);
    }

    @IpcHandle('library:removeFromPlaylist')
    async removeFromPlaylist(playlistId: string, trackFileIds: string | string[]): Promise<any> {
        const trackIds = Array.isArray(trackFileIds) ? trackFileIds : [trackFileIds];
        return this.removeTracksFromPlaylist(playlistId, trackIds);
    }

    @IpcHandle('library:setTrackFavorite')
    async setTrackFavorite(trackFileId: string, favorite: boolean): Promise<{
        success: boolean;
        favorite?: boolean;
        error?: string;
    }> {
        try {
            const finalState = this.libraryCacheManager.setTrackFavorite(trackFileId, favorite);
            await this.libraryCacheManager.saveCache();
            this.emitFavoritesChanged([trackFileId], finalState);
            return {success: true, favorite: finalState};
        } catch (error: any) {
            return {success: false, error: error.message};
        }
    }

    @IpcHandle('library:updateTrackMetadata')
    async updateTrackMetadata(data: any): Promise<any> {
        // 支持两种调用方式：
        // 1. updateTrackMetadata({ filePath, title, artist, ... })
        // 2. updateTrackMetadata(filePath, metadata) - 向后兼容
        if (typeof data === 'string') {
            // 旧的调用方式：第一个参数是 filePath 字符串
            const filePath = data;
            const metadata = arguments[1];
            return this.updateMetadata(filePath, metadata);
        } else if (data && typeof data === 'object' && data.filePath) {
            // 新的调用方式：传入包含 filePath 的对象
            const { filePath, ...metadata } = data;
            return this.updateMetadata(filePath, metadata);
        } else {
            return { success: false, error: '无效的参数格式' };
        }
    }

    @IpcHandle('library:getCacheStatistics')
    async getCacheStatistics(): Promise<any> {
        try {
            return this.libraryCacheManager.getCacheStatistics();
        } catch (error: any) {
            console.error('❌ 获取缓存统计失败:', error);
            return null;
        }
    }

    @IpcHandle('library:rebuildLibraryIndex')
    async rebuildLibraryIndex(): Promise<LibraryIndexRebuildResult> {
        let summary: LibraryIndexClearSummary = {
            clearedTrackCount: 0,
            preservedPlaylistCount: 0,
            preservedPlaylistReferenceCount: 0,
            preservedIgnoredFileCount: 0
        };

        try {
            await this.ensureLibrarySourcesLoaded();
            const sources = this.librarySourceManager.getSources();
            summary = await this.libraryCacheManager.clearLibraryIndex();
            this.windowManager.sendToMainWindow('library:updated', []);
            this.emitPlaylistsUpdated();
            console.log(`✅ 音乐库索引已清除，共移除 ${summary.clearedTrackCount} 首歌曲`);

            if (sources.length === 0) {
                return {
                    success: true,
                    state: 'no_sources',
                    configuredSourceCount: 0,
                    scannedSourceCount: 0,
                    directorySourceCount: 0,
                    fileSourceCount: 0,
                    configuredFolderCount: 0,
                    scannedFolderCount: 0,
                    rebuiltTrackCount: 0,
                    failedSources: [],
                    failedFolders: [],
                    ...summary
                };
            }

            const scanResult = await this.scanAllLibrarySources();
            const rebuiltTrackCount = this.libraryCacheManager.getAllTracks().length;
            const state = scanResult.failedSources.length === 0
                ? 'rebuilt'
                : scanResult.scannedSourceCount > 0 ? 'partial' : 'failed';

            return {
                success: state !== 'failed',
                state,
                configuredFolderCount: scanResult.directorySourceCount,
                rebuiltTrackCount,
                ...scanResult,
                ...summary,
                error: state === 'failed' ? '所有音乐库来源扫描失败' : undefined
            };
        } catch (error: any) {
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
                rebuiltTrackCount: this.libraryCacheManager.getAllTracks().length,
                failedSources: [],
                failedFolders: [],
                ...summary,
                error: error.message
            };
        }
    }

    async scanAllLibrarySources(): Promise<{
        configuredSourceCount: number;
        scannedSourceCount: number;
        directorySourceCount: number;
        fileSourceCount: number;
        scannedFolderCount: number;
        failedSources: string[];
        failedFolders: string[];
    }> {
        await this.ensureLibrarySourcesLoaded();
        const sources = this.librarySourceManager.getSources();
        const failedSources: string[] = [];
        const failedFolders: string[] = [];
        let scannedSourceCount = 0;
        let scannedFolderCount = 0;

        for (const source of sources) {
            try {
                if (source.type === 'directory') {
                    const success = await this.scanDirectorySource(source.path, source.id, false);
                    if (!success) throw new Error('目录扫描失败');
                    scannedFolderCount++;
                } else {
                    await this.importLibraryFile(source.path, false);
                }
                scannedSourceCount++;
            } catch (error: any) {
                failedSources.push(source.path);
                if (source.type === 'directory') failedFolders.push(source.path);
                console.warn(`⚠️ 扫描音乐库来源失败 ${source.path}:`, error.message);
            }
        }

        this.windowManager.sendToMainWindow('library:updated', this.libraryCacheManager.getTracks());
        this.emitPlaylistsUpdated();
        this.emitSourcesUpdated();
        return {
            configuredSourceCount: sources.length,
            scannedSourceCount,
            directorySourceCount: sources.filter(source => source.type === 'directory').length,
            fileSourceCount: sources.filter(source => source.type === 'file').length,
            scannedFolderCount,
            failedSources,
            failedFolders
        };
    }

    @IpcHandle('library:getTracksByDrive')
    async getTracksByDrive(driveId: string): Promise<any[]> {
        try {
            const tracks = this.libraryCacheManager.getTracksByDrive(driveId);
            console.log(`📀 获取网络磁盘 ${driveId} 的歌曲: ${tracks.length} 首`);
            return tracks;
        } catch (error: any) {
            console.error('❌ 获取网络磁盘歌曲失败:', error);
            return [];
        }
    }

    @IpcHandle('library:updatePlaylistCover')
    async updatePlaylistCover(playlistId: string, imagePath: string): Promise<{
        success: boolean;
        coverPath?: string;
        error?: string
    }> {
        let snapshotFileName: string | null = null;
        let previousFileName: string | null = null;
        try {
            const playlist = this.libraryCacheManager.getPlaylistById(playlistId);
            if (!playlist) throw new Error('歌单不存在');
            if (playlist.systemType === 'favorites') throw new Error('系统收藏歌单不支持此操作');
            previousFileName = this.libraryCacheManager.getPlaylistCoverFileName(playlistId);
            const snapshot = await this.playlistCoverStorage.importFile(playlistId, imagePath);
            snapshotFileName = snapshot.fileName;
            const success = this.libraryCacheManager.updatePlaylistCover(playlistId, snapshot.fileName);
            if (success) {
                await this.libraryCacheManager.saveCache();
                await this.playlistCoverStorage.remove(previousFileName).catch(error => {
                    console.warn('⚠️ 清理旧歌单封面快照失败:', error);
                });
                return {success: true, coverPath: snapshot.filePath};
            }
            await this.playlistCoverStorage.remove(snapshot.fileName);
            return {success: false, error: '更新歌单封面失败'};
        } catch (error: any) {
            if (snapshotFileName) {
                if (previousFileName) {
                    this.libraryCacheManager.updatePlaylistCover(playlistId, previousFileName);
                } else {
                    this.libraryCacheManager.removePlaylistCover(playlistId);
                }
            }
            await this.playlistCoverStorage.remove(snapshotFileName).catch(() => undefined);
            return {success: false, error: error.message};
        }
    }

    @IpcHandle('library:getPlaylistCover')
    async getPlaylistCover(playlistId: string): Promise<{ success: boolean; coverPath?: string; error?: string }> {
        try {
            const coverPath = this.libraryCacheManager.getPlaylistCover(playlistId) ?? undefined;
            return {success: true, coverPath};
        } catch (error: any) {
            return {success: false, error: error.message};
        }
    }

    @IpcHandle('library:setPlaylistCoverFromTrack')
    async setPlaylistCoverFromTrack(playlistId: string, trackId: string): Promise<{
        success: boolean;
        coverPath?: string;
        errorCode?: string;
        error?: string;
    }> {
        let snapshotFileName: string | null = null;
        let previousFileName: string | null = null;
        try {
            const playlist = this.libraryCacheManager.getPlaylistById(playlistId);
            if (!playlist) return {success: false, errorCode: 'PLAYLIST_NOT_FOUND', error: '歌单不存在'};
            if (playlist.systemType === 'favorites') {
                return {success: false, errorCode: 'SYSTEM_PLAYLIST', error: '系统歌单不支持设置封面'};
            }
            if (!playlist.trackIds.includes(trackId)) {
                return {success: false, errorCode: 'TRACK_NOT_IN_PLAYLIST', error: '歌曲不属于当前歌单'};
            }
            const track = this.libraryCacheManager.getTrackByFileId(trackId);
            if (!track) return {success: false, errorCode: 'TRACK_NOT_FOUND', error: '歌曲不存在'};

            const cover = await this.embeddedCoverService.getCover(track.filePath, this.networkFileAdapter);
            if (!cover) {
                return {success: false, errorCode: 'NO_EMBEDDED_COVER', error: '该歌曲没有内嵌封面'};
            }

            previousFileName = this.libraryCacheManager.getPlaylistCoverFileName(playlistId);
            const snapshot = await this.playlistCoverStorage.saveSnapshot(playlistId, cover.data);
            snapshotFileName = snapshot.fileName;
            this.libraryCacheManager.updatePlaylistCover(playlistId, snapshot.fileName);
            await this.libraryCacheManager.saveCache();
            await this.playlistCoverStorage.remove(previousFileName).catch(error => {
                console.warn('⚠️ 清理旧歌单封面快照失败:', error);
            });
            this.emitPlaylistsUpdated();
            return {success: true, coverPath: snapshot.filePath};
        } catch (error: any) {
            if (snapshotFileName) {
                if (previousFileName) {
                    this.libraryCacheManager.updatePlaylistCover(playlistId, previousFileName);
                } else {
                    this.libraryCacheManager.removePlaylistCover(playlistId);
                }
                await this.playlistCoverStorage.remove(snapshotFileName).catch(() => undefined);
            }
            return {success: false, errorCode: 'COVER_SNAPSHOT_FAILED', error: error.message};
        }
    }

    @IpcHandle('library:removePlaylistCover')
    async removePlaylistCover(playlistId: string): Promise<{ success: boolean; error?: string }> {
        let coverFileName: string | null = null;
        try {
            coverFileName = this.libraryCacheManager.getPlaylistCoverFileName(playlistId);
            const success = this.libraryCacheManager.removePlaylistCover(playlistId);
            if (success) {
                await this.libraryCacheManager.saveCache();
                await this.playlistCoverStorage.remove(coverFileName).catch(error => {
                    console.warn('⚠️ 删除歌单封面快照失败:', error);
                });
                return {success: true};
            }
            return {success: false, error: '移除歌单封面失败'};
        } catch (error: any) {
            if (coverFileName) {
                this.libraryCacheManager.updatePlaylistCover(playlistId, coverFileName);
            }
            return {success: false, error: error.message};
        }
    }

    async migratePlaylistCovers(): Promise<void> {
        let changed = false;
        for (const playlist of this.libraryCacheManager.getUserPlaylistsForCoverMigration()) {
            const legacyPath = playlist.coverImage || playlist.coverImagePath;
            if (playlist.coverFileName || !legacyPath) {
                if (playlist.coverImage !== undefined || playlist.coverImagePath !== undefined) {
                    delete playlist.coverImage;
                    delete playlist.coverImagePath;
                    changed = true;
                }
                continue;
            }

            try {
                const snapshot = await this.playlistCoverStorage.importFile(playlist.id, legacyPath);
                playlist.coverFileName = snapshot.fileName;
                console.log(`✅ 已迁移歌单封面快照: ${playlist.name}`);
            } catch (error) {
                console.warn(`⚠️ 歌单封面迁移失败，已清空: ${playlist.name}`, error);
            }
            delete playlist.coverImage;
            delete playlist.coverImagePath;
            playlist.updatedAt = Date.now();
            changed = true;
        }
        if (changed) await this.libraryCacheManager.saveCache();
    }

    private async maybeSetAutomaticPlaylistCover(
        playlistId: string,
        addedTrackIds: string[]
    ): Promise<PlaylistCoverUpdateResult> {
        if (addedTrackIds.length === 0 || playlistId === FAVORITES_PLAYLIST_ID) {
            return {coverUpdated: false};
        }
        if (this.libraryCacheManager.getPlaylistCoverFileName(playlistId)) {
            return {coverUpdated: false};
        }
        if (!await this.loadAutoPlaylistCoverSetting()) {
            return {coverUpdated: false};
        }

        for (const trackId of addedTrackIds) {
            const track = this.libraryCacheManager.getTrackByFileId(trackId);
            if (!track) continue;
            let snapshotFileName: string | null = null;
            try {
                const cover = await this.embeddedCoverService.getCover(track.filePath, this.networkFileAdapter);
                if (!cover) continue;
                const snapshot = await this.playlistCoverStorage.saveSnapshot(playlistId, cover.data);
                snapshotFileName = snapshot.fileName;
                this.libraryCacheManager.updatePlaylistCover(playlistId, snapshot.fileName);
                await this.libraryCacheManager.saveCache();
                console.log(`✅ 已从歌曲内嵌图片生成歌单封面: ${track.title || track.fileName}`);
                return {coverUpdated: true, coverPath: snapshot.filePath};
            } catch (error) {
                if (snapshotFileName) {
                    this.libraryCacheManager.removePlaylistCover(playlistId);
                    await this.playlistCoverStorage.remove(snapshotFileName).catch(() => undefined);
                }
                console.warn(`⚠️ 自动提取歌单封面失败: ${track.title || track.fileName}`, error);
            }
        }
        return {coverUpdated: false};
    }

    private emitFavoritesChanged(trackIds: string[], favorite?: boolean): void {
        if (trackIds.length === 0) return;
        const win = this.windowManager.getMainWindow();
        win?.webContents.send('library:favoritesChanged', {trackIds, favorite});
    }

    private async ensureLibrarySourcesLoaded(): Promise<void> {
        const result = await this.librarySourceManager.loadAndMigrate({
            musicFolders: await this.loadMusicFolders(),
            scannedDirectories: this.libraryCacheManager.getScannedDirectories(),
            tracks: this.libraryCacheManager.getAllTracks()
        });
        const removedOrphanBindings = await this.librarySourceManager.removeOrphanedPlaylistBindings(
            this.libraryCacheManager.getAllPlaylists().map(playlist => playlist.id)
        );
        if (removedOrphanBindings.length > 0) {
            const orphanPlaylistCount = new Set(
                removedOrphanBindings.map(binding => binding.playlistId)
            ).size;
            console.warn(
                `🧹 已清理 ${removedOrphanBindings.length} 条孤儿歌单绑定，涉及 ${orphanPlaylistCount} 个已丢失歌单`
            );
        }
        if (result.migrated || this.libraryCacheManager.needsPlaylistMembershipMigration()) {
            await this.libraryCacheManager.saveCache();
        }
    }

    private createKnownFiles(filePaths: string[]): LibrarySourceKnownFile[] {
        return filePaths.map(filePath => ({
            path: filePath,
            canonicalPath: this.librarySourceManager.canonicalize(filePath),
            trackId: this.libraryCacheManager.getTrackByPath(filePath)?.fileId
        }));
    }

    private getTracksForSource(sourceId: string): CachedTrack[] {
        const source = this.librarySourceManager.getSources().find(item => item.id === sourceId);
        if (!source) return [];
        const trackIds = new Set(source.knownFiles.flatMap(file => file.trackId ? [file.trackId] : []));
        return this.libraryCacheManager.getTracks().filter(track => trackIds.has(track.fileId));
    }

    private async synchronizeBindingsForSource(sourceId: string, publishUpdates = true): Promise<void> {
        const bindings = await this.librarySourceManager.synchronizeSourceBindings(sourceId);
        const {activeBindings, orphanBindings} = partitionPlaylistBindings(
            bindings,
            this.libraryCacheManager.getAllPlaylists().map(playlist => playlist.id)
        );
        if (orphanBindings.length > 0) {
            console.warn(
                `⚠️ 跳过 ${orphanBindings.length} 条孤儿歌单绑定，来源: ${sourceId}`
            );
        }
        const playlistIds = Array.from(new Set(activeBindings.map(binding => binding.playlistId)));
        const additions = playlistIds.map(playlistId => ({
            playlistId,
            trackIds: this.recomputePlaylistMembership(playlistId)
        }));
        if (playlistIds.length > 0) {
            await this.libraryCacheManager.saveCache();
            for (const addition of additions) {
                await this.maybeSetAutomaticPlaylistCover(addition.playlistId, addition.trackIds);
            }
            if (publishUpdates) this.emitPlaylistsUpdated();
        }
    }

    private recomputePlaylistMembership(playlistId: string): string[] {
        const existingPlaylist = this.libraryCacheManager.getPlaylistById(playlistId);
        if (!existingPlaylist) {
            console.warn(`⚠️ 跳过不存在歌单的成员物化: ${playlistId}`);
            return [];
        }
        const previousTrackIds = new Set(
            existingPlaylist.trackIds
        );
        const bindings = this.librarySourceManager.getPlaylistBindings()
            .filter(binding => binding.playlistId === playlistId);
        const bindingTrackIds = bindings.flatMap(binding => {
            const excludedPaths = new Set(binding.excludedPaths);
            return binding.managedFiles.flatMap(file => (
                file.trackId && !excludedPaths.has(file.canonicalPath) ? [file.trackId] : []
            ));
        });
        const playlist = this.libraryCacheManager.setPlaylistMaterializedTracks(playlistId, bindingTrackIds);
        return playlist.trackIds.filter(trackId => !previousTrackIds.has(trackId));
    }

    private getActiveBindingTrackIds(binding: PlaylistSourceBinding): string[] {
        const excludedPaths = new Set(binding.excludedPaths);
        return binding.managedFiles.flatMap(file => (
            file.trackId && !excludedPaths.has(file.canonicalPath) ? [file.trackId] : []
        ));
    }

    private emitPlaylistsUpdated(): void {
        this.windowManager.sendToMainWindow(
            'library:playlistsUpdated',
            this.libraryCacheManager.getAllPlaylists()
        );
    }

    private emitSourcesUpdated(): void {
        this.windowManager.sendToMainWindow(
            'library:sourcesUpdated',
            this.librarySourceManager.getSources()
        );
    }

    @IpcHandle('library:getLibrarySources')
    async getLibrarySources(): Promise<any[]> {
        await this.ensureLibrarySourcesLoaded();
        return this.librarySourceManager.getSources();
    }

    @IpcHandle('library:getLibraryDirectoryOverviews')
    async getLibraryDirectoryOverviews(): Promise<LibraryDirectoryOverview[]> {
        await this.ensureLibrarySourcesLoaded();
        const bindings = this.librarySourceManager.getPlaylistBindings();
        const playlistsById = new Map(
            this.libraryCacheManager.getAllPlaylists().map(playlist => [playlist.id, playlist])
        );

        return this.librarySourceManager.getSources()
            .filter(source => source.type === 'directory')
            .map(source => ({
                id: source.id,
                path: source.path,
                origin: source.origin,
                createdAt: source.createdAt,
                lastScanAt: source.lastScanAt,
                trackCount: this.getTracksForSource(source.id).length,
                bindings: bindings
                    .filter(binding => binding.sourceId === source.id)
                    .flatMap(binding => {
                        const playlist = playlistsById.get(binding.playlistId);
                        if (!playlist) return [];
                        const excludedPaths = new Set(binding.excludedPaths);
                        return [{
                            id: binding.id,
                            playlistId: binding.playlistId,
                            playlistName: playlist.name,
                            availableTrackCount: binding.managedFiles.filter(file => (
                                file.trackId && !excludedPaths.has(file.canonicalPath)
                            )).length,
                            excludedTrackCount: binding.excludedPaths.length,
                            createdAt: binding.createdAt,
                            lastSyncAt: binding.lastSyncAt
                        }];
                    })
            }));
    }

    @IpcHandle('library:getTracksByLibrarySource')
    async getTracksByLibrarySource(sourceId: string): Promise<CachedTrack[]> {
        try {
            await this.ensureLibrarySourcesLoaded();
            const source = this.librarySourceManager.getSource(sourceId);
            if (!source) {
                console.warn(`⚠️ LibraryController: 音乐库来源不存在: ${sourceId}`);
                return [];
            }
            return this.getTracksForSource(source.id);
        } catch (error: any) {
            console.error('❌ 获取音乐库来源歌曲失败:', error);
            return [];
        }
    }

    @IpcHandle('library:rescanLibrarySource')
    async rescanLibrarySource(sourceId: string): Promise<{success: boolean; error?: string}> {
        try {
            await this.ensureLibrarySourcesLoaded();
            const source = this.librarySourceManager.getSource(sourceId);
            if (!source) throw new Error('音乐库来源不存在');
            if (source.type !== 'directory') throw new Error('只能重新扫描音乐文件夹来源');
            const success = await this.scanDirectorySource(source.path, source.id);
            this.emitSourcesUpdated();
            return {success, error: success ? undefined : '重新扫描文件夹失败'};
        } catch (error: any) {
            return {success: false, error: error.message};
        }
    }

    @IpcHandle('library:registerLibraryDirectory')
    async registerLibraryDirectory(
        directoryPath: string
    ): Promise<{success: boolean; source?: any; error?: string}> {
        try {
            await this.ensureLibrarySourcesLoaded();
            const {source} = await this.librarySourceManager.ensureSource(
                'directory',
                directoryPath,
                'settings'
            );
            this.emitSourcesUpdated();
            return {success: true, source};
        } catch (error: any) {
            return {success: false, error: error.message};
        }
    }

    @IpcHandle('library:removeLibraryDirectory')
    async removeLibraryDirectory(
        directoryPath: string
    ): Promise<{success: boolean; removedTrackCount?: number; error?: string}> {
        try {
            await this.ensureLibrarySourcesLoaded();
            const sourceId = this.librarySourceManager.createSourceId('directory', directoryPath);
            return await this.removeLibrarySource(sourceId);
        } catch (error: any) {
            return {success: false, error: error.message};
        }
    }

    @IpcHandle('library:getPlaylistBindings')
    async getPlaylistBindings(playlistId: string): Promise<any[]> {
        await this.ensureLibrarySourcesLoaded();
        return this.librarySourceManager.getPlaylistBindings()
            .filter(binding => binding.playlistId === playlistId)
            .map(binding => {
                const source = this.librarySourceManager.getSource(binding.sourceId);
                const excludedPaths = new Set(binding.excludedPaths);
                return {
                    ...binding,
                    source,
                    availableTrackCount: binding.managedFiles.filter(file => (
                        file.trackId && !excludedPaths.has(file.canonicalPath)
                    )).length,
                    excludedTrackCount: binding.excludedPaths.length
                };
            });
    }

    @IpcHandle('library:bindDirectoryToPlaylist')
    async bindDirectoryToPlaylist(
        playlistId: string,
        directoryPath: string
    ): Promise<{success: boolean; binding?: any; error?: string}> {
        try {
            await this.ensureLibrarySourcesLoaded();
            const playlist = this.libraryCacheManager.getPlaylistById(playlistId);
            if (!playlist) throw new Error('歌单不存在');
            if (playlist.systemType === 'favorites') throw new Error('收藏歌单不支持绑定文件夹');

            const {source} = await this.librarySourceManager.ensureSource(
                'directory',
                directoryPath,
                'playlist_binding'
            );
            const {binding} = await this.librarySourceManager.createPlaylistBinding(playlistId, source.id);
            const scanned = await this.scanDirectorySource(directoryPath, source.id);
            this.emitSourcesUpdated();
            return {
                success: scanned,
                binding: this.librarySourceManager.getPlaylistBinding(binding.id),
                error: scanned ? undefined : '文件夹已绑定，但首次扫描失败'
            };
        } catch (error: any) {
            return {success: false, error: error.message};
        }
    }

    @IpcHandle('library:bindLibrarySourceToPlaylist')
    async bindLibrarySourceToPlaylist(
        playlistId: string,
        sourceId: string
    ): Promise<{success: boolean; binding?: any; error?: string}> {
        try {
            await this.ensureLibrarySourcesLoaded();
            const playlist = this.libraryCacheManager.getPlaylistById(playlistId);
            if (!playlist) throw new Error('歌单不存在');
            if (playlist.systemType === 'favorites') throw new Error('收藏歌单不支持绑定文件夹');
            const source = this.librarySourceManager.getSource(sourceId);
            if (!source) throw new Error('音乐库来源不存在');
            if (source.type !== 'directory') throw new Error('只能绑定音乐文件夹来源');

            const {binding} = await this.librarySourceManager.createPlaylistBinding(playlistId, source.id);
            await this.librarySourceManager.synchronizeSourceBindings(source.id);
            const addedTrackIds = this.recomputePlaylistMembership(playlistId);
            await this.libraryCacheManager.saveCache();
            await this.maybeSetAutomaticPlaylistCover(playlistId, addedTrackIds);
            this.emitPlaylistsUpdated();
            this.emitSourcesUpdated();
            return {
                success: true,
                binding: this.librarySourceManager.getPlaylistBinding(binding.id)
            };
        } catch (error: any) {
            return {success: false, error: error.message};
        }
    }

    @IpcHandle('library:rescanPlaylistBinding')
    async rescanPlaylistBinding(bindingId: string): Promise<{success: boolean; error?: string}> {
        try {
            await this.ensureLibrarySourcesLoaded();
            const binding = this.librarySourceManager.getPlaylistBinding(bindingId);
            if (!binding) throw new Error('歌单文件夹绑定不存在');
            const source = this.librarySourceManager.getSource(binding.sourceId);
            if (!source) throw new Error('音乐库来源不存在');
            const success = await this.scanDirectorySource(source.path, source.id);
            this.emitSourcesUpdated();
            return {success, error: success ? undefined : '重新扫描文件夹失败'};
        } catch (error: any) {
            return {success: false, error: error.message};
        }
    }

    @IpcHandle('library:restorePlaylistBindingExclusions')
    async restorePlaylistBindingExclusions(
        bindingId: string
    ): Promise<{success: boolean; restoredCount?: number; error?: string}> {
        try {
            await this.ensureLibrarySourcesLoaded();
            const binding = this.librarySourceManager.getPlaylistBinding(bindingId);
            if (!binding) throw new Error('歌单文件夹绑定不存在');
            const restoredCount = await this.librarySourceManager.restorePlaylistBindingExclusions(bindingId);
            const addedTrackIds = this.recomputePlaylistMembership(binding.playlistId);
            await this.libraryCacheManager.saveCache();
            await this.maybeSetAutomaticPlaylistCover(binding.playlistId, addedTrackIds);
            this.emitPlaylistsUpdated();
            this.emitSourcesUpdated();
            return {success: true, restoredCount};
        } catch (error: any) {
            return {success: false, error: error.message};
        }
    }

    @IpcHandle('library:unbindDirectoryFromPlaylist')
    async unbindDirectoryFromPlaylist(
        bindingId: string,
        mode: 'keep' | 'remove'
    ): Promise<{success: boolean; error?: string}> {
        try {
            await this.ensureLibrarySourcesLoaded();
            if (mode !== 'keep' && mode !== 'remove') throw new Error('无效的解绑模式');
            const binding = this.librarySourceManager.getPlaylistBinding(bindingId);
            if (!binding) throw new Error('歌单文件夹绑定不存在');
            if (mode === 'keep') {
                this.libraryCacheManager.addManualTracksToPlaylist(
                    binding.playlistId,
                    this.getActiveBindingTrackIds(binding)
                );
            }
            await this.librarySourceManager.removePlaylistBinding(bindingId);
            this.recomputePlaylistMembership(binding.playlistId);
            await this.libraryCacheManager.saveCache();
            this.emitPlaylistsUpdated();
            this.emitSourcesUpdated();
            return {success: true};
        } catch (error: any) {
            return {success: false, error: error.message};
        }
    }

    @IpcHandle('library:removeLibrarySource')
    async removeLibrarySource(
        sourceId: string
    ): Promise<{success: boolean; removedTrackCount?: number; error?: string}> {
        try {
            await this.ensureLibrarySourcesLoaded();
            const source = this.librarySourceManager.getSource(sourceId);
            if (!source) throw new Error('音乐库来源不存在');

            const uniqueTrackIds = source.knownFiles.flatMap(file => {
                if (this.librarySourceManager.isFileCoveredByOtherSource(file.path, sourceId)) return [];
                const trackId = this.libraryCacheManager.getTrackByPath(file.path)?.fileId || file.trackId;
                return trackId ? [trackId] : [];
            });
            const affectedPlaylistIds = this.librarySourceManager.getPlaylistBindings()
                .filter(binding => binding.sourceId === sourceId)
                .map(binding => binding.playlistId);

            await this.librarySourceManager.removeSource(sourceId);
            if (source.type === 'directory') {
                await this.removeMusicFolder(source.path).catch(error => {
                    console.warn('⚠️ 移除兼容音乐文件夹设置失败:', error);
                });
            }
            const removedTrackCount = this.libraryCacheManager.removeTracksFromIndex(uniqueTrackIds);
            for (const playlistId of Array.from(new Set(affectedPlaylistIds))) {
                this.recomputePlaylistMembership(playlistId);
            }
            await this.libraryCacheManager.saveCache();
            this.windowManager.sendToMainWindow('library:updated', this.libraryCacheManager.getTracks());
            this.emitPlaylistsUpdated();
            this.emitSourcesUpdated();
            return {success: true, removedTrackCount};
        } catch (error: any) {
            return {success: false, error: error.message};
        }
    }

    @IpcHandle('library:importLibraryFiles')
    async importLibraryFiles(
        filePaths: string[],
        targetPlaylistId?: string
    ): Promise<LibraryImportResult> {
        const tracks: CachedTrack[] = [];
        const failedPaths: string[] = [];

        try {
            await this.ensureLibrarySourcesLoaded();
            if (targetPlaylistId) {
                const playlist = this.libraryCacheManager.getPlaylistById(targetPlaylistId);
                if (!playlist) throw new Error('歌单不存在');
                if (playlist.systemType === 'favorites') throw new Error('收藏歌单不支持从文件导入');
            }
            for (const filePath of Array.from(new Set(filePaths || []))) {
                try {
                    const track = await this.importLibraryFile(filePath, true);
                    if (track) tracks.push(track);
                } catch (error: any) {
                    failedPaths.push(filePath);
                    console.warn(`⚠️ 导入音乐文件失败 ${filePath}:`, error.message);
                }
            }

            let coverResult: PlaylistCoverUpdateResult = {coverUpdated: false};
            if (targetPlaylistId && tracks.length > 0) {
                const addedTrackIds: string[] = [];
                for (const track of tracks) {
                    try {
                        this.libraryCacheManager.addTrackToPlaylist(targetPlaylistId, track.fileId);
                        addedTrackIds.push(track.fileId);
                    } catch (error: any) {
                        if (error.message !== '歌曲已在歌单中') throw error;
                    }
                }
                await this.libraryCacheManager.saveCache();
                coverResult = await this.maybeSetAutomaticPlaylistCover(targetPlaylistId, addedTrackIds);
                this.emitPlaylistsUpdated();
            }
            this.windowManager.sendToMainWindow('library:updated', this.libraryCacheManager.getTracks());
            this.emitSourcesUpdated();
            return {
                success: failedPaths.length === 0,
                tracks,
                failedPaths,
                ...coverResult,
                error: failedPaths.length > 0 ? `${failedPaths.length} 个文件导入失败` : undefined
            };
        } catch (error: any) {
            console.error('❌ 导入音乐文件失败:', error);
            return {success: false, tracks, failedPaths: filePaths || [], error: error.message};
        }
    }

    private async importLibraryFile(
        filePath: string,
        restoreIgnored: boolean
    ): Promise<CachedTrack | null> {
        const extension = path.extname(filePath).toLowerCase();
        if (!AUDIO_EXTENSIONS.includes(extension)) throw new Error('不支持的音频格式');

        const isNetwork = this.networkFileAdapter.isNetworkPath(filePath);
        const stats = isNetwork
            ? await this.networkFileAdapter.stat(filePath)
            : await fs.promises.stat(filePath);
        const isDirectory = typeof stats.isDirectory === 'function'
            ? stats.isDirectory()
            : Boolean((stats as any).isDirectory);
        if (isDirectory) throw new Error('所选路径是文件夹');

        const {source} = await this.librarySourceManager.ensureSource('file', filePath, 'file_import');
        const restoredFromIgnoreList = restoreIgnored
            ? this.libraryCacheManager.removeFromIgnoreList(filePath)
            : false;
        if (!restoreIgnored && this.libraryCacheManager.isFileIgnored(filePath)) {
            await this.librarySourceManager.updateSourceScan(
                source.id,
                this.createKnownFiles([filePath]),
                true
            );
            return null;
        }

        const existing = this.libraryCacheManager.getTrackByPath(filePath);
        if (existing) {
            if (restoredFromIgnoreList) await this.libraryCacheManager.saveCache();
            await this.librarySourceManager.updateSourceScan(
                source.id,
                this.createKnownFiles([filePath]),
                true
            );
            return existing;
        }

        const metadata = await this.parseMetadata(
            filePath,
            isNetwork ? this.networkFileAdapter : undefined,
            {skipCover: true, skipLyrics: true}
        );
        const fileName = path.basename(filePath);
        const track = this.libraryCacheManager.addTrack({
            filePath,
            fileName,
            title: metadata.title || path.basename(fileName, extension),
            artist: metadata.artist || '未知艺术家',
            album: metadata.album || '未知专辑',
            duration: metadata.duration || 0,
            bitrate: metadata.bitrate,
            sampleRate: metadata.sampleRate,
            year: metadata.year,
            genre: Array.isArray(metadata.genre) ? metadata.genre.join(', ') : (metadata.genre || ''),
            track: (metadata as any).track,
            disc: (metadata as any).disc,
            embeddedLyrics: metadata.embeddedLyrics,
            fileSize: stats.size || 0,
            isNetworkFile: isNetwork
        }, filePath, stats as fs.Stats);
        if (!track) throw new Error('歌曲添加失败');

        await this.libraryCacheManager.saveCache();
        await this.librarySourceManager.updateSourceScan(
            source.id,
            this.createKnownFiles([filePath]),
            true
        );
        return track;
    }

    @IpcHandle('library:scanSingleFile')
    async scanSingleFile(networkPath: string): Promise<any> {
        const existed = Boolean(this.libraryCacheManager.getTrackByPath(networkPath));
        const result = await this.importLibraryFiles([networkPath]);
        return {
            success: result.success,
            track: result.tracks[0],
            isNew: result.success ? !existed : undefined,
            error: result.error
        };
    }

    @IpcHandle('library:scanNetworkDrive')
    async scanNetworkDrive(driveId: string, relativePath = '/'): Promise<boolean> {
        try {
            const driveInfo = this.networkDriveManager.getDriveInfo(driveId);
            if (!driveInfo) throw new Error(`网络磁盘 ${driveId} 未找到`);
            const status = this.networkDriveManager.getDriveStatus(driveId);
            if (!status || !status.connected) throw new Error(`网络磁盘 ${driveId} 未连接`);
            const networkPath = this.networkFileAdapter.buildNetworkPath(driveId, relativePath);
            console.log(`🌐 扫描网络磁盘: ${driveInfo.config.displayName} - ${networkPath}`);
            return (await this.importLibraryDirectory(networkPath)).success;
        } catch (error: any) {
            console.error('❌ 网络磁盘扫描失败:', error);
            return false;
        }
    }

    @IpcHandle('library:addTrackToLibrary')
    async addTrackToLibrary(audioFile: any): Promise<{
        success: boolean;
        track?: any;
        isNew?: boolean;
        error?: string
    }> {
        const filePath = audioFile?.filePath;
        if (!filePath) return {success: false, error: '缺少音频文件路径'};
        const existed = Boolean(this.libraryCacheManager.getTrackByPath(filePath));
        const result = await this.importLibraryFiles([filePath]);
        return {
            success: result.success,
            track: result.tracks[0],
            isNew: result.success ? !existed : undefined,
            error: result.error
        };
    }

    private async updateNetworkFileMetadata(filePath: string, metadata: any): Promise<any> {
        const os = require('os');
        const tempFilePath = path.join(os.tmpdir(), `musicbox_net_${Date.now()}${path.extname(filePath)}`);
        try {
            const buffer = await this.networkFileAdapter.readFile(filePath);
            await fs.promises.writeFile(tempFilePath, buffer);
            const result = await this.metadataHandler.updateMetadata(tempFilePath, metadata);
            if (!result.success) throw new Error(result.error || '临时文件元数据更新失败');
            const modifiedBuffer = await fs.promises.readFile(tempFilePath);
            await this.networkFileAdapter.writeFile(filePath, modifiedBuffer);
            return {success: true, method: '网络文件临时编辑'};
        } catch (error: any) {
            console.error(`❌ 网络文件元数据更新失败: ${error.message}`);
            throw error;
        } finally {
            try {
                await fs.promises.unlink(tempFilePath);
            } catch {
            }
        }
    }
}
