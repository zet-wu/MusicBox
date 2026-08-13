import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';

const seek = vi.fn();

vi.mock('../features/playback/service/PlaybackUiStateService', () => ({
    playbackUiStateService: {
        seek,
        getState: () => ({duration: 100})
    }
}));

vi.mock('../utils', () => ({
    formatTime: (seconds: number) => String(seconds)
}));

class FakeElement extends EventTarget {
    textContent = '';
    style = {width: '', left: ''};
    classList = {add: vi.fn(), remove: vi.fn()};
    setPointerCapture = vi.fn();

    getBoundingClientRect(): DOMRect {
        return {left: 0, width: 100} as DOMRect;
    }
}

function createPointerEvent(type: string, clientX: number): Event {
    const event = new Event(type);
    Object.defineProperties(event, {
        clientX: {value: clientX},
        pointerId: {value: 1}
    });
    return event;
}

describe('LyricsProgressController', () => {
    beforeEach(() => {
        seek.mockReset().mockResolvedValue(true);
        vi.stubGlobal('document', new EventTarget());
    });

    afterEach(() => {
        vi.unstubAllGlobals();
    });

    it('一次指针操作只提交一次跳转', async () => {
        const {LyricsProgressController} = await import('../ui/widgets/lyrics/LyricsProgressController');
        const progressBar = new FakeElement();
        const controller = new LyricsProgressController({
            elements: {
                progressBar: progressBar as unknown as HTMLElement,
                progressFill: new FakeElement() as unknown as HTMLElement,
                progressHandle: new FakeElement() as unknown as HTMLElement,
                currentTimeEl: new FakeElement() as unknown as HTMLElement,
                durationEl: new FakeElement() as unknown as HTMLElement
            },
            addDomListener: (element, event, handler, options) => {
                element.addEventListener(event, handler, options);
            },
            getCurrentTrack: () => ({filePath: 'track.flac', title: '歌曲', artist: '歌手', duration: 100})
        });
        controller.bind();

        progressBar.dispatchEvent(createPointerEvent('pointerdown', 25));
        document.dispatchEvent(createPointerEvent('pointerup', 25));
        await Promise.resolve();

        expect(seek).toHaveBeenCalledOnce();
        expect(seek).toHaveBeenCalledWith(25);
    });
});
