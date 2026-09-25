import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';

const state = vi.hoisted(() => ({directory: '', clients: [], failConnect: false}));

vi.mock('electron', () => ({app: {getPath: () => state.directory}}));
vi.mock('../../../main/services/network/DriveRegistry', () => ({
    getGlobalDriveRegistry: () => ({
        registerDrive: vi.fn(async () => undefined),
        unregisterDrive: vi.fn(async () => true)
    })
}));
vi.mock('../../../main/services/network/SMBDriveClient', () => ({
    SMBDriveClient: {
        connect: vi.fn(async () => {
            if (state.failConnect) throw new Error('connection failed');
            const client = {probe: vi.fn(async () => undefined), close: vi.fn(async () => undefined)};
            state.clients.push(client);
            return client;
        })
    }
}));

import {NetworkDriveManager} from '../../../main/services/network/NetworkDriveManager';

const config = {
    id: 'smb-test', type: 'smb', displayName: '测试盘', host: 'example.test', share: 'musicbox',
    username: 'user', password: 'test-only', domain: 'WORKGROUP'
};

beforeEach(async () => {
    state.directory = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'musicbox-smb-manager-'));
    state.clients = [];
    state.failConnect = false;
});

afterEach(async () => {
    await fs.promises.unlink(path.join(state.directory, 'network-drives-state.json')).catch(() => undefined);
    await fs.promises.rmdir(state.directory);
});

describe('NetworkDriveManager SMB', () => {
    it('挂载后保存配置，重启恢复，卸载后不再恢复', async () => {
        const first = new NetworkDriveManager();
        expect(await first.mountSMB(config)).toBe(true);
        expect(first.isDriveMounted(config.id)).toBe(true);
        await first.cleanup();
        expect(state.clients[0].close).toHaveBeenCalledOnce();

        const second = new NetworkDriveManager();
        expect(await second.initialize()).toBe(true);
        expect(second.isDriveMounted(config.id)).toBe(true);
        expect(state.clients).toHaveLength(2);
        expect(await second.unmountDrive(config.id)).toBe(true);
        expect(state.clients[1].close).toHaveBeenCalledOnce();
        await second.cleanup();

        const third = new NetworkDriveManager();
        expect(await third.initialize()).toBe(true);
        expect(third.isDriveMounted(config.id)).toBe(false);
        await third.cleanup();
    });

    it('连接失败不注册磁盘，重连时替换并关闭旧连接', async () => {
        const manager = new NetworkDriveManager();
        state.failConnect = true;
        expect(await manager.mountSMB(config)).toBe(false);
        expect(manager.isDriveMounted(config.id)).toBe(false);

        state.failConnect = false;
        expect(await manager.mountSMB(config)).toBe(true);
        await manager.attemptReconnect(config.id);
        expect(state.clients).toHaveLength(2);
        expect(state.clients[0].close).toHaveBeenCalledOnce();
        expect(manager.getDriveInfo(config.id).client).toBe(state.clients[1]);
        await manager.cleanup();
    });
});
