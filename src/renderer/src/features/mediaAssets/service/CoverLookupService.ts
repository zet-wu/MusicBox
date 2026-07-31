import {networkRequestClient} from '@/shared/network';
import {urlValidator} from '@utils/URLValidator';
import type {CoverResult, ImageFormat} from '@api/types';
import {embeddedCoverManager} from './EmbeddedCoverManager';
import {localCoverManager} from './LocalCoverManager';
import {mediaAssetsService} from './MediaAssetsService';

export interface CoverCacheClearResult {
    success: boolean;
    memoryCleared: boolean;
    diskCleared: boolean;
    deletedFileCount: number;
    preservedUnknownFileCount: number;
    error?: string;
}

export class CoverLookupService {
    private readonly transientObjectUrls = new Set<string>();

    async getCover(
        title: string,
        artist: string,
        album = '',
        filePath: string | null = null,
        forceRefresh = false,
        options: {allowNetwork?: boolean; signal?: AbortSignal} = {}
    ): Promise<CoverResult> {
        try {
            options.signal?.throwIfAborted();
            if (forceRefresh && filePath) {
                embeddedCoverManager.clearCacheForFile(filePath);
                localCoverManager.clearCacheForTrack(title, artist, album);
            }

            if (filePath) {
                const embeddedCover = await this.getEmbeddedCover(filePath);
                options.signal?.throwIfAborted();
                if (embeddedCover.success) {
                    return embeddedCover;
                }
            }

            const localCover = await this.getLocalCover(title, artist, album);
            options.signal?.throwIfAborted();
            if (localCover.success) {
                return localCover;
            }

            if (options.allowNetwork === false) {
                return {success: false, error: '列表自动联网获取封面已关闭'};
            }

            const networkCover = await this.getNetworkCover(title, artist, album, options.signal);
            options.signal?.throwIfAborted();
            if (networkCover.success) {
                const cachedCover = await this.saveCoverToLocalCache(title, artist, album, networkCover.imageData);
                if (cachedCover) {
                    this.releaseTransientObjectUrl(networkCover.imageUrl);
                    return cachedCover;
                }
                return networkCover;
            }

            return {success: false, error: '未找到封面'};
        } catch (error) {
            this.logError(`封面获取失败: ${title}`, error);
            return {
                success: false,
                error: this.getErrorMessage(error)
            };
        }
    }

    async getEmbeddedCover(filePath: string): Promise<CoverResult> {
        try {
            const embeddedResult: any = await embeddedCoverManager.getEmbeddedCover(filePath);
            if (embeddedResult.success && embeddedResult.url) {
                if (embeddedResult.url.startsWith('blob:')) {
                    return this.createEmbeddedCoverResult(embeddedResult);
                }

                const isValidUrl = urlValidator
                    ? await urlValidator.isValidUrl(embeddedResult.url)
                    : true;
                if (isValidUrl) {
                    return this.createEmbeddedCoverResult(embeddedResult);
                }
            }

            return {success: false};
        } catch (error) {
            return {
                success: false,
                error: this.getErrorMessage(error)
            };
        }
    }

    async getLocalCover(title: string, artist: string, album = ''): Promise<CoverResult> {
        const localCoverResult: any = await localCoverManager.checkLocalCover(title, artist, album);
        if (localCoverResult.success) {
            return {
                success: true,
                imageUrl: `file://${localCoverResult.filePath}`,
                type: 'local-file',
                source: 'local-cache',
                filePath: localCoverResult.filePath
            };
        }

        return {success: false, error: '获取本地缓存封面失败'};
    }

    async getNetworkCover(title: string, artist: string, album = '', signal?: AbortSignal): Promise<CoverResult> {
        try {
            const params = new URLSearchParams();
            if (title) params.append('title', title);
            if (artist) params.append('artist', artist);
            if (album) params.append('album', album);

            const url = `https://api.lrc.cx/cover?${params.toString()}`;
            const response = await networkRequestClient.fetchWithRetry(url, {signal});
            const contentType = response.headers.get('content-type');

            if (contentType && contentType.startsWith('image/')) {
                const blob = await response.blob();
                return {
                    success: true,
                    imageUrl: this.createTransientObjectUrl(blob),
                    type: 'blob',
                    source: 'api',
                    imageData: blob
                };
            }

            if (response.redirected) {
                return {
                    success: true,
                    imageUrl: response.url,
                    type: 'url',
                    source: 'api',
                    imageData: response.url
                };
            }

            const text = await response.text();
            if (text.startsWith('http')) {
                const imageUrl = text.trim();
                return {
                    success: true,
                    imageUrl,
                    type: 'url',
                    source: 'api',
                    imageData: imageUrl
                };
            }

            throw new Error('无效的封面响应格式');
        } catch (error) {
            this.logError('网络封面获取失败', error);
            return {
                success: false,
                error: this.getErrorMessage(error)
            };
        }
    }

    clearCacheForFile(filePath: string): void {
        embeddedCoverManager.clearCacheForFile(filePath);
    }

    clearCacheForTrack(title: string, artist: string, album = ''): void {
        localCoverManager.clearCacheForTrack(title, artist, album);
    }

    async clearAllCache(): Promise<CoverCacheClearResult> {
        this.clearMemoryCache();

        const coverDirectory = localCoverManager.getCoverDirectory();
        if (!coverDirectory) {
            return {
                success: true,
                memoryCleared: true,
                diskCleared: true,
                deletedFileCount: 0,
                preservedUnknownFileCount: 0
            };
        }

        const diskResult = await mediaAssetsService.clearCoverCache(coverDirectory);
        if (!diskResult.success) {
            return {
                success: false,
                memoryCleared: true,
                diskCleared: false,
                deletedFileCount: 0,
                preservedUnknownFileCount: 0,
                error: diskResult.error || '清除磁盘封面缓存失败'
            };
        }

        console.log('✅ Success: 已清除所有封面缓存');
        return {
            success: true,
            memoryCleared: true,
            diskCleared: true,
            deletedFileCount: diskResult.deletedFileCount || 0,
            preservedUnknownFileCount: diskResult.preservedUnknownFileCount || 0
        };
    }

    destroy(): void {
        this.clearMemoryCache();
    }

    private clearMemoryCache(): void {
        embeddedCoverManager.clearCache();
        localCoverManager.clearCache();
        this.clearTransientObjectUrls();
    }

    private createEmbeddedCoverResult(embeddedResult: any): CoverResult {
        return {
            success: true,
            imageUrl: embeddedResult.url,
            type: 'embedded',
            source: 'embedded-cover',
            format: embeddedResult.format,
            size: embeddedResult.size,
            mimeType: embeddedResult.mimeType
        };
    }

    private async saveCoverToLocalCache(
        title: string,
        artist: string,
        album: string,
        imageData: CoverResult['imageData']
    ): Promise<CoverResult | null> {
        try {
            if (!imageData) {
                return null;
            }

            if (!localCoverManager.getCoverDirectory()) {
                console.warn('⚠️ CoverLookupService: 未设置封面缓存目录，跳过本地缓存保存');
                return null;
            }

            const imageFormat = this.detectImageFormat(imageData);
            const saveResult = await localCoverManager.saveCoverToCache(title, artist, album, imageData, imageFormat);
            if (!saveResult.success || !saveResult.filePath) {
                return null;
            }

            console.log(`💾 Cache: 封面已保存到本地缓存: ${title} - ${artist}`);
            return {
                success: true,
                imageUrl: `file://${saveResult.filePath}`,
                type: 'local-file',
                source: 'local-cache',
                filePath: saveResult.filePath
            };
        } catch (error) {
            this.logError('保存封面到本地缓存时发生错误', error);
            return null;
        }
    }

    private detectImageFormat(imageData: CoverResult['imageData']): ImageFormat {
        let imageFormat: ImageFormat = 'jpg';
        if (imageData instanceof Blob) {
            console.log(`🖼️ Cover: Blob MIME类型 - ${imageData.type}`);
            if (imageData.type.includes('png')) imageFormat = 'png';
            else if (imageData.type.includes('webp')) imageFormat = 'webp';
            else if (imageData.type.includes('gif')) imageFormat = 'gif';
            else if (imageData.type.includes('jpeg') || imageData.type.includes('jpg')) {
                imageFormat = 'jpg';
            }
        } else if (typeof imageData === 'string') {
            if (imageData.includes('.png') || imageData.includes('png')) imageFormat = 'png';
            else if (imageData.includes('.webp') || imageData.includes('webp')) imageFormat = 'webp';
            else if (imageData.includes('.gif') || imageData.includes('gif')) imageFormat = 'gif';
        }

        return imageFormat;
    }

    private createTransientObjectUrl(blob: Blob): string {
        const objectUrl = URL.createObjectURL(blob);
        this.transientObjectUrls.add(objectUrl);
        return objectUrl;
    }

    private releaseTransientObjectUrl(url: string | null | undefined): void {
        if (!url || !this.transientObjectUrls.has(url)) {
            return;
        }

        URL.revokeObjectURL(url);
        this.transientObjectUrls.delete(url);
    }

    private clearTransientObjectUrls(): void {
        this.transientObjectUrls.forEach((url) => {
            try {
                URL.revokeObjectURL(url);
            } catch (error) {
                console.warn('⚠️ CoverLookupService: 释放临时封面URL失败:', error);
            }
        });
        this.transientObjectUrls.clear();
    }

    private logError(message: string, error: unknown): void {
        console.error(`❌ CoverLookupService: ${message}`, error);
    }

    private getErrorMessage(error: unknown): string {
        return error instanceof Error ? error.message : String(error);
    }
}

export const coverLookupService = new CoverLookupService();
