import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import {LyricsTimelineAdjustController} from '@/ui/widgets/lyrics/LyricsTimelineAdjustController';
import type {LyricsDocument} from '@/features/lyrics/domain/types';

class FakeButton extends EventTarget {
    hidden = false;
    disabled = false;
    private capturedPointerId: number | null = null;

    setPointerCapture(pointerId: number): void {
        this.capturedPointerId = pointerId;
    }

    hasPointerCapture(pointerId: number): boolean {
        return this.capturedPointerId === pointerId;
    }

    releasePointerCapture(pointerId: number): void {
        if (this.capturedPointerId === pointerId) this.capturedPointerId = null;
    }
}

const track = {
    fileId: 'track-1',
    title: 'Song',
    artist: 'Artist',
    album: 'Album',
    filePath: 'Song.flac'
};
const source = {kind: 'provider', providerId: 'test', candidateId: '1'} as const;

function lyricDocument(startTime = 10_000): LyricsDocument {
    return {
        ttmlText: '<tt/>',
        ttml: {metadata: {}, lines: [{text: '歌词', words: [], startTime, endTime: startTime + 1000}]},
        render: {metadata: [], lines: [{
            words: [], translatedLyric: '', romanLyric: '', isBG: false, isDuet: false,
            startTime, endTime: startTime + 1000
        }]},
        source
    };
}

function event(type: string, properties: Record<string, unknown> = {}): Event {
    const value = new Event(type, {cancelable: true});
    for (const [key, propertyValue] of Object.entries(properties)) {
        Object.defineProperty(value, key, {value: propertyValue});
    }
    return value;
}

function createController(shiftCanonicalTimeline = vi.fn()) {
    const container = new FakeButton();
    const earlierButton = new FakeButton();
    const laterButton = new FakeButton();
    const dispatchDocumentApplied = vi.fn();
    const syncDesktopLyrics = vi.fn().mockResolvedValue(undefined);
    const setTimelinePreviewDelta = vi.fn();
    const clearTimelinePreview = vi.fn();
    let currentTrack: typeof track | null = track;
    const controller = new LyricsTimelineAdjustController({
        elements: {
            container: container as never,
            earlierButton: earlierButton as never,
            laterButton: laterButton as never
        },
        addDomListener: (element, eventName, handler) => element.addEventListener(eventName, handler),
        getCurrentTrack: () => currentTrack,
        service: {shiftCanonicalTimeline} as never,
        dispatchDocumentApplied,
        syncDesktopLyrics,
        setTimelinePreviewDelta,
        clearTimelinePreview
    });
    controller.bind();
    return {
        controller, container, earlierButton, laterButton, dispatchDocumentApplied, syncDesktopLyrics,
        setTimelinePreviewDelta, clearTimelinePreview,
        setCurrentTrack: (value: typeof track | null) => { currentTrack = value; }
    };
}

describe('LyricsTimelineAdjustController', () => {
    beforeEach(() => {
        vi.useFakeTimers();
        vi.stubGlobal('window', new EventTarget());
    });
    afterEach(() => {
        vi.useRealTimers();
        vi.restoreAllMocks();
        vi.unstubAllGlobals();
    });

    it('仅在存在有效歌词文档时显示', () => {
        const {controller, container, earlierButton} = createController();

        expect(container.hidden).toBe(true);
        expect(earlierButton.disabled).toBe(true);
        controller.setEditableDocument(lyricDocument());
        expect(container.hidden).toBe(false);
        expect(earlierButton.disabled).toBe(false);
        controller.setEditableDocument(null);
        expect(container.hidden).toBe(true);
    });

    it('短按实时预览且松开只保存一次，并抑制后续 pointer click', async () => {
        const shifted = lyricDocument(9900);
        const shift = vi.fn().mockResolvedValue({document: shifted, appliedDeltaMs: -100});
        const result = createController(shift);
        result.controller.setEditableDocument(lyricDocument());

        result.earlierButton.dispatchEvent(event('pointerdown', {pointerId: 7, button: 0}));
        expect(result.setTimelinePreviewDelta).toHaveBeenLastCalledWith(-100);
        expect(shift).not.toHaveBeenCalled();
        result.earlierButton.dispatchEvent(event('pointerup', {pointerId: 7}));
        result.earlierButton.dispatchEvent(event('click', {detail: 1}));

        await vi.waitFor(() => expect(shift).toHaveBeenCalledOnce());
        expect(shift.mock.calls[0][1]).toBe(-100);
        expect(result.dispatchDocumentApplied).toHaveBeenCalledOnce();
        expect(result.syncDesktopLyrics).toHaveBeenCalledOnce();
        expect(result.clearTimelinePreview).toHaveBeenCalledWith({refresh: false});
    });

    it('长按分段加速期间不保存，松开后只保存累计偏移', async () => {
        const shift = vi.fn().mockResolvedValue({document: lyricDocument(9200), appliedDeltaMs: -800});
        const result = createController(shift);
        result.controller.setEditableDocument(lyricDocument());

        result.earlierButton.dispatchEvent(event('pointerdown', {pointerId: 3, button: 0}));
        await vi.advanceTimersByTimeAsync(1300);

        expect(shift).not.toHaveBeenCalled();
        expect(result.setTimelinePreviewDelta.mock.calls.map(call => call[0]))
            .toEqual([-100, -200, -300, -400, -500, -600, -800]);

        result.earlierButton.dispatchEvent(event('pointerup', {pointerId: 3}));
        await vi.waitFor(() => expect(shift).toHaveBeenCalledOnce());
        expect(shift.mock.calls[0][1]).toBe(-800);
    });

    it('键盘 click 仍只提交一次 100ms', async () => {
        const shift = vi.fn().mockResolvedValue({document: lyricDocument(10_100), appliedDeltaMs: 100});
        const result = createController(shift);
        result.controller.setEditableDocument(lyricDocument());

        result.laterButton.dispatchEvent(event('click', {detail: 0}));

        await vi.waitFor(() => expect(shift).toHaveBeenCalledOnce());
        expect(shift.mock.calls[0][1]).toBe(100);
    });

    it('取消、失焦与歌词失效会清除预览且不保存', () => {
        const shift = vi.fn();
        const result = createController(shift);
        result.controller.setEditableDocument(lyricDocument());

        result.earlierButton.dispatchEvent(event('pointerdown', {pointerId: 1, button: 0}));
        result.earlierButton.dispatchEvent(event('pointercancel', {pointerId: 1}));
        result.earlierButton.dispatchEvent(event('pointerdown', {pointerId: 2, button: 0}));
        window.dispatchEvent(new Event('blur'));
        result.earlierButton.dispatchEvent(event('pointerdown', {pointerId: 3, button: 0}));
        result.controller.setEditableDocument(null);

        expect(result.clearTimelinePreview).toHaveBeenCalledTimes(3);
        expect(shift).not.toHaveBeenCalled();
    });

    it('负偏移预览遵循 canonical 最早时间边界', () => {
        const result = createController();
        result.controller.setEditableDocument(lyricDocument(50));

        result.earlierButton.dispatchEvent(event('pointerdown', {pointerId: 1, button: 0}));
        vi.advanceTimersByTime(1000);

        expect(result.setTimelinePreviewDelta).toHaveBeenLastCalledWith(-50);
        result.earlierButton.dispatchEvent(event('pointercancel', {pointerId: 1}));
    });

    it('保存失败恢复真实时间且不广播，提交中拒绝第二个手势', async () => {
        let release: (() => void) | undefined;
        const pending = new Promise<void>(resolve => { release = resolve; });
        const shift = vi.fn(async () => {
            await pending;
            return {document: null, appliedDeltaMs: 0, error: '保存失败'};
        });
        const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
        const result = createController(shift);
        result.controller.setEditableDocument(lyricDocument());

        result.earlierButton.dispatchEvent(event('pointerdown', {pointerId: 1, button: 0}));
        result.earlierButton.dispatchEvent(event('pointerup', {pointerId: 1}));
        result.laterButton.dispatchEvent(event('pointerdown', {pointerId: 2, button: 0}));
        expect(result.laterButton.disabled).toBe(true);
        expect(result.setTimelinePreviewDelta).toHaveBeenCalledTimes(1);

        release?.();
        await vi.waitFor(() => expect(result.clearTimelinePreview).toHaveBeenCalled());
        expect(result.dispatchDocumentApplied).not.toHaveBeenCalled();
        expect(result.laterButton.disabled).toBe(false);
        expect(consoleError).toHaveBeenCalledOnce();
    });

    it('手势期间切歌会取消且不提交旧歌曲', () => {
        const shift = vi.fn();
        const result = createController(shift);
        result.controller.setEditableDocument(lyricDocument());

        result.earlierButton.dispatchEvent(event('pointerdown', {pointerId: 1, button: 0}));
        result.setCurrentTrack({...track, fileId: 'track-2'});
        result.controller.setEditableDocument(lyricDocument());

        expect(result.clearTimelinePreview).toHaveBeenCalledOnce();
        expect(shift).not.toHaveBeenCalled();
    });
});
