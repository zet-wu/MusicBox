import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import {afterEach, describe, expect, it, vi} from 'vitest';

vi.mock('electron', () => ({
    app: {
        getPath: () => '.'
    }
}));

import {AutoScanScheduler} from '../../../main/services/library/AutoScanScheduler';

const temporaryDirectories: string[] = [];

async function createScheduler(): Promise<AutoScanScheduler> {
    const directory = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'musicbox-auto-scan-test-'));
    temporaryDirectories.push(directory);
    return new AutoScanScheduler(path.join(directory, 'settings.json'));
}

afterEach(async () => {
    await Promise.all(temporaryDirectories.splice(0).map(directory => (
        fs.promises.rm(directory, {recursive: true, force: true, maxRetries: 3, retryDelay: 50})
    )));
});

describe('AutoScanScheduler 音乐库来源扫描', () => {
    it('只有精确文件来源时也会执行启动扫描', async () => {
        const scheduler = await createScheduler();
        const scanHandler = vi.fn(async () => undefined);
        scheduler.initialize(scanHandler, async () => ({
            musicFolders: [],
            sourceCount: 1,
            autoScanEnabled: true,
            scanFrequency: 'on_startup',
            lastScanTime: 0
        }));

        await scheduler.start();

        expect(scanHandler).toHaveBeenCalledOnce();
    });

    it('没有任何来源时不执行扫描', async () => {
        const scheduler = await createScheduler();
        const scanHandler = vi.fn(async () => undefined);
        scheduler.initialize(scanHandler, async () => ({
            musicFolders: [],
            sourceCount: 0,
            autoScanEnabled: true,
            scanFrequency: 'on_startup',
            lastScanTime: 0
        }));

        await scheduler.start();

        expect(scanHandler).not.toHaveBeenCalled();
    });
});
