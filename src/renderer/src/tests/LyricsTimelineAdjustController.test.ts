import {describe, expect, it, vi} from 'vitest';
import {LyricsTimelineAdjustController} from '@/ui/widgets/lyrics/LyricsTimelineAdjustController';
import type {LyricsDocument} from '@/features/lyrics/domain/types';

class FakeElement extends EventTarget {
    hidden = false;
}

const track = {
    fileId: 'track-1',
    title: 'Song',
    artist: 'Artist',
    album: 'Album',
    filePath: 'Song.flac'
};
const source = {kind: 'provider', providerId: 'test', candidateId: '1'} as const;

function lyricDocument(startTime: number): LyricsDocument {
    return {
        ttmlText: '<tt/>',
        ttml: {metadata: {}, lines: []},
        render: {metadata: [], lines: [{
            words: [], translatedLyric: '', romanLyric: '', isBG: false, isDuet: false,
            startTime, endTime: startTime + 1000
        }]},
        source
    };
}

function createController(shiftCanonicalTimeline = vi.fn()) {
    const container = new FakeElement();
    const earlierButton = new FakeElement();
    const laterButton = new FakeElement();
    const dispatchDocumentApplied = vi.fn();
    const syncDesktopLyrics = vi.fn().mockResolvedValue(undefined);
    const controller = new LyricsTimelineAdjustController({
        elements: {
            container: container as never,
            earlierButton: earlierButton as never,
            laterButton: laterButton as never
        },
        addDomListener: (element, event, handler) => element.addEventListener(event, handler),
        getCurrentTrack: () => track,
        service: {shiftCanonicalTimeline} as never,
        dispatchDocumentApplied,
        syncDesktopLyrics
    });
    controller.bind();
    return {controller, container, earlierButton, laterButton, dispatchDocumentApplied, syncDesktopLyrics};
}

describe('LyricsTimelineAdjustController', () => {
    it('仅在存在有效歌词文档时显示', () => {
        const {controller, container} = createController();

        expect(container.hidden).toBe(true);
        controller.setEditableDocument(lyricDocument(0));
        expect(container.hidden).toBe(false);
        controller.setEditableDocument(null);
        expect(container.hidden).toBe(true);
    });

    it('按点击顺序串行保存每一次 100ms 调整', async () => {
        const calls: number[] = [];
        let releaseFirst: (() => void) | undefined;
        const firstPending = new Promise<void>(resolve => {
            releaseFirst = resolve;
        });
        const shift = vi.fn(async (_query, deltaMs: number) => {
            calls.push(deltaMs);
            if (calls.length === 1) await firstPending;
            return {document: lyricDocument(calls.length * 100), appliedDeltaMs: deltaMs};
        });
        const {earlierButton, laterButton, dispatchDocumentApplied, syncDesktopLyrics} = createController(shift);

        earlierButton.dispatchEvent(new Event('click'));
        earlierButton.dispatchEvent(new Event('click'));
        laterButton.dispatchEvent(new Event('click'));
        await Promise.resolve();
        expect(calls).toEqual([-100]);

        releaseFirst?.();
        await vi.waitFor(() => expect(calls).toEqual([-100, -100, 100]));
        await vi.waitFor(() => expect(syncDesktopLyrics).toHaveBeenCalledTimes(3));
        expect(dispatchDocumentApplied).toHaveBeenCalledTimes(3);
    });

    it('一次失败不会阻止后续点击执行且不广播失败结果', async () => {
        const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
        const shift = vi.fn()
            .mockResolvedValueOnce({document: null, appliedDeltaMs: 0, error: '保存失败'})
            .mockResolvedValueOnce({document: lyricDocument(100), appliedDeltaMs: 100});
        const {earlierButton, laterButton, dispatchDocumentApplied} = createController(shift);

        earlierButton.dispatchEvent(new Event('click'));
        laterButton.dispatchEvent(new Event('click'));

        await vi.waitFor(() => expect(shift).toHaveBeenCalledTimes(2));
        await vi.waitFor(() => expect(dispatchDocumentApplied).toHaveBeenCalledTimes(1));
        consoleError.mockRestore();
    });
});
