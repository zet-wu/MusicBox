import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';

const virtualizerState = vi.hoisted(() => ({
    instances: [] as any[]
}));

vi.mock('@tanstack/virtual-core', () => ({
    elementScroll: vi.fn(),
    observeElementOffset: vi.fn(),
    observeElementRect: vi.fn(),
    Virtualizer: class {
        options: any;
        dispose = vi.fn();
        _didMount = vi.fn(() => this.dispose);
        _willUpdate = vi.fn();
        getVirtualItems = vi.fn(() => [{key: 'row-0', index: 0, start: 0, end: 40, size: 40, lane: 0}]);
        getTotalSize = vi.fn(() => 40);
        measureElement = vi.fn();
        measure = vi.fn();
        scrollToOffset = vi.fn();
        scrollToIndex = vi.fn();

        constructor(options: any) {
            this.options = options;
            virtualizerState.instances.push(this);
        }
    }
}));

import {ElementVirtualizer} from '../ui/virtualization/ElementVirtualizer';

describe('ElementVirtualizer', () => {
    let frameCallbacks: Map<number, FrameRequestCallback>;
    let nextFrameId: number;

    beforeEach(() => {
        virtualizerState.instances.length = 0;
        frameCallbacks = new Map();
        nextFrameId = 1;
        vi.stubGlobal('requestAnimationFrame', vi.fn((callback: FrameRequestCallback) => {
            const frameId = nextFrameId++;
            frameCallbacks.set(frameId, callback);
            return frameId;
        }));
        vi.stubGlobal('cancelAnimationFrame', vi.fn((frameId: number) => {
            frameCallbacks.delete(frameId);
        }));
    });

    afterEach(() => {
        vi.restoreAllMocks();
        vi.unstubAllGlobals();
    });

    function createVirtualizer(onChange = vi.fn()) {
        return {
            onChange,
            adapter: new ElementVirtualizer({
                count: 1,
                estimateSize: () => 40,
                getItemKey: (index) => `row-${index}`,
                getScrollElement: () => null,
                scrollMargin: 0,
                onChange
            })
        };
    }

    it('重复 mount 只创建一次订阅且首轮渲染后 ready', async () => {
        const {adapter, onChange} = createVirtualizer();
        const core = virtualizerState.instances[0];

        adapter.mount();
        adapter.mount();
        await adapter.whenReady();

        expect(core._didMount).toHaveBeenCalledOnce();
        expect(core._willUpdate).toHaveBeenCalledOnce();
        expect(onChange).toHaveBeenCalledOnce();
    });

    it('destroy 取消旧帧和订阅，旧回调不再渲染', () => {
        const {adapter, onChange} = createVirtualizer();
        const core = virtualizerState.instances[0];
        adapter.mount();
        core.options.onChange();
        const [[frameId, callback]] = [...frameCallbacks.entries()];

        adapter.destroy();
        callback(0);

        expect(cancelAnimationFrame).toHaveBeenCalledWith(frameId);
        expect(core.dispose).toHaveBeenCalledOnce();
        expect(onChange).toHaveBeenCalledOnce();
    });

    it('转发测量与滚动能力', () => {
        const {adapter} = createVirtualizer();
        const core = virtualizerState.instances[0];
        const element = {} as HTMLElement;

        adapter.measureElement(element);
        adapter.measure();
        adapter.scrollToOffset(120, {align: 'start'});
        adapter.scrollToIndex(7, {align: 'center', behavior: 'smooth'});

        expect(core.measureElement).toHaveBeenCalledWith(element);
        expect(core.measure).toHaveBeenCalledOnce();
        expect(core.scrollToOffset).toHaveBeenCalledWith(120, {align: 'start'});
        expect(core.scrollToIndex).toHaveBeenCalledWith(7, {align: 'center', behavior: 'smooth'});
    });

    it('销毁后可重新挂载并获得新的 ready 周期', async () => {
        const {adapter} = createVirtualizer();
        const core = virtualizerState.instances[0];
        adapter.mount();
        await adapter.whenReady();
        adapter.destroy();

        adapter.mount();
        await adapter.whenReady();

        expect(core._didMount).toHaveBeenCalledTimes(2);
        expect(core._willUpdate).toHaveBeenCalledTimes(2);
        expect(core.dispose).toHaveBeenCalledOnce();
    });
});
