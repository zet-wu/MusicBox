import {describe, expect, it} from 'vitest';
import {buildTtmlExportName} from '@/ui/widgets/lyrics/LyricsExportFileName';
import type {Track} from '@api/types/track';

function track(filePath: string, fileName?: string): Track {
    return {title: '显示标题', artist: '艺术家', filePath, fileName};
}

describe('LyricsContextMenu', () => {
    it.each([
        ['C:\\Music\\A.flac', 'A.ttml'],
        ['C:\\Music\\A.live.flac', 'A.live.ttml'],
        ['/home/a/B.mp3', 'B.ttml'],
        ['\\\\server\\share\\C.wav', 'C.ttml'],
        ['/path/noext', 'noext.ttml']
    ])('从歌曲文件路径生成 TTML 默认名', (filePath, expected) => {
        expect(buildTtmlExportName(track(filePath))).toBe(expected);
    });

    it('清理非法文件名字符且不使用显示标题', () => {
        expect(buildTtmlExportName(track('C:\\Music\\A:B?.flac'))).toBe('A_B_.ttml');
        expect(buildTtmlExportName(track('', 'fallback.live.flac'))).toBe('fallback.live.ttml');
        expect(buildTtmlExportName(track(''))).toBe('lyrics.ttml');
    });
});
