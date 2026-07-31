import PQueue from 'p-queue';

type CoverLoadTask = (signal: AbortSignal) => Promise<void>;

/**
 * 限制列表封面并发，并以页面批次为单位取消过期任务。
 */
export class CoverLoadQueue {
    private readonly queue: PQueue;
    private batchController = new AbortController();
    private readonly pendingTasks = new Map<string, symbol>();

    constructor(concurrency = 4) {
        this.queue = new PQueue({concurrency});
    }

    beginBatch(): void {
        this.batchController.abort();
        this.batchController = new AbortController();
        this.pendingTasks.clear();
    }

    schedule(key: string, task: CoverLoadTask): void {
        if (!key || this.pendingTasks.has(key)) {
            return;
        }

        const token = Symbol(key);
        const signal = this.batchController.signal;
        this.pendingTasks.set(key, token);

        void this.queue
            .add(({signal: queueSignal}) => task(queueSignal ?? signal), {
                id: key,
                signal
            })
            .catch((error: unknown) => {
                if (!signal.aborted) {
                    console.warn('⚠️ CoverLoadQueue: 封面任务失败', error);
                }
            })
            .finally(() => {
                if (this.pendingTasks.get(key) === token) {
                    this.pendingTasks.delete(key);
                }
            });
    }

    destroy(): void {
        this.beginBatch();
        this.queue.pause();
    }

    get pendingCount(): number {
        return this.queue.pending;
    }

    get queuedCount(): number {
        return this.queue.size;
    }
}
