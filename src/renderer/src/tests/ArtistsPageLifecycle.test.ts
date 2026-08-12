import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import {MainContentScrollCoordinator} from '../app/runtime/MainContentScrollCoordinator';

vi.mock('../features/library/service/LibraryPageDataService', () => ({
    libraryPageDataService: {
        getArtists: vi.fn(),
        buildArtists: vi.fn(),
        sortArtists: vi.fn()
    }
}));

vi.mock('../features/settings/service', () => ({
    artistViewModePreferenceService: {
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

vi.mock('../ui/virtualization/ElementVirtualizer', () => ({
    ElementVirtualizer: class {
        mount(): void {}
        destroy(): void {}
    }
}));

class FakeElement extends EventTarget {
    className = '';
    classList = {add: vi.fn()};
    dataset: DOMStringMap = {};
    style: Partial<CSSStyleDeclaration> = {};
    firstElementChild: FakeElement | null = null;

    replaceChildren(...children: FakeElement[]): void {
        this.firstElementChild = children[0] || null;
    }

    querySelector(): FakeElement | null {
        return null;
    }

    closest(): FakeElement {
        return this;
    }
}

describe('ArtistsPage 列表事件生命周期', () => {
    beforeEach(() => {
        vi.stubGlobal('Element', FakeElement);
        vi.stubGlobal('HTMLElement', FakeElement);
        vi.stubGlobal('document', {
            readyState: 'loading',
            addEventListener: vi.fn(),
            createElement: vi.fn(() => new FakeElement()),
            querySelector: vi.fn(() => null)
        });
    });

    afterEach(() => {
        vi.restoreAllMocks();
        vi.unstubAllGlobals();
    });

    it('重复挂载虚拟列表后一次点击只进入一次详情并记录一次位置', async () => {
        const {ArtistsPage} = await import('../ui/pages/ArtistsPage');
        const pageRoot = new FakeElement();
        const page = new ArtistsPage(pageRoot as unknown as HTMLElement, new MainContentScrollCoordinator());
        const artist = {
            name: '稳定艺术家',
            tracks: [],
            albums: new Set<string>(),
            cover: null,
            totalDuration: 0
        };
        const internals = page as any;
        internals.filteredArtists = [artist];
        internals.listRoot.dataset.artist = artist.name;
        vi.spyOn(page, 'render').mockImplementation(() => undefined);
        const enterDetail = vi.spyOn(page, 'showArtistDetail');
        const capturePosition = vi.spyOn(internals.artistSurface, 'suspend');

        internals.updateArtistSurface();
        internals.updateArtistSurface();
        internals.updateArtistSurface();
        internals.listRoot.dispatchEvent(new Event('click'));

        expect(enterDetail).toHaveBeenCalledOnce();
        expect(capturePosition).toHaveBeenCalledOnce();
        expect(internals.selectedArtist).toBe(artist);

        page.destroy();
    });

    it('搜索会规范化查询、更新 Surface 并回到结果顶部', async () => {
        const {ArtistsPage} = await import('../ui/pages/ArtistsPage');
        const pageRoot = new FakeElement();
        const scroll = new MainContentScrollCoordinator();
        const scrollToTop = vi.spyOn(scroll, 'scrollToTop');
        const page = new ArtistsPage(pageRoot as unknown as HTMLElement, scroll);
        const target = {
            name: '星河乐队',
            tracks: [],
            albums: new Set<string>(),
            cover: null,
            totalDuration: 0
        };
        const other = {...target, name: '远山歌手'};
        const browser = new FakeElement();
        const surfaceRoot = new FakeElement();
        const noResults = new FakeElement() as FakeElement & {hidden: boolean};
        noResults.hidden = false;
        const mainContent = new FakeElement();
        const internals = page as any;
        internals.artists = [target, other];
        internals.listRoot.querySelector = vi.fn((selector: string) => {
            if (selector === '.artists-browser') return browser;
            if (selector === '.artist-surface-root') return surfaceRoot;
            if (selector === '.artists-no-results') return noResults;
            return null;
        });
        vi.mocked(document.querySelector).mockImplementation((selector: string) => (
            selector === '.main-content' ? mainContent as unknown as Element : null
        ));
        vi.spyOn(internals.artistSurface, 'mount').mockImplementation(() => undefined);
        const update = vi.spyOn(internals.artistSurface, 'update').mockImplementation(() => undefined);

        page.filterArtists('  星河  ');

        expect(internals.filteredArtists).toEqual([target]);
        expect(scrollToTop).toHaveBeenCalledOnce();
        expect(update).toHaveBeenCalledWith([target], expect.objectContaining({mode: 'grid'}));
        expect(noResults.hidden).toBe(true);

        page.destroy();
    });
});
