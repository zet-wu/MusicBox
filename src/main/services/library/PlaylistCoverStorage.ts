import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import {app} from 'electron';
import {isSafePath} from '../../utils/pathSecurity';

export interface PlaylistCoverSnapshot {
    fileName: string;
    filePath: string;
}

type SupportedImageExtension = 'jpg' | 'png' | 'gif' | 'webp' | 'bmp';

/**
 * 将歌单封面统一保存为用户数据目录中的独立快照。
 */
export class PlaylistCoverStorage {
    private readonly coverDirectory: string;

    constructor(userDataPath = app.getPath('userData')) {
        this.coverDirectory = path.join(userDataPath, 'PlaylistCovers');
    }

    async importFile(playlistId: string, sourcePath: string): Promise<PlaylistCoverSnapshot> {
        const data = await fs.promises.readFile(sourcePath);
        return this.saveSnapshot(playlistId, data);
    }

    async saveSnapshot(
        playlistId: string,
        data: Uint8Array | Buffer
    ): Promise<PlaylistCoverSnapshot> {
        const buffer = Buffer.from(data);
        const extension = this.detectImageExtension(buffer);
        if (!extension) {
            throw new Error('不支持的歌单封面格式');
        }

        await fs.promises.mkdir(this.coverDirectory, {recursive: true});
        const playlistKey = crypto.createHash('sha256').update(playlistId).digest('hex');
        const fileName = `${playlistKey}-${crypto.randomUUID()}.${extension}`;
        const filePath = this.resolve(fileName);
        const temporaryPath = `${filePath}.tmp`;

        try {
            await fs.promises.writeFile(temporaryPath, buffer);
            await fs.promises.rename(temporaryPath, filePath);
            return {fileName, filePath};
        } catch (error) {
            await fs.promises.unlink(temporaryPath).catch(() => undefined);
            throw error;
        }
    }

    resolve(fileName: string): string {
        if (!this.isValidFileName(fileName)) {
            throw new Error('歌单封面文件名无效');
        }
        const filePath = path.join(this.coverDirectory, fileName);
        if (!isSafePath(filePath, [this.coverDirectory])) {
            throw new Error('歌单封面路径超出受管目录');
        }
        return filePath;
    }

    async remove(fileName?: string | null): Promise<void> {
        if (!fileName) return;
        const filePath = this.resolve(fileName);
        await fs.promises.unlink(filePath).catch((error: NodeJS.ErrnoException) => {
            if (error.code !== 'ENOENT') throw error;
        });
    }

    private isValidFileName(fileName: string): boolean {
        return Boolean(fileName) && path.basename(fileName) === fileName;
    }

    private detectImageExtension(data: Buffer): SupportedImageExtension | null {
        if (data.length >= 3 && data[0] === 0xff && data[1] === 0xd8 && data[2] === 0xff) {
            return 'jpg';
        }
        if (data.length >= 8 && data.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) {
            return 'png';
        }
        if (data.length >= 6) {
            const signature = data.subarray(0, 6).toString('ascii');
            if (signature === 'GIF87a' || signature === 'GIF89a') return 'gif';
        }
        if (
            data.length >= 12
            && data.subarray(0, 4).toString('ascii') === 'RIFF'
            && data.subarray(8, 12).toString('ascii') === 'WEBP'
        ) {
            return 'webp';
        }
        if (data.length >= 2 && data[0] === 0x42 && data[1] === 0x4d) {
            return 'bmp';
        }
        return null;
    }
}
