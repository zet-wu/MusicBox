import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';

function fakeElement() {
    return Object.assign(new EventTarget(), {
        hidden: false,
        textContent: '',
        className: '',
        classList: {add: vi.fn(), remove: vi.fn()},
        append: vi.fn(),
        appendChild: vi.fn(),
        replaceChildren: vi.fn()
    }) as unknown as HTMLElement;
}

describe('AmllLyricsView', () => {
    beforeEach(() => {
        vi.stubGlobal('document', {createElement: vi.fn(() => fakeElement())});
        vi.stubGlobal('MouseEvent', class extends Event {});
        vi.stubGlobal('requestAnimationFrame', vi.fn(() => 1));
        vi.stubGlobal('cancelAnimationFrame', vi.fn());
    });

    afterEach(() => vi.unstubAllGlobals());

    it('使用 AMLL Core 接收文档、毫秒进度并在销毁时释放实例', async () => {
        const {AmllLyricsView} = await import('@/features/lyrics/ui/AmllLyricsView');
        const player = Object.assign(new EventTarget(), {
            getElement: vi.fn(() => fakeElement()),
            setLyricLines: vi.fn(),
            setCurrentTime: vi.fn(),
            pause: vi.fn(),
            resume: vi.fn(),
            update: vi.fn(),
            resetScroll: vi.fn(),
            calcLayout: vi.fn(),
            dispose: vi.fn()
        });
        const container = fakeElement();
        const seek = vi.fn();
        const view = new AmllLyricsView({
            container,
            isVisible: () => true,
            seek,
            createPlayer: () => player
        });
        const lyrics = [{
            words: [{word: '当前行', startTime: 10_000, endTime: 12_000}],
            translatedLyric: '', romanLyric: '', isBG: false, isDuet: false,
            startTime: 10_000, endTime: 12_000
        }];

        view.setDocument({
            ttmlText: '<tt/>',
            ttml: {metadata: {}, lines: []},
            render: {metadata: [], lines: lyrics},
            source: {kind: 'embedded', trackId: 'track'}
        }, 15);
        view.handlePlaybackPositionChanged(16, true);
        container.dispatchEvent(new Event('mouseleave'));

        expect(player.resetScroll).toHaveBeenCalledOnce();
        expect(player.calcLayout).toHaveBeenCalledWith(false, false);
        expect(player.setLyricLines).toHaveBeenCalledTimes(1);
        expect(seek).not.toHaveBeenCalled();

        view.destroy();
        container.dispatchEvent(new Event('mouseleave'));

        expect(player.setLyricLines).toHaveBeenCalledWith(lyrics, 15_000);
        expect(player.setCurrentTime).toHaveBeenCalledWith(16_000, true);
        expect(player.resetScroll).toHaveBeenCalledOnce();
        expect(player.calcLayout).toHaveBeenCalledOnce();
        expect(player.dispose).toHaveBeenCalledOnce();
    });

    it('使用虚拟时间偏移预览且不重建歌词行', async () => {
        const {AmllLyricsView} = await import('@/features/lyrics/ui/AmllLyricsView');
        const player = Object.assign(new EventTarget(), {
            getElement: vi.fn(() => fakeElement()),
            setLyricLines: vi.fn(),
            setCurrentTime: vi.fn(),
            pause: vi.fn(),
            resume: vi.fn(),
            update: vi.fn(),
            resetScroll: vi.fn(),
            calcLayout: vi.fn(),
            dispose: vi.fn()
        });
        const view = new AmllLyricsView({
            container: fakeElement(),
            isVisible: () => true,
            seek: vi.fn(),
            createPlayer: () => player
        });

        view.handlePlaybackPositionChanged(10);
        view.setPlaying(false);
        view.setTimelinePreviewDelta(-100);
        view.handlePlaybackPositionChanged(11);
        view.setTimelinePreviewDelta(100);
        view.clearTimelinePreview();

        expect(player.setCurrentTime).toHaveBeenNthCalledWith(1, 10_000, false);
        expect(player.setCurrentTime).toHaveBeenNthCalledWith(2, 10_000, false);
        expect(player.pause.mock.invocationCallOrder[0])
            .toBeLessThan(player.setCurrentTime.mock.invocationCallOrder[2]);
        expect(player.setCurrentTime).toHaveBeenNthCalledWith(3, 10_100, true);
        expect(player.setCurrentTime).toHaveBeenNthCalledWith(4, 11_100, false);
        expect(player.setCurrentTime).toHaveBeenNthCalledWith(5, 10_900, true);
        expect(player.setCurrentTime).toHaveBeenNthCalledWith(6, 11_000, true);
        expect(player.setLyricLines).not.toHaveBeenCalled();

        view.destroy();
    });
});
