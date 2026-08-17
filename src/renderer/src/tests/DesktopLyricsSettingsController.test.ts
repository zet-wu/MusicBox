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

    it('复用播放详情页字体族并独立应用桌面歌词颜色与字号', async () => {
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
            lyricsFontSize: 64,
            desktopLyricsSettings: {
                color: '#abcdef',
                fontSize: 36
            }
        });

        expect(setProperty).toHaveBeenCalledWith(
            '--lyrics-font-family',
            '"Noto Serif CJK SC", "Songti SC", SimSun, serif'
        );
        expect(setProperty).toHaveBeenCalledWith('--amll-lp-color', '#abcdef');
        expect(setProperty).toHaveBeenLastCalledWith('--amll-lp-font-size', '36px');
    });
});
