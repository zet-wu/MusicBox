import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import {MainContentScrollCoordinator} from '../app/runtime/MainContentScrollCoordinator';

const serviceMocks = vi.hoisted(() => ({
    getPlaylists: vi.fn(),
    getPlaylistDetail: vi.fn()
}));

vi.mock('../features/library/service/LibraryDataService', () => ({
    libraryDataService: serviceMocks
}));

vi.mock('../features/settings/service', () => ({
    playlistViewModePreferenceService: {
        getMode: vi.fn(() => 'grid'),
        setMode: vi.fn()
    }
}));

class FakeElement extends EventTarget {
    dataset: Record<string, string> = {};
    style = {display: '', setProperty: vi.fn()};
    firstElementChild: FakeElement | null = null;
    textContent = '';
    innerHTML = '';

    querySelector(): FakeElement | null {
        return null;
    }

    querySelectorAll(): FakeElement[] {
        return [];
    }

    closest(): FakeElement {
        return this;
    }

    replaceChildren(...children: FakeElement[]): void {
        this.firstElementChild = children[0] || null;
    }
}

const createPlaylist = (id: string, name: string) => ({
    id,
    name,
    tracks: [],
    duration: 0
});

describe('PlaylistsPage 集合生命周期', () => {
    beforeEach(() => {
        serviceMocks.getPlaylists.mockReset();
        serviceMocks.getPlaylistDetail.mockReset();
        vi.stubGlobal('Element', FakeElement);
        vi.stubGlobal('HTMLElement', FakeElement);
        vi.stubGlobal('document', {
            readyState: 'loading',
            activeElement: null,
            addEventListener: vi.fn(),
            createElement: vi.fn(() => new FakeElement()),
            querySelector: vi.fn(() => null)
        });
    });

    afterEach(() => {
        vi.restoreAllMocks();
        vi.unstubAllGlobals();
    });

    it('搜索基于过滤数据且稳定委托只触发一次选择', async () => {
        const {PlaylistsPage} = await import('../ui/pages/PlaylistsPage');
        const page = new PlaylistsPage(
            new FakeElement() as unknown as HTMLElement,
            new MainContentScrollCoordinator()
        );
        const internals = page as any;
        const selected = createPlaylist('selected', '夜色');
        internals.playlists = [createPlaylist('other', '晨光'), selected];
        internals.searchQuery = '夜';
        internals.applySearchFilter(false);
        internals.container.dataset.playlistId = selected.id;
        const emit = vi.spyOn(page, 'emit');

        page.render();
        page.render();
        internals.container.dispatchEvent(new Event('dblclick'));

        expect(internals.filteredPlaylists).toEqual([selected]);
        expect(emit).toHaveBeenCalledOnce();
        expect(emit).toHaveBeenCalledWith('playlistSelected', selected);
        page.destroy();
    });

    it('异步右键详情返回时丢弃过期请求', async () => {
        const {PlaylistsPage} = await import('../ui/pages/PlaylistsPage');
        const page = new PlaylistsPage(
            new FakeElement() as unknown as HTMLElement,
            new MainContentScrollCoordinator()
        );
        const first = createPlaylist('first', '第一');
        const second = createPlaylist('second', '第二');
        let resolveFirst!: (value: any) => void;
        serviceMocks.getPlaylistDetail
            .mockReturnValueOnce(new Promise(resolve => resolveFirst = resolve))
            .mockResolvedValueOnce({success: true, tracks: ['new']});
        (page as any).isVisible = true;
        const emit = vi.spyOn(page, 'emit');

        const stale = (page as any).showPlaylistContextMenu(first, 1, 2);
        await (page as any).showPlaylistContextMenu(second, 3, 4);
        resolveFirst({success: true, tracks: ['stale']});
        await stale;

        expect(emit).toHaveBeenCalledOnce();
        expect(emit).toHaveBeenCalledWith('playlistCollectionRightClick', second, ['new'], 3, 4);
        page.destroy();
    });
});
