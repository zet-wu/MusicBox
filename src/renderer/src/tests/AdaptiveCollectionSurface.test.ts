import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';

const virtualizerState = vi.hoisted(() => ({
    instances: [] as any[]
}));

vi.mock('../ui/virtualization/ElementVirtualizer', () => ({
    ElementVirtualizer: class {
        destroy = vi.fn();
        measureElement = vi.fn();
        scrollToOffset = vi.fn();
        scrollToIndex = vi.fn();
        getOffsetForIndex = vi.fn((index: number) => index * this.options.estimateSize(index));

        constructor(public options: any) {
            virtualizerState.instances.push(this);
        }

        mount(): void {
            const count = Math.min(this.options.count, 2);
            const size = this.options.estimateSize(0);
            this.options.onChange(Array.from({length: count}, (_, index) => ({
                key: this.options.getItemKey(index),
                index,
                start: index * size,
                end: (index + 1) * size,
                size,
                lane: 0
            })), this.options.count * size);
        }

        whenReady(): Promise<void> {
            return Promise.resolve();
        }
    }
}));

import {AdaptiveCollectionSurface} from '../ui/collections/AdaptiveCollectionSurface';
import {
    COLLECTION_GRID_OVERSCAN,
    COLLECTION_LIST_OVERSCAN,
    COLLECTION_VIRTUALIZATION_THRESHOLD
} from '../ui/collections/types';

class FakeClassList {
    constructor(private readonly element: FakeElement) {}

    add(...classes: string[]): void {
        const values = new Set(this.element.className.split(/\s+/).filter(Boolean));
        classes.forEach(value => values.add(value));
        this.element.className = [...values].join(' ');
    }
}

class FakeFragment {
    children: FakeElement[] = [];

    appendChild(element: FakeElement): FakeElement {
        this.children.push(element);
        return element;
    }

    get firstElementChild(): FakeElement | null {
        return this.children[0] || null;
    }
}

let fakeDocument: FakeDocument;

class FakeElement extends EventTarget {
    children: FakeElement[] = [];
    parentElement: FakeElement | null = null;
    className = '';
    readonly classList = new FakeClassList(this);
    dataset: Record<string, string | undefined> = {};
    style: Record<string, string> = {};
    attributes = new Map<string, string>();
    clientWidth = 600;
    scrollTop = 0;
    markup = '';

    constructor(readonly tagName = 'div') {
        super();
    }

    appendChild(child: FakeElement | FakeFragment): FakeElement | FakeFragment {
        if (child instanceof FakeFragment) {
            [...child.children].forEach(element => this.appendChild(element));
            child.children = [];
            return child;
        }
        child.parentElement = this;
        this.children.push(child);
        return child;
    }

    replaceChildren(...children: Array<FakeElement | FakeFragment>): void {
        this.children.forEach(child => child.parentElement = null);
        this.children = [];
        children.forEach(child => this.appendChild(child));
    }

    replaceWith(replacement: FakeElement): void {
        if (!this.parentElement) return;
        const index = this.parentElement.children.indexOf(this);
        if (index < 0) return;
        replacement.parentElement = this.parentElement;
        this.parentElement.children[index] = replacement;
        this.parentElement = null;
    }

    setAttribute(name: string, value: string): void {
        this.attributes.set(name, value);
    }

    querySelectorAll<T extends FakeElement = FakeElement>(selector: string): T[] {
        const matches: FakeElement[] = [];
        const visit = (element: FakeElement) => {
            const isMatch = selector === '[data-collection-key]'
                ? Boolean(element.dataset.collectionKey)
                : selector === '.collection-surface-virtual-row'
                    ? element.className.split(/\s+/).includes('collection-surface-virtual-row')
                    : false;
            if (isMatch) matches.push(element);
            element.children.forEach(visit);
        };
        this.children.forEach(visit);
        return matches as T[];
    }

    closest<T extends FakeElement = FakeElement>(selector: string): T | null {
        let current: FakeElement | null = this;
        while (current) {
            if (selector === '[data-collection-key]' && current.dataset.collectionKey) return current as T;
            if (selector === '.collection-surface-virtual-row'
                && current.className.split(/\s+/).includes('collection-surface-virtual-row')) return current as T;
            current = current.parentElement;
        }
        return null;
    }

    contains(element: FakeElement): boolean {
        return element === this || this.children.some(child => child.contains(element));
    }

    getBoundingClientRect(): DOMRect {
        const top = Number(this.dataset.index || 0) * 40;
        return {top, bottom: top + 40, left: 0, right: 600, width: 600, height: 40, x: 0, y: top, toJSON: () => ({})};
    }

    focus(): void {
        fakeDocument.activeElement = this;
    }
}

class FakeTemplateElement extends FakeElement {
    content = new FakeFragment();

    set innerHTML(markup: string) {
        const element = new FakeElement('div');
        element.markup = markup;
        this.content.children = [element];
    }
}

class FakeDocument {
    readonly body = new FakeElement('body');
    activeElement: FakeElement = this.body;

    createElement(tagName: string): FakeElement {
        return tagName === 'template' ? new FakeTemplateElement() : new FakeElement(tagName);
    }

    createDocumentFragment(): FakeFragment {
        return new FakeFragment();
    }
}

class FakeResizeObserver {
    static instances: FakeResizeObserver[] = [];
    observe = vi.fn();
    disconnect = vi.fn();

    constructor(private readonly callback: ResizeObserverCallback) {
        FakeResizeObserver.instances.push(this);
    }

    trigger(): void {
        this.callback([], this as unknown as ResizeObserver);
    }
}

describe('AdaptiveCollectionSurface', () => {
    let frameCallbacks: Map<number, FrameRequestCallback>;
    let nextFrameId: number;

    beforeEach(() => {
        virtualizerState.instances.length = 0;
        FakeResizeObserver.instances.length = 0;
        fakeDocument = new FakeDocument();
        frameCallbacks = new Map();
        nextFrameId = 1;
        vi.stubGlobal('HTMLElement', FakeElement);
        vi.stubGlobal('document', fakeDocument);
        vi.stubGlobal('ResizeObserver', FakeResizeObserver);
        vi.stubGlobal('requestAnimationFrame', vi.fn((callback: FrameRequestCallback) => {
            const id = nextFrameId++;
            frameCallbacks.set(id, callback);
            return id;
        }));
        vi.stubGlobal('cancelAnimationFrame', vi.fn((id: number) => frameCallbacks.delete(id)));
    });

    afterEach(() => {
        vi.restoreAllMocks();
        vi.unstubAllGlobals();
    });

    function flushFrames(): void {
        const frames = [...frameCallbacks.entries()];
        frameCallbacks.clear();
        frames.forEach(([id, callback]) => callback(id));
    }

    function createSurface(renderItem = vi.fn((item: number) => `<div>${item}</div>`)) {
        const surface = new AdaptiveCollectionSurface<number>({
            getKey: item => item,
            renderItem
        });
        const root = new FakeElement();
        const scroll = new FakeElement();
        surface.mount(root as unknown as HTMLElement, scroll as unknown as HTMLElement);
        return {surface, root, scroll, renderItem};
    }

    it('在 49/50 项边界切换 direct 和 virtual，并固定列表 overscan', () => {
        const {surface} = createSurface();
        const listLayout = {mode: 'list' as const, estimateRowSize: 40};

        surface.update(Array.from({length: COLLECTION_VIRTUALIZATION_THRESHOLD - 1}, (_, index) => index), listLayout);
        expect(surface.getMode()).toBe('direct');
        expect(surface.getRenderedKeys()).toHaveLength(49);

        surface.update(Array.from({length: COLLECTION_VIRTUALIZATION_THRESHOLD}, (_, index) => index), listLayout);
        expect(surface.getMode()).toBe('virtual');
        expect(virtualizerState.instances.at(-1).options.overscan).toBe(COLLECTION_LIST_OVERSCAN);

        surface.update(Array.from({length: 49}, (_, index) => index), listLayout);
        expect(surface.getMode()).toBe('direct');
        flushFrames();
    });

    it('方格按响应式行虚拟化并在列数变化后保持项目锚点', async () => {
        const {surface} = createSurface();
        surface.update(Array.from({length: 50}, (_, index) => index), {
            mode: 'grid',
            estimateRowSize: 100,
            getColumnCount: width => width >= 500 ? 3 : 2
        });
        const firstCore = virtualizerState.instances.at(-1);
        expect(firstCore.options.count).toBe(17);
        expect(firstCore.options.overscan).toBe(COLLECTION_GRID_OVERSCAN);
        expect(surface.getRenderedKeys()).toEqual([0, 1, 2, 3, 4, 5]);

        const body = (surface as any).body as FakeElement;
        body.clientWidth = 400;
        FakeResizeObserver.instances[0].trigger();
        expect(virtualizerState.instances.at(-1).options.count).toBe(25);
        expect(surface.getRenderedKeys()).toEqual([0, 1, 2, 3]);
        flushFrames();
        await Promise.resolve();
        expect(virtualizerState.instances.at(-1).getOffsetForIndex).toHaveBeenCalledWith(0, 'start');
    });

    it('只重绘可见失效项目，离屏项目保持模型更新', () => {
        const renderItem = vi.fn((item: number) => `<div>${item}</div>`);
        const {surface} = createSurface(renderItem);
        surface.update(Array.from({length: 100}, (_, index) => index), {
            mode: 'list',
            estimateRowSize: 40
        });
        expect(renderItem).toHaveBeenCalledTimes(2);

        surface.invalidateItem(0);
        expect(renderItem).toHaveBeenCalledTimes(3);
        surface.invalidateItem(99);
        expect(renderItem).toHaveBeenCalledTimes(3);
    });

    it('suspend/resume 保留稳定 DOM，并在 destroy 时释放观察器和虚拟化器', async () => {
        const {surface, root} = createSurface();
        surface.update(Array.from({length: 50}, (_, index) => index), {
            mode: 'list',
            estimateRowSize: 40
        });
        const shell = root.children[0];
        const core = virtualizerState.instances.at(-1);
        const snapshot = surface.suspend();
        expect(root.children[0]).toBe(shell);
        expect(core.destroy).toHaveBeenCalledOnce();
        expect(FakeResizeObserver.instances[0].disconnect).toHaveBeenCalledOnce();

        const resume = surface.resume(snapshot);
        await Promise.resolve();
        flushFrames();
        await resume;
        const resumedCore = virtualizerState.instances.at(-1);
        surface.destroy();
        expect(resumedCore.destroy).toHaveBeenCalledOnce();
        expect(root.children).toHaveLength(0);
    });
});
