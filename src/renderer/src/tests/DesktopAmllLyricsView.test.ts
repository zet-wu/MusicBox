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
        const player = {
            currentLyricGroups: [{element: groupElement, isActive: true}],
            getElement: vi.fn(() => fakeElement()),
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
            container: fakeElement(),
            createPlayer: () => player
        });
        const lines = [{
            words: [{word: '歌词', startTime: 1000, endTime: 2000, romanWord: 'geci'}],
            translatedLyric: 'lyrics', romanLyric: 'geci', isBG: false, isDuet: true,
            startTime: 1000, endTime: 2000
        }];

        view.updateLyrics(lines);
        view.updatePosition(1.5);
        view.setPlaying(true);
        view.setPlaying(false);

        expect(player.setLyricLines).toHaveBeenCalledWith([expect.objectContaining({
            translatedLyric: '', romanLyric: '', isDuet: false,
            words: [{word: '歌词', startTime: 1000, endTime: 2000}]
        })], 0);
        expect(player.setCurrentTime).toHaveBeenCalledWith(1500);
        expect(player.resume).toHaveBeenCalledOnce();
        expect(player.pause).toHaveBeenCalledTimes(2);
        expect(cancelAnimationFrame).toHaveBeenCalledWith(1);
        expect(groupElement.dataset.desktopActive).toBe('true');
    });
});
