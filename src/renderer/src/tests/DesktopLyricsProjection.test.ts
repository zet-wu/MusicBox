import {describe, expect, it} from 'vitest';
import {projectLyricsForDesktop} from '@/features/desktopLyrics/DesktopLyricsProjection';

describe('projectLyricsForDesktop', () => {
    it('仅保留主歌词及其原始逐字和 Ruby 时间', () => {
        const input = [{
            words: [{
                word: '運命', startTime: 1000, endTime: 2000, romanWord: 'sadame',
                ruby: [{word: 'さだめ', startTime: 1100, endTime: 1900}]
            }],
            translatedLyric: '命运',
            romanLyric: 'sadame',
            isBG: false,
            isDuet: true,
            startTime: 1000,
            endTime: 2000
        }, {
            words: [{word: '和声', startTime: 1200, endTime: 1800}],
            translatedLyric: '',
            romanLyric: '',
            isBG: true,
            isDuet: false,
            startTime: 1200,
            endTime: 1800
        }];

        const projected = projectLyricsForDesktop(input);

        expect(projected).toHaveLength(1);
        expect(projected[0]).toMatchObject({
            translatedLyric: '', romanLyric: '', isDuet: false,
            startTime: 1000, endTime: 2000
        });
        expect(projected[0].words[0]).toEqual({
            word: '運命', startTime: 1000, endTime: 2000,
            ruby: [{word: 'さだめ', startTime: 1100, endTime: 1900}]
        });
        expect(input[0].isDuet).toBe(true);
        expect(input[0].words[0].romanWord).toBe('sadame');
        expect(projected[0].words[0]).not.toBe(input[0].words[0]);
    });
});
