import {afterEach, describe, expect, it, vi} from 'vitest';
import {lyricsAppearanceSettingsService} from '@/features/settings/service/LyricsAppearanceSettingsService';

describe('LyricsAppearanceSettingsService', () => {
    afterEach(() => {
        vi.unstubAllGlobals();
    });

    it('读取单色设置', () => {
        const settings = lyricsAppearanceSettingsService.getSettings({
            lyricsColorMode: 'custom',
            lyricsTextColor: '#123456'
        });

        expect(settings).toMatchObject({
            colorMode: 'custom',
            textColor: '#123456'
        });
    });

    it('仅在自定义模式写入 AMLL 基础文字颜色变量', () => {
        const values = new Map<string, string>();
        vi.stubGlobal('document', {
            documentElement: {
                style: {
                    setProperty: (name: string, value: string) => values.set(name, value),
                    removeProperty: (name: string) => values.delete(name),
                    getPropertyValue: (name: string) => values.get(name) ?? ''
                }
            }
        });
        lyricsAppearanceSettingsService.applyTextColor({
            colorMode: 'custom',
            textColor: '#112233'
        });

        expect(document.documentElement.style.getPropertyValue('--lyrics-text-color')).toBe('#112233');

        lyricsAppearanceSettingsService.applyTextColor({
            colorMode: 'auto',
            textColor: '#112233'
        });

        expect(document.documentElement.style.getPropertyValue('--lyrics-text-color')).toBe('');
    });

    it('将上一版已唱颜色迁移为单色设置', () => {
        const settings = lyricsAppearanceSettingsService.getSettings({
            lyricsColorMode: 'custom',
            lyricsSungColor: '#abcdef',
            lyricsUnsungColor: '#123456'
        });

        expect(settings.textColor).toBe('#abcdef');
    });
});
