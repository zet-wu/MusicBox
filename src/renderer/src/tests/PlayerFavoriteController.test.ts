import {beforeEach, describe, expect, it, vi} from 'vitest';

const favoriteServiceMock = vi.hoisted(() => ({
    isFavorite: vi.fn(() => false),
    toggle: vi.fn(async () => ({success: true, favorite: true})),
    onChanged: vi.fn(() => () => undefined)
}));

vi.mock('../features/library/service/FavoriteService', () => ({
    favoriteService: favoriteServiceMock
}));

vi.mock('../features/appShell/service', () => ({
    appNotificationService: {
        showError: vi.fn()
    }
}));

import {PlayerFavoriteController} from '../ui/widgets/player/PlayerFavoriteController';
import type {Track} from '../api/types/track';

function createButton() {
    const classes = new Set<string>();
    return {
        disabled: false,
        title: '',
        classList: {
            toggle(name: string, enabled: boolean) {
                if (enabled) classes.add(name);
                else classes.delete(name);
            }
        },
        setAttribute: vi.fn(),
        classes
    };
}

describe('PlayerFavoriteController', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        favoriteServiceMock.isFavorite.mockReturnValue(false);
        favoriteServiceMock.toggle.mockResolvedValue({success: true, favorite: true});
    });

    it('点击时使用最近一次更新的当前歌曲', async () => {
        const button = createButton();
        let clickHandler: EventListenerOrEventListenerObject | null = null;
        const controller = new PlayerFavoriteController({
            button: button as unknown as HTMLButtonElement,
            addDomListener: (_element, event, handler) => {
                if (event === 'click') clickHandler = handler;
            }
        });
        const track: Track = {
            fileId: 'track-1',
            filePath: 'C:\\Music\\track-1.flac',
            title: '歌曲',
            artist: '艺术家'
        };

        controller.bind();
        controller.update(track);
        expect(button.disabled).toBe(false);

        const invokeClick = clickHandler as EventListener | null;
        invokeClick?.(new Event('click'));
        await vi.waitFor(() => {
            expect(favoriteServiceMock.toggle).toHaveBeenCalledWith(track);
        });

        controller.destroy();
    });
});
