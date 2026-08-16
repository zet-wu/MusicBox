import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import {DesktopLyricsSettingsController} from '@/features/desktopLyrics/DesktopLyricsSettingsController';

describe('DesktopLyricsSettingsController', () => {
    const setProperty = vi.fn();
    const removeProperty = vi.fn();

    beforeEach(() => {
        vi.stubGlobal('document', {
            documentElement: {style: {setProperty, removeProperty}},
            getElementById: vi.fn(() => null),
            createElement: vi.fn(),
            head: {append: vi.fn()}
        });
        vi.stubGlobal('localStorage', {
            getItem: vi.fn(() => null),
            setItem: vi.fn()
        });
    });

    afterEach(() => {
        vi.unstubAllGlobals();
        vi.clearAllMocks();
    });

    it('复用播放详情页的字体族与字号设置', async () => {
        const controller = new DesktopLyricsSettingsController(
            {container: {classList: {add: vi.fn(), remove: vi.fn()}} as never},
            {applyMousePassthrough: vi.fn(), forceUnlocked: vi.fn()} as never,
            {
                setOpacity: vi.fn(),
                setAlwaysOnTop: vi.fn(),
                setIgnoreMouseEvents: vi.fn(),
                centerOnScreen: vi.fn()
            } as never
        );

        await controller.updateSettings({
            desktopLyrics: true,
            lyricsFontFamily: 'serif',
            lyricsFontSize: 40
        });

        expect(setProperty).toHaveBeenCalledWith(
            '--lyrics-font-family',
            '"Noto Serif CJK SC", "Songti SC", SimSun, serif'
        );
        expect(setProperty).toHaveBeenCalledWith('--amll-lp-font-size', '40px');
    });
});
