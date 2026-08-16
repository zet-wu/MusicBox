import {DOMImplementation, DOMParser, XMLSerializer} from '@xmldom/xmldom';
import type {TTMLResult} from '@applemusic-like-lyrics/ttml';
import {describe, expect, it} from 'vitest';
import {shiftTimeline} from '@/features/lyrics/format/TtmlTimelineEditor';
import {TtmlDocumentService} from '@/features/lyrics/format/TtmlDocumentService';

const fixture: TTMLResult = {
    metadata: {timingMode: 'Word', language: 'ja'},
    lines: [{
        text: '運命',
        startTime: 100,
        endTime: 1100,
        agentId: 'v2',
        words: [{
            text: '運命',
            startTime: 200,
            endTime: 900,
            ruby: [{text: 'さだめ', startTime: 250, endTime: 850}]
        }],
        translations: [{
            language: 'zh-Hans',
            text: '命运',
            words: [{text: '命运', startTime: 300, endTime: 800}]
        }],
        romanizations: [{
            language: 'ja-Latn',
            text: 'sadame',
            words: [{text: 'sadame', startTime: 200, endTime: 900}]
        }],
        backgroundVocal: {
            text: '声',
            startTime: 400,
            endTime: 1000,
            words: [{text: '声', startTime: 450, endTime: 950}]
        }
    }]
};

describe('shiftTimeline', () => {
    it('将所有时间节点统一向后移动并保持内容与时长', () => {
        const result = shiftTimeline(fixture, 100);
        const line = result.document.lines[0];

        expect(result.appliedDeltaMs).toBe(100);
        expect(line).toMatchObject({text: '運命', startTime: 200, endTime: 1200, agentId: 'v2'});
        expect(line.words?.[0]).toMatchObject({text: '運命', startTime: 300, endTime: 1000});
        expect(line.words?.[0].ruby?.[0]).toEqual({text: 'さだめ', startTime: 350, endTime: 950});
        expect(line.translations?.[0]).toMatchObject({text: '命运'});
        expect(line.translations?.[0].words?.[0]).toMatchObject({startTime: 400, endTime: 900});
        expect(line.romanizations?.[0]).toMatchObject({text: 'sadame'});
        expect(line.romanizations?.[0].words?.[0]).toMatchObject({startTime: 300, endTime: 1000});
        expect(line.backgroundVocal).toMatchObject({text: '声', startTime: 500, endTime: 1100});
        expect(line.backgroundVocal?.words?.[0]).toMatchObject({startTime: 550, endTime: 1050});
        expect(line.endTime - line.startTime).toBe(1000);
        expect(line.words![0].startTime - line.startTime).toBe(100);
        expect(fixture.lines[0].startTime).toBe(100);
    });

    it('将所有时间节点统一向前移动', () => {
        const result = shiftTimeline(fixture, -50);

        expect(result.appliedDeltaMs).toBe(-50);
        expect(result.document.lines[0]).toMatchObject({startTime: 50, endTime: 1050});
        expect(result.document.lines[0].backgroundVocal).toMatchObject({startTime: 350, endTime: 950});
    });

    it('以最早时间约束负偏移且不逐节点截断', () => {
        const result = shiftTimeline(fixture, -1000);
        const line = result.document.lines[0];

        expect(result.appliedDeltaMs).toBe(-100);
        expect(line.startTime).toBe(0);
        expect(line.words?.[0].startTime).toBe(100);
        expect(line.backgroundVocal?.startTime).toBe(300);
    });

    it('最早时间为零时负偏移成为不破坏文档的 no-op', () => {
        const zeroBased = {...fixture, lines: [{...fixture.lines[0], startTime: 0}]};
        const result = shiftTimeline(zeroBased, -100);

        expect(result.appliedDeltaMs).toBe(0);
        expect(result.document).toEqual(zeroBased);
        expect(result.document).not.toBe(zeroBased);
    });

    it('移动后的文档仍可序列化并重新解析', () => {
        const service = new TtmlDocumentService({
            parser: new DOMParser(),
            implementation: new DOMImplementation(),
            serializer: new XMLSerializer()
        });

        const reparsed = service.parse(service.serialize(shiftTimeline(fixture, 100).document));

        expect(reparsed.lines[0]).toMatchObject({text: '運命', startTime: 200, endTime: 1200});
        expect(reparsed.lines[0].words?.[0].ruby?.[0]).toMatchObject({
            text: 'さだめ', startTime: 350, endTime: 950
        });
    });
});
