import {describe, expect, it} from 'vitest';
import {describeLyricsCandidatePreview} from '@/features/lyrics/domain/describeLyricsCandidatePreview';
import type {LyricsCandidatePreview} from '@/features/lyrics/domain/types';

function preview(words: number, format: LyricsCandidatePreview['format']): LyricsCandidatePreview {
    return {
        format,
        document: {
            ttmlText: '<tt/>',
            ttml: {metadata: {}, lines: []},
            render: {
                metadata: [],
                lines: [{
                    words: Array.from({length: words}, (_, index) => ({
                        word: String(index), startTime: index * 100, endTime: (index + 1) * 100
                    })),
                    translatedLyric: '',
                    romanLyric: '',
                    startTime: 0,
                    endTime: words * 100,
                    isBG: false,
                    isDuet: false
                }]
            },
            source: {kind: 'provider', providerId: 'test', candidateId: 'candidate', manuallySelected: true}
        }
    };
}

describe('describeLyricsCandidatePreview', () => {
    it('根据解析后的字级时间展示原始格式和逐字标记', () => {
        expect(describeLyricsCandidatePreview(preview(2, 'qrc'))).toEqual(['QRC', '逐字']);
    });

    it('不使用搜索阶段的能力声明推测逐字歌词', () => {
        expect(describeLyricsCandidatePreview(preview(1, 'lrc'))).toEqual(['LRC', '逐行']);
    });
});
