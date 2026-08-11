export class MainContentScrollCoordinator {
    private readonly positions = new Map<string, number>();
    private pendingRestoreFrame: number | null = null;
    private restoreGeneration = 0;

    constructor(private readonly selector = '.main-content') {}

    capture(key: string): number {
        this.cancelPendingRestore();
        const scrollTop = this.getScrollElement()?.scrollTop ?? 0;
        this.positions.set(key, scrollTop);
        return scrollTop;
    }

    remember(key: string, scrollTop: number): void {
        this.positions.set(key, Math.max(0, scrollTop));
    }

    read(key: string): number {
        return this.positions.get(key) ?? 0;
    }

    restore(key: string, isCurrent: () => boolean = () => true): void {
        this.cancelPendingRestore();
        const scrollElement = this.getScrollElement();
        if (!scrollElement) return;
        const generation = ++this.restoreGeneration;
        const scrollTop = this.read(key);
        this.pendingRestoreFrame = requestAnimationFrame(() => {
            this.pendingRestoreFrame = null;
            if (generation !== this.restoreGeneration || !isCurrent()) return;
            scrollElement.scrollTop = scrollTop;
        });
    }

    scrollToTop(): void {
        this.cancelPendingRestore();
        const scrollElement = this.getScrollElement();
        if (scrollElement) scrollElement.scrollTop = 0;
    }

    cancelPendingRestore(): void {
        this.restoreGeneration++;
        if (this.pendingRestoreFrame === null) return;
        cancelAnimationFrame(this.pendingRestoreFrame);
        this.pendingRestoreFrame = null;
    }

    private getScrollElement(): HTMLElement | null {
        if (typeof document === 'undefined') return null;
        return document.querySelector<HTMLElement>(this.selector);
    }
}
