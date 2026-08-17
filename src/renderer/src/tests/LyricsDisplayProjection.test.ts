import {describe, expect, it} from 'vitest';
import {projectLyricsForDisplay} from '@/features/lyrics/ui/LyricsDisplayProjection';

describe('LyricsDisplayProjection', () => {
    const line = {
        words: [{word: '運命', startTime: 0, endTime: 1000, romanWord: 'unmei', ruby: [{word: 'うんめい', startTime: 0, endTime: 1000}]}],
        translatedLyric: '命运',
        romanLyric: 'unmei',
        startTime: 0,
        endTime: 1000,
        isBG: false,
        isDuet: false
    };

    it('启用假名注音时将 Ruby 原样交给 AMLL', () => {
        const projected = projectLyricsForDisplay([line], {
            showTranslation: true,
            showRomanization: true,
            showRuby: true
        });

        expect(projected[0].words[0].ruby?.[0]).toMatchObject({word: 'うんめい'});
    });

    it('只过滤渲染投影并保留原始 AMLL 数据', () => {
        const projected = projectLyricsForDisplay([line], {
            showTranslation: false,
            showRomanization: false,
            showRuby: false
        });

        expect(projected[0]).toMatchObject({translatedLyric: '', romanLyric: ''});
        expect(projected[0].words[0]).toMatchObject({romanWord: undefined, ruby: undefined});
        expect(line).toMatchObject({translatedLyric: '命运', romanLyric: 'unmei'});
        expect(line.words[0].ruby).toHaveLength(1);
    });
});
