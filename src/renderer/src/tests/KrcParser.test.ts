import {deflate} from 'pako';
import {DOMImplementation, DOMParser, XMLSerializer} from '@xmldom/xmldom';
import {describe, expect, it} from 'vitest';
import {decodeKrc} from '@/features/lyrics/format/krc/decodeKrc';
import {LyricsNormalizer} from '@/features/lyrics/format/LyricsNormalizer';
import {TtmlDocumentService} from '@/features/lyrics/format/TtmlDocumentService';

const XOR_KEY = new Uint8Array([
    0x40, 0x47, 0x61, 0x77, 0x5e, 0x32, 0x74, 0x47,
    0x51, 0x36, 0x31, 0x2d, 0xce, 0xd2, 0x6e, 0x69
]);

function encodeFixture(text: string): Uint8Array {
    const compressed = deflate(new TextEncoder().encode(text));
    const result = new Uint8Array(compressed.length + 4);
    result.set([0x6b, 0x72, 0x63, 0x31]);
    compressed.forEach((value, index) => {
        result[index + 4] = value ^ XOR_KEY[index % XOR_KEY.length];
    });
    return result;
}

function languageBlock(): string {
    const payload = JSON.stringify({
        version: 1,
        content: [
            {type: 0, lyricContent: [['ni', 'hao'], ['shi', 'jie']]},
            {type: 1, lyricContent: [['Hello'], ['World']]}
        ]
    });
    const bytes = new TextEncoder().encode(payload);
    let binary = '';
    bytes.forEach(byte => binary += String.fromCharCode(byte));
    return btoa(binary);
}

const ttmlService = new TtmlDocumentService({
    parser: new DOMParser(),
    implementation: new DOMImplementation(),
    serializer: new XMLSerializer()
});
const normalizer = new LyricsNormalizer(ttmlService);
const source = {kind: 'provider', providerId: 'kugou', candidateId: 'hash', manuallySelected: false} as const;

describe('KRC parser', () => {
    it('解码 Unicode、offset、逐字时间、翻译与音译并立即生成 TTML', () => {
        const fixture = encodeFixture([
            '[offset:100]',
            `[language:${languageBlock()}]`,
            '[1000,1000]<0,500,0>你<500,500,0>好',
            '[2500,1000]<0,500,0>世<500,500,0>界'
        ].join('\n'));

        const result = normalizer.fromKrc(fixture, {source});

        expect(result.ttml.lines[0]).toMatchObject({startTime: 1100, endTime: 2100});
        expect(result.ttml.lines[0].words?.[1]).toMatchObject({text: '好', startTime: 1600, endTime: 2100});
        expect(result.render.lines[0].translatedLyric).toBe('Hello');
        expect(result.render.lines[0].words.map(word => word.romanWord)).toEqual(['ni', 'hao']);
        expect(result.ttmlText).toContain('<tt');
    });

    it('支持没有 language block 的标准 KRC', () => {
        const result = normalizer.fromKrc(
            encodeFixture('[0,1000]<0,1000,0>纯音乐'),
            {source}
        );
        expect(result.render.lines[0].words[0].word).toBe('纯音乐');
        expect(result.render.lines[0].translatedLyric).toBe('');
    });

    it('拒绝损坏的 header 和压缩数据', () => {
        expect(() => decodeKrc(new Uint8Array([1, 2, 3, 4]))).toThrow('无效的 KRC 文件头');
        expect(() => decodeKrc(new Uint8Array([0x6b, 0x72, 0x63, 0x31, 1, 2, 3]))).toThrow('KRC 解压失败');
    });
});
