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
    FAVORITES_PLAYLIST_ID,
    LibraryCacheManager
} from '../../../main/services/library/LibraryCacheManager';

const temporaryDirectories = [];

async function createCachePath() {
    const directory = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'musicbox-cache-test-'));
    temporaryDirectories.push(directory);
    return path.join(directory, 'music-library-cache.json');
}

afterEach(async () => {
    await Promise.all(temporaryDirectories.splice(0).map((directory) => (
        fs.promises.rm(directory, {recursive: true, force: true, maxRetries: 3, retryDelay: 50})
    )));
});

describe('LibraryCacheManager 持久化保护', () => {
    it('缓存加载完成前拒绝保存，避免空状态覆盖已有文件', async () => {
        const cachePath = await createCachePath();
        const original = JSON.stringify({marker: 'keep-existing-data'});
        await fs.promises.writeFile(cachePath, original, 'utf8');
        const manager = new LibraryCacheManager(null, cachePath);

        await expect(manager.saveCache()).rejects.toThrow('尚未加载');
        await expect(fs.promises.readFile(cachePath, 'utf8')).resolves.toBe(original);
    });

    it('安全保存时保留上一版本备份并写入可解析的新缓存', async () => {
        const cachePath = await createCachePath();
        const original = JSON.stringify({
            tracks: [],
            playlists: [],
            scannedDirectories: [],
            ignoredFiles: [],
            statistics: {}
        });
        await fs.promises.writeFile(cachePath, original, 'utf8');
        const manager = new LibraryCacheManager(null, cachePath);
        await manager.loadCache();
        manager.createPlaylist('持久化歌单');

        await manager.saveCache();

        const saved = JSON.parse(await fs.promises.readFile(cachePath, 'utf8'));
        expect(saved.playlists.some((playlist) => playlist.name === '持久化歌单')).toBe(true);
        await expect(fs.promises.readFile(`${cachePath}.bak`, 'utf8')).resolves.toBe(original);
    });

    it('迁移旧收藏字段和旧歌单 tracks 结构', async () => {
        const cachePath = await createCachePath();
        await fs.promises.writeFile(cachePath, JSON.stringify({
            tracks: [{
                fileId: 'legacy-favorite',
                filePath: 'C:/Music/legacy.flac',
                fileName: 'legacy.flac',
                fileSize: 1,
                lastModified: 1,
                addedToCache: 1,
                hasCover: false,
                favorite: true
            }],
            playlists: [{
                id: 'legacy-playlist',
                name: '旧歌单',
                tracks: [{filePath: 'C:/Music/legacy.flac'}]
            }],
            scannedDirectories: [],
            ignoredFiles: [],
            statistics: {}
        }), 'utf8');
        const manager = new LibraryCacheManager(null, cachePath);

        await manager.loadCache();

        expect(manager.getPlaylistById('legacy-playlist')).toMatchObject({
            name: '旧歌单',
            trackIds: ['legacy-favorite'],
            manualTrackIds: ['legacy-favorite']
        });
        expect(manager.getPlaylistById(FAVORITES_PLAYLIST_ID).trackIds).toEqual(['legacy-favorite']);
        expect(manager.getTracks({favorite: true}).map((track) => track.fileId)).toEqual(['legacy-favorite']);
        expect(manager.needsPlaylistMembershipMigration()).toBe(true);
    });
});
