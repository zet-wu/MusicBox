import {beforeEach, describe, expect, it, vi} from 'vitest';

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

function createController() {
    let playlists = [{id: 'playlist-1', name: '旧名称', trackIds: ['track-1'], manualTrackIds: ['track-1']}];
    const libraryCacheManager = {
        cleanupPlaylistReferences: vi.fn(() => 1),
        createPlaylist: vi.fn((_name, _description) => {
            const playlist = {id: 'playlist-new', name: '新歌单', trackIds: [], manualTrackIds: []};
            playlists = [...playlists, playlist];
            return playlist;
        }),
        deletePlaylist: vi.fn((playlistId) => {
            playlists = playlists.filter(playlist => playlist.id !== playlistId);
        }),
        getAllPlaylists: vi.fn(() => playlists),
        getAllTracks: vi.fn(() => []),
        getPlaylistById: vi.fn(playlistId => playlists.find(playlist => playlist.id === playlistId)),
        getPlaylistCoverFileName: vi.fn(() => null),
        getScannedDirectories: vi.fn(() => []),
        getTrackByFileId: vi.fn(() => ({fileId: 'track-1', filePath: 'C:\\Music\\track.mp3'})),
        needsPlaylistMembershipMigration: vi.fn(() => false),
        removeInvalidTracks: vi.fn(),
        removeTrack: vi.fn(() => ({fileId: 'track-1', title: '歌曲'})),
        removeTrackFromPlaylist: vi.fn((_playlistId, trackId) => {
            playlists[0].trackIds = playlists[0].trackIds.filter(id => id !== trackId);
            playlists[0].manualTrackIds = playlists[0].manualTrackIds.filter(id => id !== trackId);
        }),
        removeTracksByDrive: vi.fn(() => 1),
        renamePlaylist: vi.fn((_playlistId, newName) => {
            playlists[0] = {...playlists[0], name: newName};
            return playlists[0];
        }),
        saveCache: vi.fn(async () => undefined),
        setPlaylistMaterializedTracks: vi.fn(playlistId => (
            playlists.find(playlist => playlist.id === playlistId)
        )),
        validateCachedTracks: vi.fn(async () => ({
            valid: [],
            invalid: [{track: {fileId: 'invalid'}}],
            modified: []
        }))
    };
    const librarySourceManager = {
        excludePlaylistFiles: vi.fn(async () => undefined),
        getPlaylistBindings: vi.fn(() => []),
        getSources: vi.fn(() => []),
        loadAndMigrate: vi.fn(async () => ({migrated: false})),
        removeOrphanedPlaylistBindings: vi.fn(async () => []),
        removePlaylistBindings: vi.fn(async () => undefined)
    };
    const sendToMainWindow = vi.fn();
    const controller = new LibraryController(
        libraryCacheManager,
        {},
        {getMountedDrives: vi.fn(() => new Map())},
        {isNetworkPath: () => false},
        {sendToMainWindow, getMainWindow: vi.fn(() => null)},
        {},
        {remove: vi.fn(async () => undefined)},
        vi.fn(),
        async () => [],
        librarySourceManager,
        vi.fn(),
        async () => false,
        {}
    );

    return {controller, libraryCacheManager, sendToMainWindow};
}

describe('LibraryController 歌单变更通知', () => {
    let context;

    beforeEach(() => {
        context = createController();
    });

    it('创建和重命名后推送最新歌单快照', async () => {
        await context.controller.createPlaylist('新歌单');
        await context.controller.renamePlaylist('playlist-1', '新名称');

        const updates = context.sendToMainWindow.mock.calls
            .filter(([event]) => event === 'library:playlistsUpdated');
        expect(updates).toHaveLength(2);
        expect(updates[0][1]).toContainEqual(expect.objectContaining({id: 'playlist-new'}));
        expect(updates[1][1]).toContainEqual(expect.objectContaining({id: 'playlist-1', name: '新名称'}));
        expect(context.sendToMainWindow).toHaveBeenCalledWith('library:sourcesUpdated', expect.anything());
    });

    it('删除后同时推送歌单和来源绑定更新', async () => {
        await context.controller.deletePlaylist('playlist-1');

        expect(context.sendToMainWindow).toHaveBeenCalledWith('library:playlistsUpdated', []);
        expect(context.sendToMainWindow).toHaveBeenCalledWith('library:sourcesUpdated', expect.anything());
    });

    it('移除歌单歌曲后推送最新歌单快照', async () => {
        await context.controller.removeTracksFromPlaylist('playlist-1', ['track-1']);

        expect(context.sendToMainWindow).toHaveBeenCalledWith(
            'library:playlistsUpdated',
            [expect.objectContaining({id: 'playlist-1', trackIds: []})]
        );
    });

    it('歌曲失效或被移除时刷新受影响的歌单摘要', async () => {
        await context.controller.validateCache();
        await context.controller.removeTrack('track-1');
        await context.controller.removeTracksByDrive('drive-1');
        await context.controller.cleanupPlaylists();

        const updates = context.sendToMainWindow.mock.calls
            .filter(([event]) => event === 'library:playlistsUpdated');
        expect(updates).toHaveLength(4);
    });
});
