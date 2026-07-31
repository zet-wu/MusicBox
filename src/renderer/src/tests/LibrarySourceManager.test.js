import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import {afterEach, describe, expect, it, vi} from 'vitest';

vi.mock('electron', () => ({
    app: {
        getPath: () => '.'
    }
}));

import {
    LibrarySourceManager,
    partitionPlaylistBindings
} from '../../../main/services/library/LibrarySourceManager';

const temporaryDirectories = [];

async function createManager() {
    const directory = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'musicbox-source-test-'));
    temporaryDirectories.push(directory);
    return new LibrarySourceManager(path.join(directory, 'music-library-sources.json'));
}

afterEach(async () => {
    await Promise.all(temporaryDirectories.splice(0).map(directory => (
        fs.promises.rm(directory, {recursive: true, force: true, maxRetries: 3, retryDelay: 50})
    )));
});

describe('歌单绑定有效性', () => {
    it('区分当前歌单绑定和已丢失歌单的孤儿绑定', () => {
        const active = {id: 'active', playlistId: 'playlist-new', sourceId: 'source'};
        const orphan = {id: 'orphan', playlistId: 'playlist-lost', sourceId: 'source'};

        expect(partitionPlaylistBindings([active, orphan], ['playlist-new'])).toEqual({
            activeBindings: [active],
            orphanBindings: [orphan]
        });
    });
});

describe('LibrarySourceManager 旧数据迁移', () => {
    it('合并目录来源，并把目录外歌曲迁移为精确文件来源', async () => {
        const manager = await createManager();
        const musicDirectory = path.resolve('test-files', 'library');
        const insidePath = path.join(musicDirectory, 'inside.flac');
        const outsidePath = path.resolve('test-files', 'playlist-only.flac');

        const result = await manager.loadAndMigrate({
            musicFolders: [musicDirectory],
            scannedDirectories: [musicDirectory],
            tracks: [
                {fileId: 'inside', filePath: insidePath},
                {fileId: 'outside', filePath: outsidePath}
            ]
        });

        expect(result).toMatchObject({
            migrated: true,
            sourceCount: 2,
            directorySourceCount: 1,
            fileSourceCount: 1
        });
        expect(manager.getSources().find(source => source.type === 'file')).toMatchObject({
            path: outsidePath,
            knownFiles: [{
                path: outsidePath,
                trackId: 'outside'
            }]
        });
    });

    it('已有来源文件存在时不重复执行迁移', async () => {
        const manager = await createManager();
        const originalPath = path.resolve('test-files', 'original.flac');
        await manager.loadAndMigrate({
            musicFolders: [],
            scannedDirectories: [],
            tracks: [{fileId: 'original', filePath: originalPath}]
        });

        const reloaded = new LibrarySourceManager(manager.sourceFilePath);
        const result = await reloaded.loadAndMigrate({
            musicFolders: [],
            scannedDirectories: [],
            tracks: [{fileId: 'ignored', filePath: path.resolve('test-files', 'ignored.flac')}]
        });

        expect(result.migrated).toBe(false);
        expect(reloaded.getSources()).toHaveLength(1);
        expect(reloaded.getSources()[0].path).toBe(originalPath);
    });

    it('幂等登记来源，并以完整扫描结果替换已知文件', async () => {
        const manager = await createManager();
        await manager.loadAndMigrate({
            musicFolders: [],
            scannedDirectories: [],
            tracks: []
        });
        const directory = path.resolve('test-files', 'library');
        const first = await manager.ensureSource('directory', directory, 'scan');
        const second = await manager.ensureSource('directory', directory, 'playlist_binding');
        const firstFile = path.join(directory, 'first.flac');
        const secondFile = path.join(directory, 'second.flac');

        await manager.updateSourceScan(first.source.id, [{
            path: firstFile,
            canonicalPath: manager.canonicalize(firstFile),
            trackId: 'first'
        }], true);
        await manager.updateSourceScan(first.source.id, [{
            path: secondFile,
            canonicalPath: manager.canonicalize(secondFile),
            trackId: 'second'
        }], true);

        expect(first.created).toBe(true);
        expect(second.created).toBe(false);
        expect(manager.getSources()).toHaveLength(1);
        expect(manager.getSources()[0].knownFiles).toEqual([{
            path: secondFile,
            canonicalPath: manager.canonicalize(secondFile),
            trackId: 'second'
        }]);
    });

    it('同步绑定成员、记录排除项并支持恢复', async () => {
        const manager = await createManager();
        await manager.loadAndMigrate({musicFolders: [], scannedDirectories: [], tracks: []});
        const directory = path.resolve('test-files', 'bound');
        const filePath = path.join(directory, 'bound.flac');
        const {source} = await manager.ensureSource('directory', directory, 'playlist_binding');
        const {binding} = await manager.createPlaylistBinding('playlist-1', source.id);
        await manager.updateSourceScan(source.id, [{
            path: filePath,
            canonicalPath: manager.canonicalize(filePath),
            trackId: 'bound-track'
        }], true);

        const [synchronized] = await manager.synchronizeSourceBindings(source.id);
        const excludedCount = await manager.excludePlaylistFiles('playlist-1', [filePath]);
        const excluded = manager.getPlaylistBinding(binding.id);
        const restoredCount = await manager.restorePlaylistBindingExclusions(binding.id);

        expect(synchronized.managedFiles[0].trackId).toBe('bound-track');
        expect(excludedCount).toBe(1);
        expect(excluded.excludedPaths).toEqual([manager.canonicalize(filePath)]);
        expect(restoredCount).toBe(1);
        expect(manager.getPlaylistBinding(binding.id).excludedPaths).toEqual([]);
    });

    it('移除来源时一并移除绑定，并能识别重叠来源', async () => {
        const manager = await createManager();
        await manager.loadAndMigrate({musicFolders: [], scannedDirectories: [], tracks: []});
        const parentDirectory = path.resolve('test-files', 'overlap');
        const childDirectory = path.join(parentDirectory, 'child');
        const filePath = path.join(childDirectory, 'track.flac');
        const {source: parentSource} = await manager.ensureSource('directory', parentDirectory, 'scan');
        const {source: childSource} = await manager.ensureSource('directory', childDirectory, 'playlist_binding');
        await manager.createPlaylistBinding('playlist-1', childSource.id);
        await manager.updateSourceScan(childSource.id, [{
            path: filePath,
            canonicalPath: manager.canonicalize(filePath),
            trackId: 'track'
        }], true);

        expect(manager.isFileCoveredByOtherSource(filePath, childSource.id)).toBe(true);
        const removed = await manager.removeSource(childSource.id);

        expect(removed.removedBindings).toHaveLength(1);
        expect(manager.getSource(parentSource.id)).toBeDefined();
        expect(manager.getPlaylistBindings()).toEqual([]);
    });
});
