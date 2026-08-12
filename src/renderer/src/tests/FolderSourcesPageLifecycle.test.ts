import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import {MainContentScrollCoordinator} from '../app/runtime/MainContentScrollCoordinator';

const sourceMocks = vi.hoisted(() => ({
    onSourcesUpdated: vi.fn(() => () => undefined),
    getDirectories: vi.fn(),
    getTracks: vi.fn(),
    addDirectories: vi.fn(),
    open: vi.fn(),
    rescan: vi.fn(),
    remove: vi.fn()
}));

vi.mock('../features/library/service', () => ({
    librarySourceManagementService: sourceMocks
}));

vi.mock('../features/settings/service', () => ({
    folderSourceViewModePreferenceService: {
        getMode: vi.fn(() => 'grid'),
        setMode: vi.fn()
    }
}));

vi.mock('../ui/components/TrackCollectionDetail', () => ({
    TrackCollectionDetail: class {
        show = vi.fn();
        hide = vi.fn();
        destroy = vi.fn();
    }
}));

class FakeElement extends EventTarget {
    className = '';
    classList = {add: vi.fn()};
    style = {display: '', setProperty: vi.fn()};
    firstElementChild: FakeElement | null = null;
    innerHTML = '';
    textContent = '';

    replaceChildren(...children: FakeElement[]): void {
        this.firstElementChild = children[0] || null;
    }

    querySelector(): FakeElement | null {
        return null;
    }

    querySelectorAll(): FakeElement[] {
        return [];
    }
}

const source = {
    id: 'source-1',
    path: 'C:/Music/夜色',
    trackCount: 1,
    bindings: [],
    lastScanAt: null
};

describe('FolderSourcesPage 主从生命周期', () => {
    beforeEach(() => {
        sourceMocks.getTracks.mockReset().mockResolvedValue([]);
        vi.stubGlobal('Element', FakeElement);
        vi.stubGlobal('HTMLElement', FakeElement);
        vi.stubGlobal('document', {
            readyState: 'loading',
            activeElement: null,
            body: new FakeElement(),
            addEventListener: vi.fn(),
            removeEventListener: vi.fn(),
            createElement: vi.fn(() => new FakeElement()),
            querySelector: vi.fn(() => null)
        });
        vi.stubGlobal('window', new EventTarget());
    });

    afterEach(() => {
        vi.restoreAllMocks();
        vi.unstubAllGlobals();
    });

    it('搜索只更新过滤后的来源数据', async () => {
        const {FolderSourcesPage} = await import('../ui/pages/FolderSourcesPage');
        const page = new FolderSourcesPage(
            new FakeElement() as unknown as HTMLElement,
            new MainContentScrollCoordinator()
        );
        const internals = page as any;
        internals.directories = [source, {...source, id: 'source-2', path: 'C:/Music/晨光'}];
        internals.searchQuery = '夜色';

        internals.applySearchFilter(false);

        expect(internals.filteredDirectories).toEqual([source]);
        page.destroy();
    });

    it('详情加载态只写 detailRoot 并保留列表 DOM', async () => {
        const {FolderSourcesPage} = await import('../ui/pages/FolderSourcesPage');
        const page = new FolderSourcesPage(
            new FakeElement() as unknown as HTMLElement,
            new MainContentScrollCoordinator()
        );
        const internals = page as any;
        internals.isVisible = true;
        internals.listRoot.innerHTML = '<div>稳定列表</div>';

        await internals.showSourceDetail(source);

        expect(internals.listRoot.innerHTML).toBe('<div>稳定列表</div>');
        expect(internals.detailRoot.innerHTML).toContain('folder-source-detail-loading');
        expect(internals.masterDetailHost.getLocation().kind).toBe('detail');
        page.destroy();
    });
});
