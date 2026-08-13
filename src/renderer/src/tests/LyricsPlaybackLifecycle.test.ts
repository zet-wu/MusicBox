import {beforeEach, describe, expect, it, vi} from 'vitest';
import type {PlaybackState, PlaybackStoreListener} from '../features/playback/PlaybackStore';

let listener: PlaybackStoreListener | null = null;
const unsubscribe = vi.fn();

vi.mock('../features/playback/service/PlaybackUiStateService', () => ({
    playbackUiStateService: {
        subscribe: (nextListener: PlaybackStoreListener) => {
            listener = nextListener;
            return unsubscribe;
        }
    }
}));

const state: PlaybackState = {
    currentTrack: null,
    currentIndex: -1,
    playlist: [],
    isPlaying: true,
    position: 12,
    duration: 100,
    volume: 0.5,
    playMode: 'sequence'
};

describe('LyricsPlaybackStateController 生命周期', () => {
    beforeEach(() => {
        listener = null;
        unsubscribe.mockReset();
    });

    it('页面隐藏时忽略播放事件，重新显示后恢复处理', async () => {
        const {LyricsPlaybackStateController} = await import('../ui/widgets/lyrics/LyricsPlaybackStateController');
        let visible = false;
        const onPositionChanged = vi.fn();
        const controller = new LyricsPlaybackStateController({
            isVisible: () => visible,
            onPositionChanged,
            onPlaybackStateChanged: vi.fn(),
            onDurationChanged: vi.fn(),
            onTrackChanged: vi.fn(),
            onVolumeChanged: vi.fn(),
            onPlayModeChanged: vi.fn()
        });
        controller.bind();

        await listener?.(state, {type: 'positionChanged', payload: state.position});
        expect(onPositionChanged).not.toHaveBeenCalled();

        visible = true;
        await listener?.(state, {type: 'positionChanged', payload: state.position});
        expect(onPositionChanged).toHaveBeenCalledWith(12, 100);

        controller.destroy();
        expect(unsubscribe).toHaveBeenCalledOnce();
    });
});
