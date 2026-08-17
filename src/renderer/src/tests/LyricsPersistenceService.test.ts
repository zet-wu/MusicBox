import {afterEach, beforeEach, describe, expect, it} from 'vitest';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import {LyricsPersistenceService} from '../../../main/services/lyrics/LyricsPersistenceService';

describe('LyricsPersistenceService', () => {
    let userDataPath: string;

    beforeEach(async () => {
        userDataPath = await fs.mkdtemp(path.join(os.tmpdir(), 'musicbox-lyrics-'));
    });

    afterEach(async () => {
        await fs.rm(userDataPath, {recursive: true, force: true});
    });

    it('持久化并读取 binding 的 selectionMode', async () => {
        const service = new LyricsPersistenceService(userDataPath);
        await service.save(
            'track-1',
            '<tt/>',
            {kind: 'local', path: 'Song.lrc'},
            'manual'
        );

        const reloaded = await new LyricsPersistenceService(userDataPath).read('track-1');

        expect(reloaded?.binding.selectionMode).toBe('manual');
        expect(reloaded?.binding.source).toEqual({kind: 'local', path: 'Song.lrc'});
        expect(reloaded?.ttml).toBe('<tt/>');
    });
});
