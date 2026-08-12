import {
    elementScroll,
    observeElementOffset,
    observeElementRect,
    Virtualizer,
    type ScrollToOptions,
    type VirtualItem
} from '@tanstack/virtual-core';

interface ElementVirtualizerOptions {
    count: number;
    estimateSize: (index: number) => number;
    getItemKey: (index: number) => string | number;
    getScrollElement: () => HTMLElement | null;
    scrollMargin: number;
    overscan?: number;
    onChange: (items: VirtualItem[], totalSize: number) => void;
}

/**
 * 将 TanStack Virtual 的无框架核心封装为原生 DOM 可用的轻量适配器。
 */
export class ElementVirtualizer {
    private readonly options: ElementVirtualizerOptions;
    private readonly virtualizer: Virtualizer<HTMLElement, HTMLElement>;
    private disposeMount: (() => void) | null = null;
    private renderFrame: number | null = null;
    private lastRenderSignature: string | null = null;
    private isMounted = false;
    private mountCount = 0;
    private readyPromise!: Promise<void>;
    private resolveReady: (() => void) | null = null;

    constructor(options: ElementVirtualizerOptions) {
        this.options = options;
        this.virtualizer = new Virtualizer<HTMLElement, HTMLElement>(this.createOptions());
        this.resetReadyPromise();
    }

    mount(): void {
        if (this.isMounted) {
            return;
        }

        if (this.mountCount > 0) {
            this.resetReadyPromise();
        }
        this.mountCount++;
        this.isMounted = true;
        this.disposeMount = this.virtualizer._didMount();
        this.virtualizer._willUpdate();
        this.renderNow();
    }

    measureElement(element: HTMLElement): void {
        this.virtualizer.measureElement(element);
    }

    measure(): void {
        this.virtualizer.measure();
        if (this.isMounted) {
            this.scheduleRender();
        }
    }

    scrollToOffset(offset: number, options?: ScrollToOptions): void {
        this.virtualizer.scrollToOffset(offset, options);
    }

    scrollToIndex(index: number, options?: ScrollToOptions): void {
        this.virtualizer.scrollToIndex(index, options);
    }

    whenReady(): Promise<void> {
        return this.readyPromise;
    }

    destroy(): void {
        if (!this.isMounted && !this.disposeMount && this.renderFrame === null) {
            return;
        }

        this.isMounted = false;
        if (this.renderFrame !== null) {
            cancelAnimationFrame(this.renderFrame);
            this.renderFrame = null;
        }

        this.disposeMount?.();
        this.disposeMount = null;
        this.lastRenderSignature = null;
        this.resolveReady?.();
        this.resolveReady = null;
    }

    private createOptions() {
        return {
            count: this.options.count,
            estimateSize: this.options.estimateSize,
            getItemKey: this.options.getItemKey,
            getScrollElement: this.options.getScrollElement,
            scrollMargin: this.options.scrollMargin,
            overscan: this.options.overscan ?? 8,
            observeElementRect,
            observeElementOffset,
            scrollToFn: elementScroll,
            onChange: () => this.scheduleRender()
        };
    }

    private scheduleRender(): void {
        if (!this.isMounted || this.renderFrame !== null) {
            return;
        }

        this.renderFrame = requestAnimationFrame(() => {
            this.renderFrame = null;
            if (!this.isMounted) {
                return;
            }
            this.renderNow();
        });
    }

    private renderNow(): void {
        if (!this.isMounted) {
            return;
        }
        const items = this.virtualizer.getVirtualItems();
        const totalSize = this.virtualizer.getTotalSize();
        const signature = `${totalSize}|${items.map((item) => (
            `${String(item.key)}:${item.index}:${item.start}:${item.size}`
        )).join('|')}`;
        if (signature === this.lastRenderSignature) {
            return;
        }
        this.lastRenderSignature = signature;
        this.options.onChange(
            items,
            totalSize
        );
        this.resolveReady?.();
        this.resolveReady = null;
    }

    private resetReadyPromise(): void {
        this.readyPromise = new Promise<void>((resolve) => {
            this.resolveReady = resolve;
        });
    }
}
