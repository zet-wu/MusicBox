import {ElectronNamespaceAdapter} from './ElectronBridge';

export interface LocalCoverFileResult {
    success: boolean;
    filePath?: string;
    fileName?: string;
    error?: string;
}

export interface CoverImageDataResult {
    success: boolean;
    data?: number[];
    mimeType?: string;
    error?: string;
}

export interface CoverCacheDirectoryResult {
    success: boolean;
    path?: string;
    isDefault?: boolean;
    error?: string;
}

export interface CoverDiskCacheClearResult {
    success: boolean;
    deletedFileCount?: number;
    preservedUnknownFileCount?: number;
    error?: string;
}

class CoversGateway extends ElectronNamespaceAdapter<'covers'> {
    constructor() {
        super('covers');
    }

    resolveCacheDirectory(selectedDirectory?: string | null): Promise<CoverCacheDirectoryResult> {
        return this.call('resolveCacheDirectory', selectedDirectory);
    }

    clearCache(coverDirectory: string): Promise<CoverDiskCacheClearResult> {
        return this.call('clearCache', coverDirectory);
    }

    checkLocalCover(
        coverDir: string,
        title: string,
        artist: string,
        album: string,
        isAlbum = false
    ): Promise<LocalCoverFileResult> {
        return this.call('checkLocalCover', coverDir, title, artist, album, isAlbum);
    }

    saveCoverFile(
        coverDir: string,
        fileName: string,
        imageData: unknown,
        dataType: string
    ): Promise<LocalCoverFileResult> {
        return this.call('saveCoverFile', coverDir, fileName, imageData, dataType);
    }

    readCoverImage(filePath: string): Promise<CoverImageDataResult> {
        return this.call('readCoverImage', filePath);
    }
}

export const coversGateway = new CoversGateway();
