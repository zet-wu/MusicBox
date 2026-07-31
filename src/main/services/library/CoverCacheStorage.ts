import * as fs from 'fs';
import * as path from 'path';
import {app} from 'electron';
import {isDangerousPath, isSafePath} from '../../utils/pathSecurity';

const CUSTOM_CACHE_SUBDIRECTORY = 'MusicBoxCoverCache';
const CACHE_OWNER_MARKER = '.musicbox-cover-cache';
const CACHE_MANIFEST = '.musicbox-cover-cache-manifest.json';
const CACHE_OWNER_SIGNATURE = 'MusicBox managed cover cache\n';

export interface ManagedCoverCacheDirectory {
    path: string;
    isDefault: boolean;
}

export interface CoverDiskCacheClearResult {
    deletedFileCount: number;
    preservedUnknownFileCount: number;
}

export class CoverCacheStorage {
    private manifestUpdateQueues = new Map<string, Promise<void>>();

    constructor(private readonly getUserDataPath = () => app.getPath('userData')) {
    }

    private getDefaultCoverCacheDirectory(): string {
        return path.resolve(this.getUserDataPath(), 'CoverCache');
    }

    private pathsEqual(first: string, second: string): boolean {
        const normalize = (value: string) => {
            const resolved = path.resolve(value);
            return process.platform === 'win32' ? resolved.toLowerCase() : resolved;
        };
        return normalize(first) === normalize(second);
    }

    private async ensureCustomCacheOwnership(cacheDirectory: string): Promise<void> {
        await fs.promises.mkdir(cacheDirectory, {recursive: true});
        const markerPath = path.join(cacheDirectory, CACHE_OWNER_MARKER);

        try {
            const signature = await fs.promises.readFile(markerPath, 'utf8');
            if (signature !== CACHE_OWNER_SIGNATURE) {
                throw new Error('自定义封面缓存目录的所有权标记无效');
            }
            return;
        } catch (error: any) {
            if (error.code !== 'ENOENT') throw error;
        }

        const existingEntries = await fs.promises.readdir(cacheDirectory);
        if (existingEntries.length > 0) {
            throw new Error('自定义缓存子目录已存在且不属于 MusicBox');
        }
        await fs.promises.writeFile(markerPath, CACHE_OWNER_SIGNATURE, {encoding: 'utf8', flag: 'wx'});
    }

    async resolveCacheDirectory(
        selectedDirectory?: string | null,
        create = true
    ): Promise<ManagedCoverCacheDirectory> {
        const defaultDirectory = this.getDefaultCoverCacheDirectory();
        if (!selectedDirectory || this.pathsEqual(selectedDirectory, defaultDirectory)) {
            if (create) await fs.promises.mkdir(defaultDirectory, {recursive: true});
            return {path: defaultDirectory, isDefault: true};
        }

        if (isDangerousPath(selectedDirectory)) {
            throw new Error('所选封面缓存路径不安全');
        }

        const selectedPath = path.resolve(selectedDirectory);
        const managedPath = path.basename(selectedPath) === CUSTOM_CACHE_SUBDIRECTORY
            ? selectedPath
            : path.join(selectedPath, CUSTOM_CACHE_SUBDIRECTORY);
        if (!isSafePath(managedPath, [selectedPath]) || isDangerousPath(managedPath)) {
            throw new Error('封面缓存子目录超出所选目录');
        }

        if (create) await this.ensureCustomCacheOwnership(managedPath);
        return {path: managedPath, isDefault: false};
    }

    async assertManagedDirectory(coverDirectory: string): Promise<ManagedCoverCacheDirectory> {
        const resolved = await this.resolveCacheDirectory(coverDirectory, false);
        if (resolved.isDefault) return resolved;

        const markerPath = path.join(resolved.path, CACHE_OWNER_MARKER);
        const signature = await fs.promises.readFile(markerPath, 'utf8');
        if (signature !== CACHE_OWNER_SIGNATURE) {
            throw new Error('拒绝访问不属于 MusicBox 的封面缓存目录');
        }
        return resolved;
    }

    private async readManifest(cacheDirectory: string): Promise<Set<string>> {
        try {
            const content = await fs.promises.readFile(path.join(cacheDirectory, CACHE_MANIFEST), 'utf8');
            const entries = JSON.parse(content);
            return new Set(Array.isArray(entries) ? entries.filter(entry => typeof entry === 'string') : []);
        } catch (error: any) {
            if (error.code !== 'ENOENT') {
                console.warn('⚠️ CoverCacheStorage: 读取封面缓存清单失败:', error);
            }
            return new Set();
        }
    }

    async recordManagedFile(cacheDirectory: string, fileName: string): Promise<void> {
        const previous = this.manifestUpdateQueues.get(cacheDirectory) || Promise.resolve();
        const update = previous.then(async () => {
            const manifest = await this.readManifest(cacheDirectory);
            manifest.add(fileName);
            await fs.promises.writeFile(
                path.join(cacheDirectory, CACHE_MANIFEST),
                JSON.stringify([...manifest], null, 2),
                'utf8'
            );
        });
        this.manifestUpdateQueues.set(cacheDirectory, update);
        try {
            await update;
        } finally {
            if (this.manifestUpdateQueues.get(cacheDirectory) === update) {
                this.manifestUpdateQueues.delete(cacheDirectory);
            }
        }
    }

    async clearCache(coverDirectory: string): Promise<CoverDiskCacheClearResult> {
        const managed = await this.assertManagedDirectory(coverDirectory);
        await this.manifestUpdateQueues.get(managed.path);

        if (managed.isDefault) {
            let deletedFileCount = 0;
            const entries = await fs.promises.readdir(managed.path, {withFileTypes: true}).catch(error => {
                if (error.code === 'ENOENT') return [];
                throw error;
            });
            for (const entry of entries) {
                const entryPath = path.join(managed.path, entry.name);
                if (!isSafePath(entryPath, [managed.path])) continue;
                await fs.promises.rm(entryPath, {recursive: true, force: true});
                deletedFileCount++;
            }
            return {deletedFileCount, preservedUnknownFileCount: 0};
        }

        const manifest = await this.readManifest(managed.path);
        let deletedFileCount = 0;
        for (const fileName of manifest) {
            if (path.basename(fileName) !== fileName) continue;
            const filePath = path.join(managed.path, fileName);
            if (!isSafePath(filePath, [managed.path])) continue;
            try {
                await fs.promises.unlink(filePath);
                deletedFileCount++;
            } catch (error: any) {
                if (error.code !== 'ENOENT') throw error;
            }
        }
        await fs.promises.writeFile(path.join(managed.path, CACHE_MANIFEST), '[]', 'utf8');
        const remainingEntries = await fs.promises.readdir(managed.path);
        const preservedUnknownFileCount = remainingEntries.filter(
            entry => entry !== CACHE_OWNER_MARKER && entry !== CACHE_MANIFEST
        ).length;
        return {deletedFileCount, preservedUnknownFileCount};
    }
}
