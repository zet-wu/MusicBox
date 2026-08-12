export class MainContentScrollCoordinator {
    private readonly positions = new Map<string, number>();
    private readonly pendingRestores = new Map<string, {
        frameId: number;
        generation: number;
        resolve: () => void;
    }>();
    private readonly restoreGenerations = new Map<string, number>();

    constructor(private readonly selector = '.main-content') {}

    capture(key: string): number {
        this.cancelPendingRestore(key);
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

    restore(
        key: string,
        isCurrentOrOptions: (() => boolean) | ScrollRestoreOptions = () => true
    ): Promise<void> {
        this.cancelPendingRestore(key);
        const scrollElement = this.getScrollElement();
        if (!scrollElement) return Promise.resolve();
        const options = typeof isCurrentOrOptions === 'function'
            ? {isCurrent: isCurrentOrOptions}
            : isCurrentOrOptions;
        const generation = this.nextGeneration(key);
        const isCurrent = options.isCurrent ?? (() => true);
        const scrollTop = Math.max(0, options.scrollTop ?? this.read(key));
        const schedule = (): Promise<void> => {
            if (generation !== this.getGeneration(key) || !isCurrent()) {
                return Promise.resolve();
            }
            return new Promise<void>((resolve) => {
                const frameId = requestAnimationFrame(() => {
                    this.pendingRestores.delete(key);
                    if (generation === this.getGeneration(key) && isCurrent()) {
                        scrollElement.scrollTop = scrollTop;
                    }
                    resolve();
                });
                this.pendingRestores.set(key, {frameId, generation, resolve});
            });
        };

        if (!options.whenReady) {
            return schedule();
        }
        const ready = typeof options.whenReady === 'function'
            ? options.whenReady()
            : options.whenReady;
        return Promise.resolve(ready).then(schedule);
    }

    scrollToTop(): void {
        this.cancelPendingRestore();
        const scrollElement = this.getScrollElement();
        if (scrollElement) scrollElement.scrollTop = 0;
    }

    cancelPendingRestore(key?: string): void {
        if (key !== undefined) {
            this.cancelRestoreForKey(key);
            return;
        }
        const keys = new Set([...this.restoreGenerations.keys(), ...this.pendingRestores.keys()]);
        keys.forEach((pendingKey) => this.cancelRestoreForKey(pendingKey));
    }

    private getScrollElement(): HTMLElement | null {
        if (typeof document === 'undefined') return null;
        return document.querySelector<HTMLElement>(this.selector);
    }

    private cancelRestoreForKey(key: string): void {
        this.nextGeneration(key);
        const pending = this.pendingRestores.get(key);
        if (!pending) return;
        cancelAnimationFrame(pending.frameId);
        this.pendingRestores.delete(key);
        pending.resolve();
    }

    private nextGeneration(key: string): number {
        const generation = this.getGeneration(key) + 1;
        this.restoreGenerations.set(key, generation);
        return generation;
    }

    private getGeneration(key: string): number {
        return this.restoreGenerations.get(key) ?? 0;
    }
}

export interface ScrollRestoreOptions {
    isCurrent?: () => boolean;
    whenReady?: Promise<void> | (() => Promise<void>);
    scrollTop?: number;
}
