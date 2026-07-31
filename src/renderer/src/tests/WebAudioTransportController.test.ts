import {afterEach, describe, expect, it, vi} from 'vitest';
import WebAudioTransportController from '../features/playback/service/audioEngine/webAudio/WebAudioTransportController';

function createHarness() {
    const sourceNode = {
        disconnect: vi.fn()
    } as unknown as MediaElementAudioSourceNode;
    const mediaElement = {
        src: 'blob:track',
        currentTime: 10,
        paused: false,
        ended: false,
        play: vi.fn(async () => undefined),
        pause: vi.fn(),
        removeAttribute: vi.fn(),
        load: vi.fn(),
        onended: null,
        onplay: null,
        onpause: null
    } as unknown as HTMLAudioElement;
    const playbackStateChanged = vi.fn(async (_isPlaying: boolean) => undefined);
    const trackEnded = vi.fn();
    const controller = new WebAudioTransportController({
        getAudioContext: () => ({
            state: 'running',
            createMediaElementSource: () => sourceNode
        }) as unknown as AudioContext,
        getMediaElement: () => mediaElement,
        getDuration: () => 180,
        connectSourceToChain: vi.fn(),
        onTrackEnded: trackEnded,
        getPlaybackStateChangedCallback: () => playbackStateChanged,
        getPositionChangedCallback: () => null
    });
    controller.initialize();

    return {
        controller,
        mediaElement,
        playbackStateChanged,
        trackEnded,
        setEnded: (ended: boolean) => {
            Object.defineProperty(mediaElement, 'ended', {
                configurable: true,
                value: ended
            });
        }
    };
}

describe('WebAudioTransportController', () => {
    const controllers: WebAudioTransportController[] = [];

    afterEach(() => {
        controllers.forEach((controller) => controller.destroy());
        controllers.length = 0;
    });

    it('媒体元素被外部暂停时同步内部播放状态', async () => {
        const harness = createHarness();
        controllers.push(harness.controller);
        await harness.controller.play();
        harness.playbackStateChanged.mockClear();

        harness.mediaElement.currentTime = 30;
        harness.mediaElement.onpause?.(new Event('pause'));

        await vi.waitFor(() => {
            expect(harness.controller.isPlaying()).toBe(false);
            expect(harness.controller.isPaused()).toBe(true);
            expect(harness.playbackStateChanged).toHaveBeenCalledOnce();
            expect(harness.playbackStateChanged).toHaveBeenCalledWith(false);
        });
    });

    it('自然结束先触发暂停事件时仍通知播放下一首', async () => {
        const harness = createHarness();
        controllers.push(harness.controller);
        await harness.controller.play();
        harness.playbackStateChanged.mockClear();

        harness.mediaElement.currentTime = 180;
        harness.setEnded(true);
        harness.mediaElement.onpause?.(new Event('pause'));
        harness.mediaElement.onended?.(new Event('ended'));

        await vi.waitFor(() => {
            expect(harness.controller.isPlaying()).toBe(false);
            expect(harness.controller.isPaused()).toBe(false);
            expect(harness.playbackStateChanged).toHaveBeenCalledOnce();
            expect(harness.playbackStateChanged).toHaveBeenCalledWith(false);
            expect(harness.trackEnded).toHaveBeenCalledOnce();
        });
    });

    it('媒体元素被外部继续播放时同步内部播放状态', async () => {
        const harness = createHarness();
        controllers.push(harness.controller);
        await harness.controller.play();
        await harness.controller.pause();
        harness.playbackStateChanged.mockClear();

        harness.mediaElement.onplay?.(new Event('play'));

        await vi.waitFor(() => {
            expect(harness.controller.isPlaying()).toBe(true);
            expect(harness.controller.isPaused()).toBe(false);
            expect(harness.playbackStateChanged).toHaveBeenCalledOnce();
            expect(harness.playbackStateChanged).toHaveBeenCalledWith(true);
        });
    });

    it('应用主动操作与媒体元素事件同时发生时只通知一次', async () => {
        const harness = createHarness();
        controllers.push(harness.controller);
        harness.mediaElement.play = vi.fn(async () => {
            harness.mediaElement.onplay?.(new Event('play'));
        });
        harness.mediaElement.pause = vi.fn(() => {
            harness.mediaElement.onpause?.(new Event('pause'));
        });

        await harness.controller.play();
        expect(harness.playbackStateChanged).toHaveBeenCalledTimes(1);
        expect(harness.playbackStateChanged).toHaveBeenLastCalledWith(true);

        await harness.controller.pause();
        expect(harness.playbackStateChanged).toHaveBeenCalledTimes(2);
        expect(harness.playbackStateChanged).toHaveBeenLastCalledWith(false);
    });
});
