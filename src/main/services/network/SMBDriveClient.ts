import * as path from 'path';
import {randomUUID} from 'crypto';
import {Client} from 'node-smb2';
import type {SMBConfig} from './NetworkDriveManager';

type SMBSession = Awaited<ReturnType<Client['authenticate']>>;
type SMBTree = Awaited<ReturnType<SMBSession['connectTree']>>;

export interface SMBFileStat {
    size: number;
    mtime: Date;
    isDirectory(): boolean;
    isFile(): boolean;
}

export class SMBDriveClient {
    private constructor(private readonly client: Client, private readonly tree: SMBTree) {}

    static async connect(config: SMBConfig): Promise<SMBDriveClient> {
        const client = new Client(config.host, {connectTimeout: 10000, requestTimeout: 20000});
        try {
            const session = await client.authenticate({
                domain: config.domain || 'WORKGROUP',
                username: config.username,
                password: config.password,
                forceNtlmVersion: 'v2'
            });
            const tree = await session.connectTree(config.share);
            const drive = new SMBDriveClient(client, tree);
            await drive.probe();
            return drive;
        } catch (error) {
            await client.close().catch(() => undefined);
            throw error;
        }
    }

    async probe(): Promise<void> {
        await this.tree.readDirectory('/');
    }

    async readFile(filePath: string): Promise<Buffer> {
        return this.tree.readFile(filePath);
    }

    async readdir(dirPath: string): Promise<string[]> {
        const entries = await this.tree.readDirectory(dirPath);
        return entries.map(entry => path.posix.basename(entry.filename.replace(/\\/g, '/')));
    }

    async stat(filePath: string): Promise<SMBFileStat> {
        const normalized = path.posix.normalize(filePath.replace(/\\/g, '/'));
        if (normalized === '/' || normalized === '.') {
            return {size: 0, mtime: new Date(0), isDirectory: () => true, isFile: () => false};
        }

        const entries = await this.tree.readDirectory(path.posix.dirname(normalized));
        const name = path.posix.basename(normalized);
        const entry = entries.find(item => path.posix.basename(item.filename.replace(/\\/g, '/')) === name)
            ?? entries.find(item => path.posix.basename(item.filename.replace(/\\/g, '/')).toLowerCase() === name.toLowerCase());
        if (!entry) throw new Error(`SMB文件不存在: ${filePath}`);
        const size = Number(entry.fileSize);
        if (!Number.isSafeInteger(size)) throw new Error(`SMB文件过大: ${filePath}`);
        return {
            size,
            mtime: entry.lastWriteTime,
            isDirectory: () => entry.type === 'Directory',
            isFile: () => entry.type === 'File'
        };
    }

    async writeFile(filePath: string, buffer: Buffer): Promise<void> {
        const suffix = randomUUID();
        const temporaryPath = `${filePath}.musicbox-${suffix}.tmp`;
        const backupPath = `${filePath}.musicbox-${suffix}.bak`;
        let backedUp = false;
        let promoted = false;
        try {
            await this.tree.createFile(temporaryPath, buffer);
            const written = await this.tree.readFile(temporaryPath);
            if (!written.equals(buffer)) throw new Error('SMB临时文件校验失败');
            if (await this.tree.exists(filePath)) {
                await this.tree.renameFile(filePath, backupPath);
                backedUp = true;
            }
            await this.tree.renameFile(temporaryPath, filePath);
            promoted = true;
            if (backedUp) {
                await this.tree.removeFile(backupPath).catch(error => {
                    console.warn('⚠️ SMB备份文件清理失败:', error);
                });
            }
        } catch (error) {
            if (backedUp && !promoted) {
                await this.tree.renameFile(backupPath, filePath).catch(restoreError => {
                    console.error('❌ SMB原文件恢复失败:', restoreError);
                });
            }
            throw error;
        } finally {
            if (!promoted) {
                await this.tree.removeFile(temporaryPath).catch(() => undefined);
            }
        }
    }

    async close(): Promise<void> {
        await this.client.close();
    }
}
