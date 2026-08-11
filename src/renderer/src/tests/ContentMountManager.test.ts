import {afterEach, describe, expect, it, vi} from 'vitest';
import {ContentMountManager} from '../app/runtime/components/ContentMountManager';

class FakeClassList {
    private readonly values = new Set<string>();

    toggle(value: string, enabled: boolean): void {
        enabled ? this.values.add(value) : this.values.delete(value);
    }

    remove(value: string): void {
        this.values.delete(value);
    }

    contains(value: string): boolean {
        return this.values.has(value);
    }
}

class FakeElement {
    readonly children: FakeElement[] = [];
    readonly dataset: Record<string, string> = {};
    readonly style: Record<string, string> = {};
    readonly classList = new FakeClassList();
    className = '';
    innerHTML = '';
    isConnected = true;
    private parent: FakeElement | null = null;

    appendChild(child: FakeElement): FakeElement {
        child.parent = this;
        child.isConnected = true;
        this.children.push(child);
        return child;
    }

    remove(): void {
        if (this.parent) {
            const index = this.parent.children.indexOf(this);
            if (index >= 0) this.parent.children.splice(index, 1);
        }
        this.parent = null;
        this.isConnected = false;
    }
}

describe('ContentMountManager', () => {
    afterEach(() => {
        vi.unstubAllGlobals();
    });

    it('为不同页面保留独立且稳定的挂载根', () => {
        const contentArea = new FakeElement();
        vi.stubGlobal('document', {
            createElement: () => new FakeElement(),
            querySelector: () => contentArea
        });
        const manager = new ContentMountManager();

        const home = manager.acquire('home-page');
        const artists = manager.acquire('artists');

        expect(manager.acquire('home-page')).toBe(home);
        expect(artists).not.toBe(home);
        expect(contentArea.children).toHaveLength(2);
    });

    it('激活页面会隐藏其他页面和 Shell 层', () => {
        const contentArea = new FakeElement();
        vi.stubGlobal('document', {
            createElement: () => new FakeElement(),
            querySelector: () => contentArea
        });
        const manager = new ContentMountManager();
        const home = manager.acquire('home-page') as unknown as FakeElement;
        const albums = manager.acquire('albums') as unknown as FakeElement;
        const shell = manager.showShell('<p>loading</p>', true) as unknown as FakeElement;

        manager.activate('albums');

        expect(home.style.display).toBe('none');
        expect(albums.style.display).toBe('block');
        expect(shell.style.display).toBe('none');
        expect(shell.classList.contains('is-overlay')).toBe(false);
    });
});
