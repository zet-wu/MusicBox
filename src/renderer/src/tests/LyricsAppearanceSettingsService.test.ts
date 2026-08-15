import {afterEach, describe, expect, it, vi} from 'vitest';
import {lyricsAppearanceSettingsService} from '@/features/settings/service/LyricsAppearanceSettingsService';

describe('LyricsAppearanceSettingsService', () => {
    afterEach(() => {
        vi.unstubAllGlobals();
    });

    it('迁移旧的单色设置并提供未唱歌词默认颜色', () => {
        const settings = lyricsAppearanceSettingsService.getSettings({
            lyricsColorMode: 'custom',
            lyricsTextColor: '#123456'
        });

        expect(settings).toMatchObject({
            colorMode: 'custom',
            sungColor: '#123456',
            unsungColor: '#6b7280'
        });
    });

    it('仅在自定义模式写入已唱和未唱颜色变量', () => {
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
            sungColor: '#112233',
            unsungColor: '#445566'
        });

        expect(document.documentElement.style.getPropertyValue('--lyrics-sung-color')).toBe('#112233');
        expect(document.documentElement.style.getPropertyValue('--lyrics-unsung-color')).toBe('#445566');

        lyricsAppearanceSettingsService.applyTextColor({
            colorMode: 'auto',
            sungColor: '#112233',
            unsungColor: '#445566'
        });

        expect(document.documentElement.style.getPropertyValue('--lyrics-sung-color')).toBe('');
        expect(document.documentElement.style.getPropertyValue('--lyrics-unsung-color')).toBe('');
    });
});
