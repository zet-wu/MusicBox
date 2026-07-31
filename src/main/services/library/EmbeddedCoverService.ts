import * as os from 'os';
import * as path from 'path';
import Piscina from 'piscina';
import type {NetworkFileAdapter} from '../network/NetworkFileAdapter';

export interface EmbeddedCoverResult {
    format: string;
    data: Uint8Array;
}

/**
 * 管理内嵌封面解析线程池，并合并同一路径的并发请求。
 */
export class EmbeddedCoverService {
    private readonly pool: Piscina;
    private readonly pendingTasks = new Map<string, Promise<EmbeddedCoverResult | null>>();

    constructor() {
        const availableThreads = Math.max(1, os.availableParallelism() - 1);
        this.pool = new Piscina({
            filename: path.join(__dirname, 'EmbeddedCoverWorker.js'),
            minThreads: 0,
            maxThreads: Math.min(2, availableThreads),
            maxQueue: 64,
            idleTimeout: 10_000
        });
    }

    getCover(filePath: string, networkFileAdapter: NetworkFileAdapter): Promise<EmbeddedCoverResult | null> {
        const pendingTask = this.pendingTasks.get(filePath);
        if (pendingTask) {
            return pendingTask;
        }

        const task = this.extractCover(filePath, networkFileAdapter)
            .finally(() => {
                this.pendingTasks.delete(filePath);
            });
        this.pendingTasks.set(filePath, task);
        return task;
    }

    async destroy(): Promise<void> {
        this.pendingTasks.clear();
        await this.pool.close({force: true});
    }

    private async extractCover(
        filePath: string,
        networkFileAdapter: NetworkFileAdapter
    ): Promise<EmbeddedCoverResult | null> {
        if (networkFileAdapter.isNetworkPath(filePath)) {
            const buffer = await networkFileAdapter.readFile(filePath);
            return await this.pool.run({
                buffer,
                mimeType: this.getMimeType(filePath)
            });
        }

        return await this.pool.run({filePath});
    }

    private getMimeType(filePath: string): string {
        const extension = path.extname(filePath).toLowerCase();
        const mimeTypes: Record<string, string> = {
            '.mp3': 'audio/mpeg',
            '.flac': 'audio/flac',
            '.wav': 'audio/wav',
            '.ogg': 'audio/ogg',
            '.m4a': 'audio/mp4',
            '.aac': 'audio/aac',
            '.wma': 'audio/x-ms-wma',
            '.ape': 'audio/ape'
        };
        return mimeTypes[extension] || 'application/octet-stream';
    }
}
