import {afterEach, describe, expect, it, vi} from 'vitest';
import {MasterDetailViewHost} from '../ui/collections/MasterDetailViewHost';

class FakeElement {
    children: FakeElement[] = [];
    style: Record<string, string> = {};
    className = '';

    replaceChildren(...children: FakeElement[]): void {
        this.children = children;
    }
}

const snapshot = {
    anchorKey: 'artist-a',
    anchorOffset: -12,
    fallbackScrollTop: 240,
    focusedKey: null
};

describe('MasterDetailViewHost', () => {
    afterEach(() => {
        vi.restoreAllMocks();
        vi.unstubAllGlobals();
    });

    function createHost() {
        vi.stubGlobal('document', {createElement: () => new FakeElement()});
        const pageRoot = new FakeElement();
        const scroll = {
            capture: vi.fn(),
            remember: vi.fn(),
            restore: vi.fn().mockResolvedValue(undefined),
            scrollToTop: vi.fn(),
            cancelPendingRestore: vi.fn()
        };
        const surface = {
            captureSnapshot: vi.fn(() => snapshot),
            suspend: vi.fn(() => snapshot),
            resume: vi.fn().mockResolvedValue(undefined),
            whenReady: vi.fn().mockResolvedValue(undefined),
            destroy: vi.fn()
        };
        const host = new MasterDetailViewHost(
            pageRoot as unknown as HTMLElement,
            scroll as never,
            {
                listLocationKey: 'artists/list',
                detailLocationKey: identity => `artists/detail/${identity}`
            }
        );
        host.attachSurface(surface);
        return {host, pageRoot, scroll, surface};
    }

    it('进入详情前暂停列表并保留稳定的两个根节点', () => {
        const {host, pageRoot, scroll, surface} = createHost();
        const [listRoot, detailRoot] = pageRoot.children;

        host.enterDetail('artist-a');

        expect(surface.suspend).toHaveBeenCalledOnce();
        expect(pageRoot.children).toEqual([listRoot, detailRoot]);
        expect(listRoot.style.display).toBe('none');
        expect(detailRoot.style.display).toBe('block');
        expect(host.getLocation()).toEqual({
            kind: 'detail',
            key: 'artists/detail/artist-a',
            identity: 'artist-a'
        });
        expect(scroll.scrollToTop).toHaveBeenCalledOnce();
    });

    it('detail 返回 list 时等待 Surface 恢复原快照', async () => {
        const {host, surface} = createHost();
        host.enterDetail('artist-a');

        await host.returnToList();

        expect(surface.resume).toHaveBeenCalledWith(snapshot);
        expect(host.getLocation()).toEqual({kind: 'list', key: 'artists/list'});
        expect(host.listRoot.style.display).toBe('block');
        expect(host.detailRoot.style.display).toBe('none');
    });

    it('列表像素恢复交给 Coordinator 并验证当前 location', async () => {
        const {host, scroll, surface} = createHost();

        await host.restoreListOffset(360);

        expect(scroll.remember).toHaveBeenCalledWith('artists/list', 360);
        const [, options] = scroll.restore.mock.calls[0];
        expect(options.scrollTop).toBe(360);
        expect(options.isCurrent()).toBe(true);
        await options.whenReady();
        expect(surface.whenReady).toHaveBeenCalledOnce();
    });
});
