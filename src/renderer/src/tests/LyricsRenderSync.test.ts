import {describe, expect, it, vi} from 'vitest';
import {LyricsRenderController} from '../ui/widgets/lyrics/LyricsRenderController';

describe('LyricsRenderController 初始位置同步', () => {
    it('首次同步当前歌词时允许立即滚动', () => {
        const line = {
            classList: {add: vi.fn(), remove: vi.fn()},
            querySelectorAll: vi.fn(() => [])
        } as unknown as HTMLElement;
        const lyricsDisplay = {
            querySelector: vi.fn(() => line)
        } as unknown as HTMLElement;
        const controller = new LyricsRenderController({
            lyricsDisplay,
            isVisible: () => true,
            seek: vi.fn()
        });
        const internals = controller as unknown as {
            scrollLineIntoView: (target: HTMLElement, behavior: 'instant' | 'smooth') => void;
        };
        internals.scrollLineIntoView = vi.fn();
        controller.setLyrics([
            {time: 0, content: '第一行', type: 'line'},
            {time: 10, content: '当前行', type: 'line'}
        ]);

        controller.handlePlaybackPositionChanged(15, {
            forceScroll: true,
            behavior: 'instant'
        });

        expect(line.classList.add).toHaveBeenCalledWith('highlight');
        expect(internals.scrollLineIntoView).toHaveBeenCalledWith(line, 'instant');
    });
});
