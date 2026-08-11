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
});
