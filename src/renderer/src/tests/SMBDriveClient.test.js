import {Buffer} from 'node:buffer';
import {beforeEach, describe, expect, it, vi} from 'vitest';

const state = vi.hoisted(() => ({
    files: new Map(),
    auth: null,
    share: null,
    closed: 0,
    failAuth: false,
    failPromotion: false
}));

vi.mock('node-smb2', () => ({
    Client: class {
        constructor(host, options) {
            state.host = host;
            state.options = options;
        }

        async authenticate(options) {
            state.auth = options;
            if (state.failAuth) throw new Error('authentication failed');
            return {
                connectTree: async share => {
                    state.share = share;
                    return {
                        readDirectory: async directory => {
                            if (directory === '/') return [{filename: './中文', type: 'Directory', fileSize: 0n, lastWriteTime: new Date(0)}];
                            if (directory === '/中文') return [{filename: './歌曲 #1.mp3', type: 'File', fileSize: 3n, lastWriteTime: new Date('2026-01-01')}];
                            return [];
                        },
                        readFile: async filePath => state.files.get(filePath),
                        createFile: async (filePath, content) => { state.files.set(filePath, Buffer.from(content)); },
                        exists: async filePath => state.files.has(filePath),
                        renameFile: async (from, to) => {
                            if (state.failPromotion && from.endsWith('.tmp')) throw new Error('rename failed');
                            state.files.set(to, state.files.get(from));
                            state.files.delete(from);
                        },
                        removeFile: async filePath => { state.files.delete(filePath); }
                    };
                }
            };
        }

        async close() { state.closed++; }
    }
}));

import {SMBDriveClient} from '../../../main/services/network/SMBDriveClient';

const config = {
    id: 'test', type: 'smb', displayName: '测试盘', host: 'example.test', share: 'musicbox',
    username: 'user', password: 'test-only', domain: 'WORKGROUP'
};

beforeEach(() => {
    state.files.clear();
    state.auth = null;
    state.share = null;
    state.closed = 0;
    state.failAuth = false;
    state.failPromotion = false;
});

describe('SMBDriveClient', () => {
    it('使用当前 node-smb2 API 和 NTLMv2 连接共享目录', async () => {
        const drive = await SMBDriveClient.connect(config);
        expect(state.host).toBe(config.host);
        expect(state.options).toMatchObject({connectTimeout: 10000, requestTimeout: 20000});
        expect(state.auth).toMatchObject({username: 'user', forceNtlmVersion: 'v2'});
        expect(state.share).toBe('musicbox');
        await drive.close();
        expect(state.closed).toBe(1);
    });

    it('认证失败时关闭客户端', async () => {
        state.failAuth = true;
        await expect(SMBDriveClient.connect(config)).rejects.toThrow('authentication failed');
        expect(state.closed).toBe(1);
    });

    it('规范化目录名并返回可用于扫描的文件信息', async () => {
        const drive = await SMBDriveClient.connect(config);
        expect(await drive.readdir('/中文')).toEqual(['歌曲 #1.mp3']);
        const stat = await drive.stat('/中文/歌曲 #1.mp3');
        expect(stat.size).toBe(3);
        expect(stat.isFile()).toBe(true);
        expect((await drive.stat('/')).isDirectory()).toBe(true);
        await drive.close();
    });

    it('通过临时文件覆盖已有文件，失败时恢复原文件', async () => {
        const drive = await SMBDriveClient.connect(config);
        const filePath = '/中文/歌曲 #1.mp3';
        state.files.set(filePath, Buffer.from('old'));
        await drive.writeFile(filePath, Buffer.from('new'));
        expect(state.files.get(filePath).toString()).toBe('new');
        expect(state.files.size).toBe(1);

        state.failPromotion = true;
        await expect(drive.writeFile(filePath, Buffer.from('bad'))).rejects.toThrow('rename failed');
        expect(state.files.get(filePath).toString()).toBe('new');
        expect(state.files.size).toBe(1);
        await drive.close();
    });
});
