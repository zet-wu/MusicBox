import {ElementVirtualizer} from '@ui/virtualization/ElementVirtualizer';
import type {VirtualItem} from '@tanstack/virtual-core';
import {
    COLLECTION_GRID_OVERSCAN,
    COLLECTION_LIST_OVERSCAN,
    COLLECTION_VIRTUALIZATION_THRESHOLD,
    type CollectionItemKey,
    type CollectionLayout,
    type CollectionSurfaceMode,
    type CollectionSurfaceOptions,
    type CollectionSurfaceRenderer,
    type CollectionSurfaceSnapshot
} from './types';

/**
 * 在完整渲染和虚拟渲染之间自适应切换的集合列表表面。
 */
export class AdaptiveCollectionSurface<T> {
    private root: HTMLElement | null = null;
    private scrollElement: HTMLElement | null = null;
    private shell: HTMLElement | null = null;
    private body: HTMLElement | null = null;
    private resizeObserver: ResizeObserver | null = null;
    private virtualizer: ElementVirtualizer | null = null;
    private items: T[] = [];
    private itemIndexByKey = new Map<CollectionItemKey, number>();
    private keyByAttribute = new Map<string, CollectionItemKey>();
    private layout: CollectionLayout | null = null;
    private mode: CollectionSurfaceMode = 'direct';
    private columns = 1;
    private suspended = false;
    private renderGeneration = 0;
    private readyPromise: Promise<void> = Promise.resolve();
    private resolveReady: (() => void) | null = null;
    private readyFrame: number | null = null;
    private renderedKeys: CollectionItemKey[] = [];
    private pendingFocusedKey: CollectionItemKey | null = null;

    constructor(
        private readonly renderer: CollectionSurfaceRenderer<T>,
        private readonly options: CollectionSurfaceOptions = {}
    ) {}

    mount(root: HTMLElement, scrollElement: HTMLElement): void {
        if (this.root === root && this.scrollElement === scrollElement && this.shell && this.body) {
            return;
        }
        if (this.root) {
            this.destroy();
        }

        this.root = root;
        this.scrollElement = scrollElement;
        this.suspended = false;
        this.shell = document.createElement('div');
        this.shell.className = 'adaptive-collection-surface';
        this.body = document.createElement('div');
        this.body.className = 'adaptive-collection-body';
        this.shell.appendChild(this.body);
        this.root.replaceChildren(this.shell);
        this.resizeObserver = new ResizeObserver(() => this.handleResize());
        this.resizeObserver.observe(this.body);
        this.renderCurrent();
    }

    update(items: readonly T[], layout: CollectionLayout, virtualizationCount = items.length): void {
        const snapshot = this.root && !this.suspended ? this.captureSnapshot() : null;
        this.items = [...items];
        this.layout = layout;
        this.rebuildKeyIndexes();
        this.columns = this.resolveColumnCount();
        this.mode = virtualizationCount >= COLLECTION_VIRTUALIZATION_THRESHOLD ? 'virtual' : 'direct';
        if (this.root && !this.suspended) {
            this.renderCurrent();
            if (snapshot) {
                void this.restoreSnapshot(snapshot, this.renderGeneration);
            }
        }
    }

    captureSnapshot(): CollectionSurfaceSnapshot {
        const fallbackScrollTop = Math.max(0, this.scrollElement?.scrollTop ?? 0);
        const renderedItems = this.getRenderedItemElements();
        const scrollRect = this.scrollElement?.getBoundingClientRect();
        let anchorElement: HTMLElement | null = null;
        if (scrollRect) {
            anchorElement = renderedItems.find((element) => element.getBoundingClientRect().bottom > scrollRect.top) || null;
        }
        anchorElement ||= renderedItems[0] || null;
        const anchorKey = this.getElementKey(anchorElement);
        const anchorOffset = anchorElement && scrollRect
            ? anchorElement.getBoundingClientRect().top - scrollRect.top
            : 0;
        const activeElement = document.activeElement instanceof HTMLElement ? document.activeElement : null;
        const focusedItem = activeElement && this.root?.contains(activeElement)
            ? activeElement.closest<HTMLElement>('[data-collection-key]')
            : null;

        return {
            anchorKey,
            anchorOffset,
            fallbackScrollTop,
            focusedKey: this.getElementKey(focusedItem)
        };
    }

    suspend(): CollectionSurfaceSnapshot {
        const snapshot = this.captureSnapshot();
        this.suspended = true;
        this.cancelReadyFrame();
        this.resolveReady?.();
        this.resolveReady = null;
        this.virtualizer?.destroy();
        this.virtualizer = null;
        this.resizeObserver?.disconnect();
        return snapshot;
    }

    async resume(snapshot: CollectionSurfaceSnapshot): Promise<void> {
        if (!this.root || !this.body || !this.scrollElement) {
            return;
        }
        this.suspended = false;
        this.resizeObserver?.observe(this.body);
        this.renderCurrent();
        await this.restoreSnapshot(snapshot, this.renderGeneration);
    }

    invalidateItem(key: CollectionItemKey): void {
        const index = this.itemIndexByKey.get(key);
        if (index === undefined || !this.body) {
            return;
        }
        const current = this.findRenderedItemElement(key);
        if (!current) {
            return;
        }

        const activeElement = document.activeElement instanceof HTMLElement ? document.activeElement : null;
        const hadFocus = Boolean(activeElement && current.contains(activeElement));
        const replacement = this.createItemElement(this.items[index], index);
        if (this.mode === 'virtual' && this.layout?.mode === 'list') {
            replacement.classList.add('collection-surface-virtual-row');
            replacement.dataset.index = current.dataset.index;
            Object.assign(replacement.style, {
                position: current.style.position,
                top: current.style.top,
                width: current.style.width,
                transform: current.style.transform
            });
        }
        current.replaceWith(replacement);
        if (this.mode === 'virtual' && this.layout?.mode === 'list') {
            this.virtualizer?.measureElement(replacement);
        } else if (this.mode === 'virtual') {
            const row = replacement.closest<HTMLElement>('.collection-surface-virtual-row');
            if (row) this.virtualizer?.measureElement(row);
        }
        if (hadFocus) {
            replacement.focus({preventScroll: true});
        }
    }

    getRenderedKeys(): CollectionItemKey[] {
        return [...this.renderedKeys];
    }

    getMode(): CollectionSurfaceMode {
        return this.mode;
    }

    whenReady(): Promise<void> {
        return this.readyPromise;
    }

    destroy(): void {
        this.renderGeneration++;
        this.suspended = true;
        this.cancelReadyFrame();
        this.resolveReady?.();
        this.resolveReady = null;
        this.virtualizer?.destroy();
        this.virtualizer = null;
        this.resizeObserver?.disconnect();
        this.resizeObserver = null;
        this.root?.replaceChildren();
        this.root = null;
        this.scrollElement = null;
        this.shell = null;
        this.body = null;
        this.renderedKeys = [];
        this.pendingFocusedKey = null;
        this.options.onRenderedRangeChange?.([]);
    }

    private renderCurrent(): void {
        if (!this.body || !this.layout || this.suspended) {
            return;
        }
        this.renderGeneration++;
        this.beginReadyCycle();
        this.virtualizer?.destroy();
        this.virtualizer = null;
        this.shell?.setAttribute('data-mode', this.mode);
        this.shell?.setAttribute('data-layout', this.layout.mode);
        if (this.mode === 'virtual') {
            this.renderVirtual();
        } else {
            this.renderDirect();
        }
    }

    private renderDirect(): void {
        if (!this.body || !this.layout) return;
        this.body.style.height = '';
        this.body.style.position = '';
        this.applyBodyLayout();
        const fragment = document.createDocumentFragment();
        this.items.forEach((item, index) => fragment.appendChild(this.createItemElement(item, index)));
        this.body.replaceChildren(fragment);
        this.publishRenderedKeys(this.items.map((item) => this.renderer.getKey(item)));
        this.readyFrame = requestAnimationFrame(() => {
            this.readyFrame = null;
            this.markReady();
        });
    }

    private renderVirtual(): void {
        if (!this.body || !this.layout || !this.scrollElement) return;
        this.body.style.display = 'block';
        this.body.style.position = 'relative';
        const rowCount = this.layout.mode === 'grid'
            ? Math.ceil(this.items.length / this.columns)
            : this.items.length;
        const scrollMargin = this.getScrollMargin();
        const layout = this.layout;
        this.virtualizer = new ElementVirtualizer({
            count: rowCount,
            estimateSize: () => layout.estimateRowSize,
            getItemKey: (index) => `collection-row-${index}`,
            getScrollElement: () => this.scrollElement,
            scrollMargin,
            overscan: layout.mode === 'grid' ? COLLECTION_GRID_OVERSCAN : COLLECTION_LIST_OVERSCAN,
            onChange: (items, totalSize) => {
                if (!this.virtualizer || this.suspended) return;
                this.commitVirtualRows(items, totalSize, scrollMargin);
                this.markReady();
            }
        });
        this.virtualizer.mount();
    }

    private commitVirtualRows(items: VirtualItem[], totalSize: number, scrollMargin: number): void {
        if (!this.body || !this.layout) return;
        this.body.style.height = `${totalSize}px`;
        const fragment = document.createDocumentFragment();
        const renderedKeys: CollectionItemKey[] = [];
        items.forEach((virtualItem) => {
            if (this.layout?.mode === 'list') {
                const item = this.items[virtualItem.index];
                if (item === undefined) return;
                const element = this.createItemElement(item, virtualItem.index);
                element.classList.add('collection-surface-virtual-row');
                this.positionVirtualRow(element, virtualItem, scrollMargin);
                fragment.appendChild(element);
                renderedKeys.push(this.renderer.getKey(item));
                return;
            }

            const row = document.createElement('div');
            row.className = 'collection-surface-virtual-row collection-surface-grid-row';
            row.dataset.index = String(virtualItem.index);
            row.style.display = 'grid';
            row.style.gridTemplateColumns = `repeat(${this.columns}, minmax(0, 1fr))`;
            this.positionVirtualRow(row, virtualItem, scrollMargin);
            const start = virtualItem.index * this.columns;
            this.items.slice(start, start + this.columns).forEach((item, offset) => {
                row.appendChild(this.createItemElement(item, start + offset));
                renderedKeys.push(this.renderer.getKey(item));
            });
            fragment.appendChild(row);
        });
        this.body.replaceChildren(fragment);
        this.body.querySelectorAll<HTMLElement>('.collection-surface-virtual-row').forEach((row) => {
            this.virtualizer?.measureElement(row);
        });
        this.publishRenderedKeys(renderedKeys);
        if (this.pendingFocusedKey !== null && this.restoreFocusedKey(this.pendingFocusedKey)) {
            this.pendingFocusedKey = null;
        }
    }

    private createItemElement(item: T, index: number): HTMLElement {
        const template = document.createElement('template');
        template.innerHTML = this.renderer.renderItem(item, index).trim();
        const element = template.content.firstElementChild;
        if (!(element instanceof HTMLElement) || template.content.children.length !== 1) {
            throw new Error('集合项目渲染器必须返回一个根元素');
        }
        const key = this.renderer.getKey(item);
        element.dataset.collectionKey = this.keyToAttribute(key);
        return element;
    }

    private positionVirtualRow(element: HTMLElement, item: VirtualItem, scrollMargin: number): void {
        element.dataset.index = String(item.index);
        element.style.position = 'absolute';
        element.style.top = '0';
        element.style.width = '100%';
        element.style.transform = `translateY(${item.start - scrollMargin}px)`;
    }

    private applyBodyLayout(): void {
        if (!this.body || !this.layout) return;
        if (this.layout.mode === 'grid') {
            this.body.style.display = 'grid';
            this.body.style.gridTemplateColumns = `repeat(${this.columns}, minmax(0, 1fr))`;
        } else {
            this.body.style.display = 'block';
            this.body.style.gridTemplateColumns = '';
        }
    }

    private handleResize(): void {
        if (this.suspended || this.layout?.mode !== 'grid') {
            return;
        }
        const nextColumns = this.resolveColumnCount();
        if (nextColumns === this.columns) {
            return;
        }
        const snapshot = this.captureSnapshot();
        this.columns = nextColumns;
        this.renderCurrent();
        void this.restoreSnapshot(snapshot, this.renderGeneration);
    }

    private resolveColumnCount(): number {
        if (this.layout?.mode !== 'grid') {
            return 1;
        }
        return Math.max(1, Math.floor(this.layout.getColumnCount(this.body?.clientWidth ?? this.root?.clientWidth ?? 0)));
    }

    private async restoreSnapshot(snapshot: CollectionSurfaceSnapshot, generation: number): Promise<void> {
        await this.whenReady();
        if (generation !== this.renderGeneration || this.suspended || !this.scrollElement) {
            return;
        }
        this.pendingFocusedKey = snapshot.focusedKey;
        const anchorKey = snapshot.anchorKey;
        if (anchorKey === null) {
            await this.restoreFallbackOffset(snapshot.fallbackScrollTop);
            this.finishFocusRestore(snapshot.focusedKey);
            return;
        }
        const index = this.itemIndexByKey.get(anchorKey);
        if (index === undefined) {
            await this.restoreFallbackOffset(snapshot.fallbackScrollTop);
            this.finishFocusRestore(snapshot.focusedKey);
            return;
        }

        if (this.mode === 'virtual') {
            const rowIndex = this.layout?.mode === 'grid' ? Math.floor(index / this.columns) : index;
            const rowOffset = this.virtualizer?.getOffsetForIndex(rowIndex, 'start');
            await this.writeScrollOffset(Math.max(0, (rowOffset ?? snapshot.fallbackScrollTop) - snapshot.anchorOffset));
            this.finishFocusRestore(snapshot.focusedKey);
            return;
        }

        const anchor = this.findRenderedItemElement(anchorKey);
        const scrollRect = this.scrollElement.getBoundingClientRect();
        if (anchor) {
            const currentOffset = anchor.getBoundingClientRect().top - scrollRect.top;
            await this.writeScrollOffset(
                this.scrollElement.scrollTop + currentOffset - snapshot.anchorOffset
            );
        } else {
            await this.restoreFallbackOffset(snapshot.fallbackScrollTop);
        }
        this.finishFocusRestore(snapshot.focusedKey);
    }

    private restoreFallbackOffset(offset: number): Promise<void> {
        return this.writeScrollOffset(offset);
    }

    private restoreFocusedKey(key: CollectionItemKey | null): boolean {
        if (key === null || !this.root) return true;
        const activeElement = document.activeElement;
        if (activeElement instanceof HTMLElement && activeElement !== document.body && !this.root.contains(activeElement)) {
            return true;
        }
        const element = this.findRenderedItemElement(key);
        if (!element) return false;
        element.focus({preventScroll: true});
        return true;
    }

    private finishFocusRestore(key: CollectionItemKey | null): void {
        if (this.restoreFocusedKey(key)) {
            this.pendingFocusedKey = null;
        }
    }

    private findRenderedItemElement(key: CollectionItemKey): HTMLElement | null {
        const attribute = this.keyToAttribute(key);
        return this.getRenderedItemElements().find((element) => element.dataset.collectionKey === attribute) || null;
    }

    private getRenderedItemElements(): HTMLElement[] {
        return this.body
            ? Array.from(this.body.querySelectorAll<HTMLElement>('[data-collection-key]'))
            : [];
    }

    private getElementKey(element: HTMLElement | null): CollectionItemKey | null {
        const attribute = element?.dataset.collectionKey;
        return attribute ? this.keyByAttribute.get(attribute) ?? null : null;
    }

    private rebuildKeyIndexes(): void {
        this.itemIndexByKey.clear();
        this.keyByAttribute.clear();
        this.items.forEach((item, index) => {
            const key = this.renderer.getKey(item);
            this.itemIndexByKey.set(key, index);
            this.keyByAttribute.set(this.keyToAttribute(key), key);
        });
    }

    private keyToAttribute(key: CollectionItemKey): string {
        return `${typeof key === 'number' ? 'n' : 's'}:${encodeURIComponent(String(key))}`;
    }

    private getScrollMargin(): number {
        if (!this.body || !this.scrollElement) return 0;
        const bodyRect = this.body.getBoundingClientRect();
        const scrollRect = this.scrollElement.getBoundingClientRect();
        return bodyRect.top - scrollRect.top + this.scrollElement.scrollTop;
    }

    private publishRenderedKeys(keys: CollectionItemKey[]): void {
        this.renderedKeys = keys;
        this.options.onRenderedRangeChange?.([...keys]);
    }

    private async writeScrollOffset(offset: number): Promise<void> {
        const scrollTop = Math.max(0, offset);
        if (this.options.restoreScrollOffset) {
            await this.options.restoreScrollOffset(scrollTop);
            return;
        }
        if (this.scrollElement) {
            this.scrollElement.scrollTop = scrollTop;
        }
    }

    private beginReadyCycle(): void {
        this.cancelReadyFrame();
        this.resolveReady?.();
        this.readyPromise = new Promise<void>((resolve) => {
            this.resolveReady = resolve;
        });
    }

    private markReady(): void {
        this.resolveReady?.();
        this.resolveReady = null;
    }

    private cancelReadyFrame(): void {
        if (this.readyFrame !== null) {
            cancelAnimationFrame(this.readyFrame);
            this.readyFrame = null;
        }
    }
}
