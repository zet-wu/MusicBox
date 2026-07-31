import {describe, expect, it} from 'vitest';
import {CoverLoadQueue} from '../features/mediaAssets/service/CoverLoadQueue';

describe('封面加载队列', () => {
    it('限制同时执行的封面任务数量', async () => {
        const queue = new CoverLoadQueue(2);
        let running = 0;
        let peak = 0;

        const tasks = Array.from({length: 6}, (_, index) => new Promise<void>((resolve) => {
            queue.schedule(String(index), async () => {
                running += 1;
                peak = Math.max(peak, running);
                await new Promise((taskResolve) => setTimeout(taskResolve, 5));
                running -= 1;
                resolve();
            });
        }));

        await Promise.all(tasks);
        expect(peak).toBe(2);
        queue.destroy();
    });

    it('开始新批次时中止旧任务', async () => {
        const queue = new CoverLoadQueue(1);
        let aborted = false;
        let notifyStarted: (() => void) | null = null;
        const taskStarted = new Promise<void>((resolve) => {
            notifyStarted = resolve;
        });

        const taskCompleted = new Promise<void>((resolve) => {
            queue.schedule('old-task', async (signal) => {
                notifyStarted?.();
                await new Promise<void>((taskResolve) => {
                    signal.addEventListener('abort', () => {
                        aborted = true;
                        taskResolve();
                    }, {once: true});
                });
                resolve();
            });
        });

        await taskStarted;
        queue.beginBatch();
        await taskCompleted;

        expect(aborted).toBe(true);
        queue.destroy();
    });
});
