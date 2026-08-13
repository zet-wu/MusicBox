import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import type {LyricsVolumeElements} from '../ui/widgets/lyrics/LyricsVolumeController';

const setVolume = vi.fn();

vi.mock('../features/playback/service/PlaybackUiStateService', () => ({
    playbackUiStateService: {
        setVolume,
        getVolume: () => 0.5
    }
}));

class FakeElement extends EventTarget {
    style = {width: '', left: '', display: ''};
    setPointerCapture = vi.fn();

    getBoundingClientRect(): DOMRect {
        return {left: 0, width: 100} as DOMRect;
    }
}

function createEvent(type: string, values: Record<string, number>): Event {
    const event = new Event(type, {cancelable: true});
    Object.entries(values).forEach(([key, value]) => {
        Object.defineProperty(event, key, {value});
    });
    return event;
}

function createControllerElements() {
    return {
        volumeBtn: new FakeElement(),
        volumeSliderContainer: new FakeElement(),
        volumeFill: new FakeElement(),
        volumeHandle: new FakeElement(),
        volumeIcon: new FakeElement(),
        volumeMuteIcon: new FakeElement(),
        volumeHalfIcon: new FakeElement()
    };
}

describe('LyricsVolumeController', () => {
    beforeEach(() => {
        setVolume.mockReset().mockResolvedValue(true);
        vi.stubGlobal('document', new EventTarget());
    });

    afterEach(() => {
        vi.unstubAllGlobals();
    });

    it('拖动音量条只在结束时提交一次', async () => {
        const {LyricsVolumeController} = await import('../ui/widgets/lyrics/LyricsVolumeController');
        const elements = createControllerElements();
        const controller = new LyricsVolumeController({
            elements: elements as unknown as LyricsVolumeElements,
            addDomListener: (element, event, handler, options) => {
                element.addEventListener(event, handler, options);
            }
        });
        controller.bind();

        elements.volumeSliderContainer.dispatchEvent(createEvent('pointerdown', {clientX: 25, pointerId: 1}));
        document.dispatchEvent(createEvent('pointermove', {clientX: 75, pointerId: 1}));
        expect(setVolume).not.toHaveBeenCalled();
        document.dispatchEvent(createEvent('pointerup', {clientX: 75, pointerId: 1}));
        await Promise.resolve();

        expect(setVolume).toHaveBeenCalledOnce();
        expect(setVolume).toHaveBeenCalledWith(0.75);
    });

    it('滚轮向上增加音量且运行时同步不写回音频引擎', async () => {
        const {LyricsVolumeController} = await import('../ui/widgets/lyrics/LyricsVolumeController');
        const elements = createControllerElements();
        const controller = new LyricsVolumeController({
            elements: elements as unknown as LyricsVolumeElements,
            addDomListener: (element, event, handler, options) => {
                element.addEventListener(event, handler, options);
            }
        });
        controller.bind();
        controller.setVolumeFromRuntime(0.5);
        expect(setVolume).not.toHaveBeenCalled();

        elements.volumeSliderContainer.dispatchEvent(createEvent('wheel', {deltaY: -100}));
        await Promise.resolve();

        expect(setVolume).toHaveBeenCalledWith(0.51);
    });
});
