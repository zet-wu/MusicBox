import {afterEach, describe, expect, it, vi} from 'vitest';
import {MainContentScrollCoordinator} from '../app/runtime/MainContentScrollCoordinator';

describe('MainContentScrollCoordinator', () => {
    afterEach(() => {
        vi.unstubAllGlobals();
    });

    it('按视图键记忆并恢复滚动位置', () => {
        const scrollElement = {scrollTop: 320};
        const frames: FrameRequestCallback[] = [];
        vi.stubGlobal('document', {querySelector: () => scrollElement});
        vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
            frames.push(callback);
            return 1;
        });
        vi.stubGlobal('cancelAnimationFrame', vi.fn());
        const coordinator = new MainContentScrollCoordinator();

        coordinator.capture('artists');
        scrollElement.scrollTop = 0;
        coordinator.restore('artists');
        frames[0]?.(0);

        expect(scrollElement.scrollTop).toBe(320);
    });

    it('过期恢复任务不会修改当前视图', () => {
        const scrollElement = {scrollTop: 180};
        const frames: FrameRequestCallback[] = [];
        vi.stubGlobal('document', {querySelector: () => scrollElement});
        vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
            frames.push(callback);
            return 2;
        });
        vi.stubGlobal('cancelAnimationFrame', vi.fn());
        const coordinator = new MainContentScrollCoordinator();

        coordinator.capture('albums');
        scrollElement.scrollTop = 12;
        coordinator.restore('albums', () => false);
        frames[0]?.(0);

        expect(scrollElement.scrollTop).toBe(12);
    });

    it('不同位置键的恢复任务不会互相取消', () => {
        const scrollElement = {scrollTop: 0};
        const frames: FrameRequestCallback[] = [];
        const cancelFrame = vi.fn();
        vi.stubGlobal('document', {querySelector: () => scrollElement});
        vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
            frames.push(callback);
            return frames.length;
        });
        vi.stubGlobal('cancelAnimationFrame', cancelFrame);
        const coordinator = new MainContentScrollCoordinator();
        coordinator.remember('artists/list', 120);
        coordinator.remember('albums/list', 480);

        coordinator.restore('artists/list');
        coordinator.restore('albums/list');

        expect(cancelFrame).not.toHaveBeenCalled();
        frames[0]?.(0);
        expect(scrollElement.scrollTop).toBe(120);
        frames[1]?.(0);
        expect(scrollElement.scrollTop).toBe(480);
    });

    it('等待布局 ready 后才创建恢复帧', async () => {
        const scrollElement = {scrollTop: 0};
        const frames: FrameRequestCallback[] = [];
        let resolveReady!: () => void;
        const ready = new Promise<void>((resolve) => {
            resolveReady = resolve;
        });
        vi.stubGlobal('document', {querySelector: () => scrollElement});
        vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
            frames.push(callback);
            return 1;
        });
        vi.stubGlobal('cancelAnimationFrame', vi.fn());
        const coordinator = new MainContentScrollCoordinator();
        coordinator.remember('artists/list', 260);

        const restore = coordinator.restore('artists/list', {whenReady: ready});
        expect(frames).toHaveLength(0);
        resolveReady();
        await Promise.resolve();
        expect(frames).toHaveLength(1);
        frames[0]?.(0);
        await restore;
        expect(scrollElement.scrollTop).toBe(260);
    });

    it('等待期间 location 失效时不会写入滚动', async () => {
        const scrollElement = {scrollTop: 15};
        let current = true;
        let resolveReady!: () => void;
        const ready = new Promise<void>((resolve) => {
            resolveReady = resolve;
        });
        const requestFrame = vi.fn();
        vi.stubGlobal('document', {querySelector: () => scrollElement});
        vi.stubGlobal('requestAnimationFrame', requestFrame);
        vi.stubGlobal('cancelAnimationFrame', vi.fn());
        const coordinator = new MainContentScrollCoordinator();
        coordinator.remember('artists/list', 300);

        const restore = coordinator.restore('artists/list', {
            whenReady: ready,
            isCurrent: () => current
        });
        current = false;
        resolveReady();
        await restore;

        expect(requestFrame).not.toHaveBeenCalled();
        expect(scrollElement.scrollTop).toBe(15);
    });
});
