import {DOMImplementation, DOMParser, XMLSerializer} from '@xmldom/xmldom';
import {describe, expect, it} from 'vitest';
import {LyricsNormalizer} from '@/features/lyrics/format/LyricsNormalizer';
import {TtmlDocumentService} from '@/features/lyrics/format/TtmlDocumentService';

const ttmlService = new TtmlDocumentService({
    parser: new DOMParser(),
    implementation: new DOMImplementation(),
    serializer: new XMLSerializer()
});
const normalizer = new LyricsNormalizer(ttmlService);
const source = {kind: 'provider', providerId: 'fixture', candidateId: '1', manuallySelected: false} as const;

describe('LyricsNormalizer', () => {
    it('保留 TTML 的逐字、翻译、Ruby、背景人声和对唱结构', () => {
        const fixture = ttmlService.serialize({
            metadata: {
                timingMode: 'Word',
                agents: {
                    v1: {id: 'v1', type: 'person'},
                    v2: {id: 'v2', type: 'person'}
                }
            },
            lines: [{
                text: 'first',
                startTime: 0,
                endTime: 900,
                agentId: 'v1'
            }, {
                text: '運命',
                startTime: 1000,
                endTime: 4000,
                agentId: 'v2',
                words: [{
                    text: '運命',
                    startTime: 1000,
                    endTime: 2000,
                    ruby: [{text: 'さだめ', startTime: 1000, endTime: 2000}]
                }],
                translations: [{language: 'zh-Hans', text: '命运'}],
                backgroundVocal: {
                    text: 'background',
                    startTime: 2000,
                    endTime: 3000
                }
            }]
        });

        const result = normalizer.fromTtml(fixture, {source});

        expect(result.ttml.lines[1].words?.[0].ruby?.[0].text).toBe('さだめ');
        expect(result.render.lines[1].words[0].ruby?.[0].word).toBe('さだめ');
        expect(result.render.lines[1].translatedLyric).toBe('命运');
        expect(result.render.lines[1].isDuet).toBe(true);
        expect(result.render.lines.some(line => line.isBG)).toBe(true);
    });

    it('将逐行 LRC 转成无伪造逐字时间的 TTML', () => {
        const result = normalizer.fromLrc('[00:10.000]Hello world\n[00:13.000]Next line', {
            source,
            durationMs: 16_000
        });

        expect(result.ttml.metadata.timingMode).toBe('Line');
        expect(result.ttml.lines[0].words).toHaveLength(1);
        expect(result.ttml.lines[0].words?.[0].text).toBe('Hello world');
        expect(result.ttml.lines[0]).toMatchObject({text: 'Hello world', startTime: 10_000, endTime: 13_000});
        expect(result.ttml.lines[1].endTime).toBe(16_000);
        expect(result.render.lines[0].words).toHaveLength(1);
    });

    it('保留 YRC 逐字时间并按时间轴合并翻译', () => {
        const result = normalizer.fromYrc(
            '[1000,2000](1000,500,0)你(1500,500,0)好',
            {translation: '[00:01.100]Hello'},
            {source}
        );

        expect(result.ttml.lines[0].words).toHaveLength(2);
        expect(result.ttml.lines[0].words?.[1]).toMatchObject({text: '好', startTime: 1500, endTime: 2000});
        expect(result.render.lines[0].translatedLyric).toBe('Hello');
    });

    it('容纳网易 YRC 与翻译轨的真实行首偏差', () => {
        const result = normalizer.fromYrc(
            '[45370,2000](45370,1000,0)你(46370,1000,0)好',
            {translation: '[00:44.660]Hello'},
            {source}
        );

        expect(result.render.lines[0].translatedLyric).toBe('Hello');
    });

    it('不强行合并来源本身缺失或分行不同的翻译', () => {
        const result = normalizer.fromYrc(
            '[33290,2000](33290,2000,0)你好',
            {translation: '[00:30.820]Hello'},
            {source}
        );

        expect(result.render.lines[0].translatedLyric).toBe('');
    });

    it('保留 QRC 逐字时间', () => {
        const result = normalizer.fromQrc(
            '[1000,2000]你(1000,500)好(1500,500)',
            {},
            {source}
        );

        expect(result.ttml.lines[0].words?.map(word => word.text)).toEqual(['你', '好']);
    });
});
