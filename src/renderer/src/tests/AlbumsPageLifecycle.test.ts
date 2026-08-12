import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import {MainContentScrollCoordinator} from '../app/runtime/MainContentScrollCoordinator';

vi.mock('../features/library/service/LibraryPageDataService', () => ({
    libraryPageDataService: {
        buildAlbums: vi.fn(() => []),
        sortAlbums: vi.fn(),
        getAlbums: vi.fn(),
        findCollectionCover: vi.fn()
    }
}));

vi.mock('../features/settings/service', () => ({
    albumGroupingPreferenceService: {
        shouldSplitByArtist: vi.fn(() => true),
        onChanged: vi.fn(() => () => undefined)
    },
    albumViewModePreferenceService: {
        getMode: vi.fn(() => 'grid'),
        setMode: vi.fn()
    },
    trackCoverNetworkPreferenceService: {
        isEnabled: vi.fn(() => false),
        onChanged: vi.fn(() => () => undefined)
    }
}));

vi.mock('../ui/components/TrackCollectionDetail', () => ({
    TrackCollectionDetail: class {
        show(): void {}
        hide(): void {}
        destroy(): void {}
    }
}));

class FakeElement extends EventTarget {
    className = '';
    classList = {add: vi.fn(), remove: vi.fn()};
    dataset: Record<string, string> = {};
    style = {display: '', setProperty: vi.fn()};
    firstElementChild: FakeElement | null = null;

    replaceChildren(...children: FakeElement[]): void {
        this.firstElementChild = children[0] || null;
    }

    querySelector(): FakeElement | null {
        return null;
    }

    querySelectorAll(): FakeElement[] {
        return [];
    }

    closest(): FakeElement {
        return this;
    }
}

const createAlbum = (key: string, name: string, artist: string) => ({
    key,
    name,
    album: name,
    artist,
    year: 2026,
    cover: null,
    tracks: [],
    totalDuration: 0
});

describe('AlbumsPage 集合生命周期', () => {
    beforeEach(() => {
        vi.stubGlobal('Element', FakeElement);
        vi.stubGlobal('HTMLElement', FakeElement);
        vi.stubGlobal('Node', FakeElement);
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

    it('搜索只过滤业务数据，不遍历离屏专辑 DOM', async () => {
        const {AlbumsPage} = await import('../ui/pages/AlbumsPage');
        const page = new AlbumsPage(new FakeElement() as unknown as HTMLElement, new MainContentScrollCoordinator());
        const internals = page as any;
        internals.albums = [
            createAlbum('a', '晨光', '甲'),
            createAlbum('b', '夜色', '乙')
        ];
        internals.searchQuery = '夜';

        internals.applyAlbumFilter(false);

        expect(internals.filteredAlbums.map((album: {key: string}) => album.key)).toEqual(['b']);
        page.destroy();
    });

    it('重复列表刷新后一次双击只进入一次详情', async () => {
        const {AlbumsPage} = await import('../ui/pages/AlbumsPage');
        const page = new AlbumsPage(new FakeElement() as unknown as HTMLElement, new MainContentScrollCoordinator());
        const internals = page as any;
        const album = createAlbum('album-key', '专辑', '艺术家');
        internals.filteredAlbums = [album];
        internals.listRoot.dataset.albumKey = album.key;
        const enterDetail = vi.spyOn(page, 'animateToDetail').mockImplementation(() => undefined);

        page.setupListEventListeners();
        page.setupListEventListeners();
        internals.listRoot.dispatchEvent(new Event('dblclick'));

        expect(enterDetail).toHaveBeenCalledOnce();
        page.destroy();
    });
});
