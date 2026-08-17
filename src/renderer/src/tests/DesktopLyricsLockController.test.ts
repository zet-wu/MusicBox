import {describe, expect, it, vi} from 'vitest';
import {DesktopLyricsLockController} from '@/features/desktopLyrics/DesktopLyricsLockController';

function fakeElement() {
    const classes = new Set<string>();
    return {
        title: '',
        style: {display: ''},
        classList: {
            toggle: vi.fn((name: string, enabled: boolean) => {
                if (enabled) classes.add(name);
                else classes.delete(name);
            }),
            contains: (name: string) => classes.has(name)
        },
        addEventListener: vi.fn()
    } as unknown as HTMLElement;
}

describe('DesktopLyricsLockController', () => {
    it('未锁定时显示解锁状态并允许鼠标操作', async () => {
        const container = fakeElement();
        const lockBtn = fakeElement();
        const lockIcon = fakeElement();
        const unlockIcon = fakeElement();
        const windowService = {setIgnoreMouseEvents: vi.fn().mockResolvedValue(undefined)};
        const controller = new DesktopLyricsLockController({
            container,
            controlsBar: fakeElement(),
            lockBtn,
            lockIcon,
            unlockIcon
        }, windowService as never);

        await controller.applyMousePassthrough();

        expect(controller.locked).toBe(false);
        expect(lockBtn.title).toBe('未锁定（点击锁定）');
        expect(lockIcon.style.display).toBe('none');
        expect(unlockIcon.style.display).toBe('block');
        expect(container.classList.contains('locked')).toBe(false);
        expect(windowService.setIgnoreMouseEvents).toHaveBeenCalledWith(false);
    });

    it('锁定时显示锁定状态并启用鼠标穿透', async () => {
        const container = fakeElement();
        const lockBtn = fakeElement();
        const lockIcon = fakeElement();
        const unlockIcon = fakeElement();
        const windowService = {setIgnoreMouseEvents: vi.fn().mockResolvedValue(undefined)};
        const controller = new DesktopLyricsLockController({
            container,
            controlsBar: fakeElement(),
            lockBtn,
            lockIcon,
            unlockIcon
        }, windowService as never);

        await controller.toggle();

        expect(controller.locked).toBe(true);
        expect(lockBtn.title).toBe('已锁定（点击解锁）');
        expect(lockIcon.style.display).toBe('block');
        expect(unlockIcon.style.display).toBe('none');
        expect(container.classList.contains('locked')).toBe(true);
        expect(windowService.setIgnoreMouseEvents).toHaveBeenCalledWith(true, {forward: true});
    });
});
