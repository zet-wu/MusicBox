import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';

const electronPaths = vi.hoisted(() => ({userData: ''}));

vi.mock('electron', () => ({
    app: {
        getPath: () => electronPaths.userData
    },
}));

import {CoverCacheStorage} from '../../../main/services/library/CoverCacheStorage';

describe('封面磁盘缓存清理', () => {
    let temporaryDirectory;
    let storage;

    beforeEach(async () => {
        temporaryDirectory = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'musicbox-cover-cache-'));
        electronPaths.userData = temporaryDirectory;
        storage = new CoverCacheStorage();
    });

    afterEach(async () => {
        await fs.promises.rm(temporaryDirectory, {recursive: true, force: true});
    });

    it('完整清理默认应用管理目录', async () => {
        const resolved = await storage.resolveCacheDirectory();
        expect(resolved.path).toBe(path.join(temporaryDirectory, 'CoverCache'));

        await fs.promises.writeFile(path.join(resolved.path, 'cached.jpg'), 'cache');
        await fs.promises.mkdir(path.join(resolved.path, 'nested'));
        await fs.promises.writeFile(path.join(resolved.path, 'nested', 'cached.png'), 'cache');

        const result = await storage.clearCache(resolved.path);

        expect(result).toEqual({
            deletedFileCount: 2,
            preservedUnknownFileCount: 0
        });
        expect(await fs.promises.readdir(resolved.path)).toEqual([]);
    });

    it('自定义目录只删除清单内文件并保留未知图片', async () => {
        const selectedDirectory = path.join(temporaryDirectory, 'custom');
        const resolved = await storage.resolveCacheDirectory(selectedDirectory);
        expect(resolved.path).toBe(path.join(selectedDirectory, 'MusicBoxCoverCache'));

        await fs.promises.writeFile(path.join(resolved.path, 'managed.jpg'), new Uint8Array([1, 2, 3]));
        await storage.recordManagedFile(resolved.path, 'managed.jpg');

        await fs.promises.writeFile(path.join(resolved.path, 'user-image.jpg'), 'user');
        await fs.promises.writeFile(path.join(selectedDirectory, 'original.png'), 'original');

        const result = await storage.clearCache(resolved.path);

        expect(result).toEqual({
            deletedFileCount: 1,
            preservedUnknownFileCount: 1
        });
        await expect(fs.promises.access(path.join(resolved.path, 'managed.jpg'))).rejects.toThrow();
        await expect(fs.promises.readFile(path.join(resolved.path, 'user-image.jpg'), 'utf8')).resolves.toBe('user');
        await expect(fs.promises.readFile(path.join(selectedDirectory, 'original.png'), 'utf8')).resolves.toBe('original');
    });

    it('拒绝接管已有内容且没有所有权标记的自定义子目录', async () => {
        const selectedDirectory = path.join(temporaryDirectory, 'occupied-custom');
        const unmanagedDirectory = path.join(selectedDirectory, 'MusicBoxCoverCache');
        await fs.promises.mkdir(unmanagedDirectory, {recursive: true});
        await fs.promises.writeFile(path.join(unmanagedDirectory, 'user-image.jpg'), 'user');

        await expect(storage.resolveCacheDirectory(selectedDirectory)).rejects.toThrow('不属于 MusicBox');
        await expect(fs.promises.readFile(path.join(unmanagedDirectory, 'user-image.jpg'), 'utf8')).resolves.toBe('user');
    });
});
