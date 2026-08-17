import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';

function fakeElement() {
    return {
        hidden: false,
        textContent: '',
        className: '',
        dataset: {},
        replaceChildren: vi.fn()
    } as unknown as HTMLElement;
}

describe('DesktopAmllLyricsView', () => {
    beforeEach(() => {
        vi.stubGlobal('document', {createElement: vi.fn(() => fakeElement())});
        vi.stubGlobal('MouseEvent', class extends Event {});
        vi.stubGlobal('requestAnimationFrame', vi.fn(() => 1));
        vi.stubGlobal('cancelAnimationFrame', vi.fn());
    });

    afterEach(() => vi.unstubAllGlobals());

    it('将投影歌词、播放位置与播放状态交给 AMLL', async () => {
        const {DesktopAmllLyricsView} = await import('@/features/desktopLyrics/DesktopAmllLyricsView');
        const groupElement = fakeElement();
        const playerElement = fakeElement();
        const container = fakeElement();
        const player = {
            currentLyricGroups: [{element: groupElement, isActive: true}],
            getElement: vi.fn(() => playerElement),
            setLyricLines: vi.fn(),
            setCurrentTime: vi.fn(),
            pause: vi.fn(),
            resume: vi.fn(),
            update: vi.fn(),
            dispose: vi.fn(),
            setEnableBlur: vi.fn(),
            setEnableScale: vi.fn(),
            setAlignPosition: vi.fn()
        };
        const view = new DesktopAmllLyricsView({
            container,
            createPlayer: () => player
        });
        const stateElement = vi.mocked(container.replaceChildren).mock.calls[0][1] as HTMLElement;
        const lines = [{
            words: [{word: '歌词', startTime: 1000, endTime: 2000, romanWord: 'geci'}],
            translatedLyric: 'lyrics', romanLyric: 'geci', isBG: false, isDuet: true,
            startTime: 1000, endTime: 2000
        }];

        view.updateLyrics(lines);
        view.updatePosition(1.5);
        view.updateTimelinePreview(-100);
        view.updatePosition(2);
        view.updateTimelinePreview(100);
        view.updateTimelinePreview(0);
        view.setPlaying(true);
        view.setPlaying(false);

        expect(player.setLyricLines).toHaveBeenCalledWith([expect.objectContaining({
            translatedLyric: '', romanLyric: '', isDuet: false,
            words: [{word: '歌词', startTime: 1000, endTime: 2000}]
        })], 0);
        expect(stateElement.hidden).toBe(true);
        expect(playerElement.hidden).toBe(false);
        expect(player.setCurrentTime).toHaveBeenCalledWith(1500, false);
        expect(player.setCurrentTime).toHaveBeenCalledWith(1600, true);
        expect(player.setCurrentTime).toHaveBeenCalledWith(2100, false);
        expect(player.setCurrentTime).toHaveBeenCalledWith(1900, true);
        expect(player.setCurrentTime).toHaveBeenCalledWith(2000, true);
        expect(player.setLyricLines).toHaveBeenCalledTimes(1);
        expect(player.resume).toHaveBeenCalledOnce();
        expect(player.pause).toHaveBeenCalledTimes(2);
        expect(cancelAnimationFrame).toHaveBeenCalledWith(1);
        expect(groupElement.dataset.desktopActive).toBe('true');

        view.reset();
        view.updatePosition(3);
        expect(player.setCurrentTime).toHaveBeenLastCalledWith(3000, false);
    });
});
