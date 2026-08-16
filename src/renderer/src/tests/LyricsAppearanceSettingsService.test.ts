import {afterEach, describe, expect, it, vi} from 'vitest';
import {lyricsAppearanceSettingsService} from '@/features/settings/service/LyricsAppearanceSettingsService';

describe('LyricsAppearanceSettingsService', () => {
    afterEach(() => {
        vi.unstubAllGlobals();
    });

    it('读取单色设置', () => {
        const settings = lyricsAppearanceSettingsService.getSettings({
            lyricsColorMode: 'custom',
            lyricsColor: '#123456'
        });

        expect(settings).toMatchObject({
            colorMode: 'custom',
            textColor: '#123456',
            fontFamily: 'inherit',
            customLatinFont: '',
            customCjkFont: '',
            fontSize: null
        });
    });

    it('仅在自定义模式写入 AMLL 基础文字颜色变量', () => {
        const values = new Map<string, string>();
        vi.stubGlobal('document', {
            getElementById: () => null,
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

    it('应用 AMLL 字体族和固定字号，并支持恢复自适应字号', () => {
        const values = new Map<string, string>();
        vi.stubGlobal('document', {
            getElementById: () => null,
            documentElement: {
                style: {
                    setProperty: (name: string, value: string) => values.set(name, value),
                    removeProperty: (name: string) => values.delete(name),
                    getPropertyValue: (name: string) => values.get(name) ?? ''
                }
            }
        });
        lyricsAppearanceSettingsService.applyTypography({
            fontFamily: 'cjk-sans',
            customLatinFont: '',
            customCjkFont: '',
            fontSize: 36
        });

        expect(document.documentElement.style.getPropertyValue('--lyrics-font-family')).toContain('Microsoft YaHei');
        expect(document.documentElement.style.getPropertyValue('--amll-lp-font-size')).toBe('36px');

        lyricsAppearanceSettingsService.applyTypography({
            fontFamily: 'inherit',
            customLatinFont: '',
            customCjkFont: '',
            fontSize: null
        });

        expect(document.documentElement.style.getPropertyValue('--lyrics-font-family')).toBe('');
        expect(document.documentElement.style.getPropertyValue('--amll-lp-font-size')).toBe('');
    });

    it('按字符范围应用自定义字体，单项留空时共用另一项字体', () => {
        const values = new Map<string, string>();
        let customStyle = '';
        vi.stubGlobal('document', {
            getElementById: () => null,
            createElement: () => ({id: '', textContent: ''}),
            head: {
                append: (style: {textContent: string}) => {
                    customStyle = style.textContent;
                }
            },
            documentElement: {
                style: {
                    setProperty: (name: string, value: string) => values.set(name, value),
                    removeProperty: (name: string) => values.delete(name),
                    getPropertyValue: (name: string) => values.get(name) ?? ''
                }
            }
        });

        lyricsAppearanceSettingsService.applyTypography({
            fontFamily: 'custom',
            customLatinFont: 'Inter',
            customCjkFont: '',
            fontSize: null
        });

        expect(customStyle.match(/local\("Inter"\)/g)).toHaveLength(2);
        expect(customStyle).toContain('U+0000-024F');
        expect(customStyle).toContain('U+FF61-FF65');
        expect(customStyle).toContain('U+3000-303F');
        expect(customStyle).toContain('U+FF01-FF60');
        expect(customStyle).toContain('U+FF66-FFEF');
        expect(values.get('--lyrics-font-family')).toContain('MusicBox Lyrics Custom');
    });
});
