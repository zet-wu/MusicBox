import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import {afterEach, describe, expect, it, vi} from 'vitest';

vi.mock('electron', () => ({
    app: {
        getPath: () => '.'
    },
    ipcMain: {
        handle: vi.fn(),
        on: vi.fn(),
        removeHandler: vi.fn(),
        removeAllListeners: vi.fn()
    }
}));

import {LibraryController} from '../../../main/controllers/LibraryController';
import {LibrarySourceManager} from '../../../main/services/library/LibrarySourceManager';

const temporaryDirectories = [];

async function createTemporaryDirectory(name) {
    const root = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'musicbox-auto-scan-test-'));
    temporaryDirectories.push(root);
    const directory = path.join(root, name);
    await fs.promises.mkdir(directory);
    return directory;
}

afterEach(async () => {
    await Promise.all(temporaryDirectories.splice(0).map(directory => (
        fs.promises.rm(directory, {recursive: true, force: true, maxRetries: 3, retryDelay: 50})
    )));
});

describe('LibraryController 批量扫描通知', () => {
    it('扫描多个来源时只在结束后发布一次集合更新', async () => {
        const firstDirectory = await createTemporaryDirectory('first');
        const secondDirectory = await createTemporaryDirectory('second');
        const sourceFilePath = path.join(path.dirname(firstDirectory), 'music-library-sources.json');
        const sourceManager = new LibrarySourceManager(sourceFilePath);
        await sourceManager.loadAndMigrate({musicFolders: [], scannedDirectories: [], tracks: []});
        const {source: firstSource} = await sourceManager.ensureSource('directory', firstDirectory, 'scan');
        await sourceManager.ensureSource('directory', secondDirectory, 'scan');
        await sourceManager.createPlaylistBinding('playlist-1', firstSource.id);

        const webContentsSend = vi.fn();
        const sendToMainWindow = vi.fn();
        const playlist = {id: 'playlist-1', trackIds: []};
        const libraryCacheManager = {
            addScannedDirectory: vi.fn(),
            addTracks: vi.fn(),
            getAllPlaylists: vi.fn(() => [playlist]),
            getAllTracks: vi.fn(() => []),
            getPlaylistById: vi.fn(() => playlist),
            getScannedDirectories: vi.fn(() => []),
            getTrackByPath: vi.fn(() => undefined),
            getTracks: vi.fn(() => []),
            needsPlaylistMembershipMigration: vi.fn(() => false),
            saveCache: vi.fn(async () => undefined),
            setPlaylistMaterializedTracks: vi.fn(() => playlist),
            updateScanStatistics: vi.fn()
        };
        const windowManager = {
            getMainWindow: vi.fn(() => ({webContents: {send: webContentsSend}})),
            sendToMainWindow
        };
        const controller = new LibraryController(
            libraryCacheManager,
            {},
            {},
            {isNetworkPath: () => false},
            windowManager,
            {},
            {},
            vi.fn(),
            async () => [],
            sourceManager,
            vi.fn(),
            async () => false,
            {}
        );

        const result = await controller.scanAllLibrarySources();

        expect(result).toMatchObject({
            configuredSourceCount: 2,
            scannedSourceCount: 2,
            scannedFolderCount: 2,
            failedSources: []
        });
        expect(webContentsSend).not.toHaveBeenCalledWith('library:updated', expect.anything());
        expect(sendToMainWindow.mock.calls.filter(([event]) => event === 'library:updated')).toHaveLength(1);
        expect(sendToMainWindow.mock.calls.filter(([event]) => event === 'library:playlistsUpdated')).toHaveLength(1);
        expect(sendToMainWindow.mock.calls.filter(([event]) => event === 'library:sourcesUpdated')).toHaveLength(1);
    });
});

function createSourceQueryController({source, tracks}) {
    const sourceManager = {
        getSource: vi.fn(() => source),
        getSources: vi.fn(() => source ? [source] : []),
        loadAndMigrate: vi.fn(async () => ({migrated: false})),
        removeOrphanedPlaylistBindings: vi.fn(async () => [])
    };
    const cacheManager = {
        getMusicFolders: vi.fn(() => []),
        getScannedDirectories: vi.fn(() => []),
        getAllTracks: vi.fn(() => tracks),
        getAllPlaylists: vi.fn(() => []),
        needsPlaylistMembershipMigration: vi.fn(() => false),
        saveCache: vi.fn(async () => undefined),
        getTracks: vi.fn(() => tracks)
    };
    return new LibraryController(
        cacheManager,
        {},
        {},
        {isNetworkPath: () => false},
        {sendToMainWindow: vi.fn()},
        {},
        {},
        vi.fn(),
        async () => [],
        sourceManager,
        vi.fn(),
        async () => false,
        {}
    );
}

describe('LibraryController 来源歌曲查询', () => {
    it('只返回来源 knownFiles 中仍存在于索引的歌曲', async () => {
        const source = {
            id: 'source-1',
            type: 'directory',
            knownFiles: [
                {trackId: 'track-1'},
                {trackId: 'missing'},
                {}
            ]
        };
        const expected = {fileId: 'track-1', title: '来源歌曲'};
        const unrelated = {fileId: 'track-2', title: '其他歌曲'};
        const controller = createSourceQueryController({source, tracks: [expected, unrelated]});

        await expect(controller.getTracksByLibrarySource(source.id)).resolves.toEqual([expected]);
    });

    it('来源不存在时返回空列表', async () => {
        const controller = createSourceQueryController({source: undefined, tracks: []});

        await expect(controller.getTracksByLibrarySource('missing')).resolves.toEqual([]);
    });
});
