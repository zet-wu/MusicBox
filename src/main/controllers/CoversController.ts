// 封面控制器

import * as fs from 'fs';
import * as path from 'path';
import * as https from 'https';
import * as http from 'http';
import {BaseController, Controller, IpcHandle} from '../decorators/IpcHandler';
import {cleanCoverFileName} from '../utils/string';
import {generateCoverSearchPatterns, findBestCoverMatch} from '../utils/FileSearch';
import {isSafePath} from '../utils/pathSecurity';
import {CoverCacheStorage} from '../services/library/CoverCacheStorage';

interface DirCache {
    files: string[];
    expiresAt: number;
}

const DIR_CACHE_TTL = 60_000;
const IMAGE_MIME_TYPES: Record<string, string> = {
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.png': 'image/png',
    '.gif': 'image/gif',
    '.webp': 'image/webp',
    '.bmp': 'image/bmp',
    '.svg': 'image/svg+xml'
};

function getImageMimeType(filePath: string): string | null {
    return IMAGE_MIME_TYPES[path.extname(filePath).toLowerCase()] || null;
}

async function downloadImageFromUrl(url: string, filePath: string): Promise<{ success: boolean; error?: string }> {
    return new Promise(resolve => {
        const client = url.startsWith('https') ? https : http;
        const req = (client as any).get(url, (response: any) => {
            if (response.statusCode === 200) {
                const stream = fs.createWriteStream(filePath);
                response.pipe(stream);
                stream.on('finish', () => {
                    stream.close();
                    resolve({success: true});
                });
                stream.on('error', (e: any) => {
                    fs.unlink(filePath, () => {
                    });
                    resolve({success: false, error: e.message});
                });
            } else {
                resolve({success: false, error: `HTTP ${response.statusCode}`});
            }
        });
        req.on('error', (e: any) => resolve({success: false, error: e.message}));
        req.setTimeout(10000, () => {
            req.destroy();
            resolve({success: false, error: '下载超时'});
        });
    });
}

@Controller('covers')
export class CoversController extends BaseController {
    private dirCache = new Map<string, DirCache>();

    constructor(private readonly coverCacheStorage = new CoverCacheStorage()) {
        super();
    }

    private async getCachedDir(coverDir: string): Promise<string[]> {
        const now = Date.now();
        const cached = this.dirCache.get(coverDir);
        if (cached && cached.expiresAt > now) return cached.files;
        const files = await fs.promises.readdir(coverDir);
        this.dirCache.set(coverDir, {files, expiresAt: now + DIR_CACHE_TTL});
        return files;
    }

    @IpcHandle('covers:resolveCacheDirectory')
    async resolveCacheDirectory(selectedDirectory?: string | null): Promise<{
        success: boolean;
        path?: string;
        isDefault?: boolean;
        error?: string;
    }> {
        try {
            const resolved = await this.coverCacheStorage.resolveCacheDirectory(selectedDirectory);
            return {success: true, ...resolved};
        } catch (error: any) {
            return {success: false, error: error.message};
        }
    }

    @IpcHandle('covers:clearCache')
    async clearCache(coverDirectory: string): Promise<{
        success: boolean;
        deletedFileCount?: number;
        preservedUnknownFileCount?: number;
        error?: string;
    }> {
        try {
            this.dirCache.clear();
            return {success: true, ...await this.coverCacheStorage.clearCache(coverDirectory)};
        } catch (error: any) {
            this.dirCache.clear();
            return {success: false, error: error.message};
        }
    }

    @IpcHandle('covers:checkLocalCover')
    async checkLocalCover(
        coverDir: string,
        title: string,
        artist: string,
        album: string,
        isAlbum = false
    ): Promise<{ success: boolean; filePath?: string; fileName?: string; error?: string }> {
        try {
            try {
                await fs.promises.access(coverDir);
            } catch {
                return {success: false, error: '封面缓存目录不存在'};
            }

            const files = await this.getCachedDir(coverDir);
            const imageFiles = files.filter(f => ['.jpg', '.jpeg', '.png', '.webp', '.gif'].includes(path.extname(f).toLowerCase()));

            if (isAlbum) {
                const cleanArtist = cleanCoverFileName(artist);
                const cleanAlbum = cleanCoverFileName(album);
                const expectedBase = album
                    ? `${cleanArtist}_${cleanAlbum}__ALBUM`.toLowerCase()
                    : `${cleanArtist}__ARTIST`.toLowerCase();

                const matched = imageFiles.find(f => path.parse(f).name.toLowerCase() === expectedBase);
                if (matched) {
                    return {success: true, filePath: path.join(coverDir, matched), fileName: matched};
                }
                return {success: false, error: '未找到匹配的封面文件'};
            } else {
                const searchPatterns = generateCoverSearchPatterns(title, artist, album);
                const matched = findBestCoverMatch(imageFiles, searchPatterns);
                if (matched) {
                    return {success: true, filePath: path.join(coverDir, matched), fileName: matched};
                }
                return {success: false, error: '未找到匹配的封面文件'};
            }
        } catch (error: any) {
            return {success: false, error: error.message};
        }
    }

    @IpcHandle('covers:saveCoverFile')
    async saveCoverFile(
        coverDir: string,
        fileName: string,
        imageData: any,
        dataType: string
    ): Promise<{ success: boolean; filePath?: string; fileName?: string; error?: string }> {
        try {
            const managed = await this.coverCacheStorage.assertManagedDirectory(coverDir);
            if (path.basename(fileName) !== fileName) {
                return {success: false, error: '封面文件名无效'};
            }
            await fs.promises.mkdir(managed.path, {recursive: true});
            const fullPath = path.join(managed.path, fileName);
            if (!isSafePath(fullPath, [managed.path])) {
                return {success: false, error: '封面文件路径超出缓存目录'};
            }
            const invalidate = () => this.dirCache.delete(managed.path);
            const finalize = async () => {
                try {
                    await this.coverCacheStorage.recordManagedFile(managed.path, fileName);
                } catch (error) {
                    await fs.promises.unlink(fullPath).catch(() => undefined);
                    throw error;
                }
                invalidate();
                return {success: true, filePath: fullPath, fileName};
            };

            if (dataType === 'arrayBuffer') {
                await fs.promises.writeFile(fullPath, Buffer.from(imageData));
                return await finalize();
            } else if (dataType === 'string' || typeof imageData === 'string') {
                if (imageData.startsWith('http')) {
                    const result = await downloadImageFromUrl(imageData, fullPath);
                    return result.success ? await finalize() : {
                        success: false,
                        error: result.error
                    };
                } else {
                    const base64Data = imageData.replace(/^data:image\/[a-z]+;base64,/, '');
                    await fs.promises.writeFile(fullPath, base64Data, 'base64');
                    return await finalize();
                }
            } else if (imageData instanceof Buffer) {
                await fs.promises.writeFile(fullPath, imageData);
                return await finalize();
            }
            return {success: false, error: `不支持的图片数据格式: ${typeof imageData}`};
        } catch (error: any) {
            return {success: false, error: error.message};
        }
    }

    @IpcHandle('covers:readCoverImage')
    async readCoverImage(filePath: string): Promise<{ success: boolean; data?: number[]; mimeType?: string; error?: string }> {
        try {
            const mimeType = getImageMimeType(filePath);
            if (!mimeType) {
                return {success: false, error: '不支持的封面图片格式'};
            }

            const buffer = await fs.promises.readFile(filePath);
            return {
                success: true,
                data: Array.from(buffer),
                mimeType
            };
        } catch (error: any) {
            return {success: false, error: error.message};
        }
    }
}
