// 网络文件系统适配器

import * as path from 'path';
import {WebDAVClient, FileStat} from 'webdav';
import {NetworkDriveManager} from './NetworkDriveManager';
import {SMBDriveClient} from './SMBDriveClient';

interface PathMapping {
    originalPath: string;
    baseName: string;
    timestamp: number;
}

interface StatResult {
    size: number;
    mtime: Date;
    isDirectory: () => boolean;
    isFile: () => boolean;
}

export class NetworkFileAdapter {
    private networkDriveManager: NetworkDriveManager;
    private filePathMappings = new Map<string, PathMapping>();

    constructor(networkDriveManager: NetworkDriveManager) {
        this.networkDriveManager = networkDriveManager;
    }

    isNetworkPath(filePath: string): boolean {
        if (!filePath) return false;
        const isValid = filePath.startsWith('network://') && filePath.length > 10;
        if (!isValid && filePath.startsWith('network:')) {
            console.warn(`路径格式错误: ${filePath}, 正确格式: network://driveId/path`);
        }
        return isValid;
    }

    parseNetworkPath(networkPath: string): { driveId: string; relativePath: string } {
        if (!this.isNetworkPath(networkPath)) {
            throw new Error(`不是有效的网络路径: ${networkPath}`);
        }
        const pathWithoutProtocol = networkPath.substring(10);
        const firstSlashIndex = pathWithoutProtocol.indexOf('/');
        if (firstSlashIndex === -1) {
            return {driveId: pathWithoutProtocol, relativePath: '/'};
        }
        const driveId = pathWithoutProtocol.substring(0, firstSlashIndex);
        const relativePath = pathWithoutProtocol.substring(firstSlashIndex);
        return {driveId, relativePath};
    }

    buildNetworkPath(driveId: string, relativePath: string): string {
        if (!relativePath.startsWith('/')) relativePath = '/' + relativePath;
        return `network://${driveId}${relativePath}`;
    }

    encodeWebDAVPath(filePath: string): string {
        if (!filePath) return filePath;
        const pathParts = filePath.split('/');
        const encodedParts = pathParts.map(part => {
            if (part === '') return part;
            return encodeURIComponent(part);
        });
        return encodedParts.join('/');
    }

    // 解码WebDAV路径
    decodeWebDAVPath(encodedPath: string): string {
        if (!encodedPath) {
            return encodedPath;
        }

        try {
            // 分割路径为各个部分，分别解码每个部分
            const pathParts = encodedPath.split('/');
            const decodedParts = pathParts.map(part => {
                if (part === '') {
                    return part;
                }
                return decodeURIComponent(part);
            });

            return decodedParts.join('/');
        } catch (error: any) {
            console.warn(`⚠️ NetworkFileAdapter: 路径解码失败 "${encodedPath}":`, error.message);
            return encodedPath; // 解码失败时返回原路径
        }
    }

    // 检查路径是否已经被URL编码
    private isPathEncoded(path: string): boolean {
        try {
            const decoded = decodeURIComponent(path);
            const hasEncodedChars = path.includes('%') && path !== decoded;
            if (hasEncodedChars) {
                const reEncoded = encodeURIComponent(decoded);
                return reEncoded === path;
            }
            return false;
        } catch {
            return false;
        }
    }

    storeFilePathMapping(finalName: string, originalPath: string, baseName: string): void {
        if (this.filePathMappings.size >= 500) {
            const entries = [...this.filePathMappings.entries()].sort((a, b) => a[1].timestamp - b[1].timestamp);
            for (let i = 0; i < 1000; i++) this.filePathMappings.delete(entries[i][0]);
        }
        this.filePathMappings.set(finalName, {originalPath, baseName, timestamp: Date.now()});
    }

    getActualWebDAVPath(filePath: string): string {
        const fileName = path.basename(filePath);
        const mapping = this.filePathMappings.get(fileName);
        if (mapping) {
            const dirPath = path.dirname(filePath);
            if (dirPath === '.' || dirPath === '/') return mapping.baseName;
            const encodedDir = this.encodeWebDAVPath(dirPath);
            return `${encodedDir}/${mapping.baseName}`;
        }
        return this.encodeWebDAVPath(filePath);
    }

    async rebuildPathMapping(networkPath: string): Promise<boolean> {
        try {
            const {driveId, relativePath} = this.parseNetworkPath(networkPath);
            const fileName = path.basename(relativePath);
            const dirPath = path.dirname(relativePath);
            const networkDirPath = this.buildNetworkPath(driveId, dirPath === '.' ? '/' : dirPath);
            const items = await this.readdir(networkDirPath);
            for (const item of items) {
                if (item === fileName) return true;
            }
            return false;
        } catch (error: any) {
            console.error(`❌ NetworkFileAdapter: 重建路径映射失败 "${networkPath}":`, error.message);
            return false;
        }
    }

    joinNetworkPath(basePath: string, childPath: string): string {
        if (!this.isNetworkPath(basePath)) {
            throw new Error(`基础路径不是有效的网络路径: ${basePath}`);
        }
        const {driveId, relativePath} = this.parseNetworkPath(basePath);
        let newRelativePath: string;
        if (relativePath === '' || relativePath === '/') {
            newRelativePath = `/${childPath}`;
        } else {
            newRelativePath = `${relativePath}/${childPath}`;
        }
        newRelativePath = newRelativePath.replace(/\/+/g, '/');
        return this.buildNetworkPath(driveId, newRelativePath);
    }

    async readFile(networkPath: string): Promise<Buffer> {
        const {driveId, relativePath} = this.parseNetworkPath(networkPath);
        const driveInfo = this.networkDriveManager.getDriveInfo(driveId);
        if (!driveInfo) throw new Error(`网络磁盘 ${driveId} 未挂载`);

        const status = this.networkDriveManager.getDriveStatus(driveId);
        if (!status?.connected) throw new Error(`网络磁盘 ${driveId} 未连接`);

        try {
            if (driveInfo.type === 'smb') {
                return this.readSMBFile(driveInfo.client, relativePath);
            } else if (driveInfo.type === 'webdav') {
                return this.readWebDAVFile(driveInfo.client as WebDAVClient, relativePath);
            }
            throw new Error('不支持的网络磁盘类型');
        } catch (error) {
            console.error(`❌ NetworkFileAdapter: 读取网络文件失败 ${networkPath}:`, error);
            throw error;
        }
    }

    private readSMBFile(smbClient: SMBDriveClient, filePath: string): Promise<Buffer> {
        return smbClient.readFile(filePath);
    }

    private async readWebDAVFile(webdavClient: WebDAVClient, filePath: string): Promise<Buffer> {
        try {
            const encodedPath = this.encodeWebDAVPath(filePath);
            return await webdavClient.getFileContents(encodedPath) as Buffer;
        } catch {
            return await webdavClient.getFileContents(filePath) as Buffer;
        }
    }

    async stat(networkPath: string): Promise<StatResult> {
        const {driveId, relativePath} = this.parseNetworkPath(networkPath);
        const driveInfo = this.networkDriveManager.getDriveInfo(driveId);
        if (!driveInfo) throw new Error(`网络磁盘 ${driveId} 未挂载`);

        const status = this.networkDriveManager.getDriveStatus(driveId);
        if (!status?.connected) throw new Error(`网络磁盘 ${driveId} 未连接`);

        if (driveInfo.type === 'smb') {
            return this.statSMB(driveInfo.client, relativePath);
        } else if (driveInfo.type === 'webdav') {
            return this.statWebDAV(driveInfo.client as WebDAVClient, relativePath);
        }
        throw new Error('不支持的网络磁盘类型');
    }

    private statSMB(smbClient: SMBDriveClient, filePath: string): Promise<StatResult> {
        return smbClient.stat(filePath);
    }

    private async statWebDAV(webdavClient: WebDAVClient, filePath: string): Promise<StatResult> {
        try {
            const encodedPath = this.encodeWebDAVPath(filePath);
            let stat: FileStat;
            try {
                stat = await webdavClient.stat(encodedPath) as FileStat;
            } catch {
                stat = await webdavClient.stat(filePath) as FileStat;
            }
            return {
                size: stat.size,
                mtime: new Date(stat.lastmod),
                isDirectory: () => stat.type === 'directory',
                isFile: () => stat.type === 'file'
            };
        } catch (error: any) {
            throw new Error(`WebDAV文件信息获取失败: ${error.message}`);
        }
    }

    async exists(networkPath: string): Promise<boolean> {
        try {
            await this.stat(networkPath);
            return true;
        } catch {
            return false;
        }
    }

    async readdir(networkPath: string): Promise<string[]> {
        const {driveId, relativePath} = this.parseNetworkPath(networkPath);
        const driveInfo = this.networkDriveManager.getDriveInfo(driveId);
        if (!driveInfo) throw new Error(`网络磁盘 ${driveId} 未挂载`);

        const status = this.networkDriveManager.getDriveStatus(driveId);
        if (!status?.connected) throw new Error(`网络磁盘 ${driveId} 未连接`);

        try {
            if (driveInfo.type === 'smb') {
                return this.readdirSMB(driveInfo.client, relativePath);
            } else if (driveInfo.type === 'webdav') {
                return this.readdirWebDAV(driveInfo.client as WebDAVClient, relativePath);
            }
            throw new Error('不支持的网络磁盘类型');
        } catch (error) {
            console.error(`❌ NetworkFileAdapter: 读取网络目录失败 ${networkPath}:`, error);
            throw error;
        }
    }

    private readdirSMB(smbClient: SMBDriveClient, dirPath: string): Promise<string[]> {
        return smbClient.readdir(dirPath);
    }

    private async readdirWebDAV(webdavClient: WebDAVClient, dirPath: string): Promise<string[]> {
        let contents: FileStat[];
        try {
            const encodedPath = this.encodeWebDAVPath(dirPath);
            console.log(`    编码后路径: "${encodedPath}"`);
            try {
                contents = await webdavClient.getDirectoryContents(encodedPath) as FileStat[];
                console.log(`    ✅ 使用编码路径成功，共 ${contents.length} 项`);
            } catch {
                contents = await webdavClient.getDirectoryContents(dirPath) as FileStat[];
                console.log(`    ✅ 使用原始路径成功，共 ${contents.length} 项`);
            }
        } catch (error: any) {
            throw new Error(`WebDAV目录读取失败: ${error.message}`);
        }

        return contents.map((item: FileStat) => {
            const baseName = path.basename(item.filename);
            const isAlreadyEncoded = this.isPathEncoded(baseName);
            const finalName = isAlreadyEncoded ? this.decodeWebDAVPath(baseName) : baseName;
            this.storeFilePathMapping(finalName, item.filename, baseName);
            return finalName;
        });
    }

    async writeFile(networkPath: string, buffer: Buffer): Promise<boolean> {
        const {driveId, relativePath} = this.parseNetworkPath(networkPath);
        const driveInfo = this.networkDriveManager.getDriveInfo(driveId);
        if (!driveInfo) throw new Error(`网络磁盘 ${driveId} 未挂载`);

        const status = this.networkDriveManager.getDriveStatus(driveId);
        if (!status?.connected) throw new Error(`网络磁盘 ${driveId} 未连接`);

        if (driveInfo.type === 'smb') {
            return this.writeSMBFile(driveInfo.client, relativePath, buffer);
        } else if (driveInfo.type === 'webdav') {
            return this.writeWebDAVFile(driveInfo.client as WebDAVClient, relativePath, buffer);
        }
        throw new Error('不支持的网络磁盘类型');
    }

    private async writeSMBFile(smbClient: SMBDriveClient, filePath: string, buffer: Buffer): Promise<boolean> {
        const maxRetries = 3;
        let lastError: Error | null = null;

        for (let attempt = 1; attempt <= maxRetries; attempt++) {
            try {
                await smbClient.writeFile(filePath, buffer);
                return true;
            } catch (error: any) {
                lastError = error;
                if (attempt < maxRetries) {
                    await new Promise(r => setTimeout(r, 1000 * attempt));
                }
            }
        }
        throw new Error(`SMB文件写入失败，已重试${maxRetries}次: ${lastError!.message}`);
    }

    private async writeWebDAVFile(webdavClient: WebDAVClient, filePath: string, buffer: Buffer): Promise<boolean> {
        const maxRetries = 3;
        let lastError: Error | null = null;

        for (let attempt = 1; attempt <= maxRetries; attempt++) {
            try {
                const encodedPath = this.encodeWebDAVPath(filePath);
                await webdavClient.putFileContents(encodedPath, buffer);
                return true;
            } catch (error: any) {
                lastError = error;
                if (attempt < maxRetries) {
                    await new Promise(r => setTimeout(r, 1000 * attempt));
                }
            }
        }
        throw new Error(`WebDAV文件写入失败，已重试${maxRetries}次: ${lastError!.message}`);
    }
}
