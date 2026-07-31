import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import {afterEach, describe, expect, it, vi} from 'vitest';

vi.mock('electron', () => ({
    app: {
        getPath: () => '.'
    }
}));

import {LibrarySourceManager} from '../../../main/services/library/LibrarySourceManager';

const temporaryDirectories = [];

async function createManager() {
    const directory = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'musicbox-source-test-'));
    temporaryDirectories.push(directory);
    return new LibrarySourceManager(path.join(directory, 'music-library-sources.json'));
}

afterEach(async () => {
    await Promise.all(temporaryDirectories.splice(0).map(directory => (
        fs.promises.rm(directory, {recursive: true, force: true})
    )));
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
});
