import {MainContentScrollCoordinator} from '@/app/runtime/MainContentScrollCoordinator';
import type {CollectionSurfaceSnapshot} from './types';

export type MasterDetailLocation =
    | {kind: 'list'; key: string}
    | {kind: 'detail'; key: string; identity: string};

export interface MasterDetailSurface {
    captureSnapshot(): CollectionSurfaceSnapshot;
    suspend(): CollectionSurfaceSnapshot;
    resume(snapshot: CollectionSurfaceSnapshot): Promise<void>;
    whenReady(): Promise<void>;
    destroy(): void;
}

interface MasterDetailViewHostOptions {
    listLocationKey: string;
    detailLocationKey(identity: string): string;
}

/**
 * 统一保留主列表与详情根节点，并协调两者的滚动生命周期。
 */
export class MasterDetailViewHost {
    readonly listRoot: HTMLElement;
    readonly detailRoot: HTMLElement;
    private surface: MasterDetailSurface | null = null;
    private listSnapshot: CollectionSurfaceSnapshot | null = null;
    private location: MasterDetailLocation;
    private active = true;
    private generation = 0;

    constructor(
        private readonly pageRoot: HTMLElement,
        private readonly scroll: MainContentScrollCoordinator,
        private readonly options: MasterDetailViewHostOptions
    ) {
        this.listRoot = document.createElement('div');
        this.listRoot.className = 'collection-master-root';
        this.detailRoot = document.createElement('div');
        this.detailRoot.className = 'collection-detail-root';
        this.detailRoot.style.display = 'none';
        this.pageRoot.replaceChildren(this.listRoot, this.detailRoot);
        this.location = {kind: 'list', key: options.listLocationKey};
    }

    attachSurface(surface: MasterDetailSurface): void {
        if (this.surface === surface) return;
        this.surface?.destroy();
        this.surface = surface;
    }

    enterDetail(identity: string): MasterDetailLocation {
        this.generation++;
        if (this.surface) {
            this.listSnapshot = this.surface.suspend();
        }
        this.location = {
            kind: 'detail',
            key: this.options.detailLocationKey(identity),
            identity
        };
        this.listRoot.style.display = 'none';
        this.detailRoot.style.display = 'block';
        this.scroll.scrollToTop();
        return this.location;
    }

    async returnToList(): Promise<void> {
        const generation = ++this.generation;
        this.location = {kind: 'list', key: this.options.listLocationKey};
        this.detailRoot.style.display = 'none';
        this.listRoot.style.display = 'block';
        const snapshot = this.listSnapshot;
        if (this.surface && snapshot) {
            await this.surface.resume(snapshot);
        }
        if (generation !== this.generation || !this.isCurrentList()) {
            return;
        }
    }

    suspend(): MasterDetailLocation {
        this.active = false;
        this.generation++;
        if (this.location.kind === 'list' && this.surface) {
            this.listSnapshot = this.surface.suspend();
        } else {
            this.scroll.capture(this.location.key);
        }
        return this.location;
    }

    async resume(): Promise<void> {
        const generation = ++this.generation;
        this.active = true;
        if (this.location.kind === 'list') {
            this.detailRoot.style.display = 'none';
            this.listRoot.style.display = 'block';
            if (this.surface && this.listSnapshot) {
                await this.surface.resume(this.listSnapshot);
            }
        } else {
            this.listRoot.style.display = 'none';
            this.detailRoot.style.display = 'block';
            await this.scroll.restore(this.location.key, {
                isCurrent: () => generation === this.generation && this.isCurrentDetail()
            });
        }
    }

    restoreListOffset(scrollTop: number): Promise<void> {
        this.scroll.remember(this.options.listLocationKey, scrollTop);
        return this.scroll.restore(this.options.listLocationKey, {
            scrollTop,
            whenReady: () => this.surface?.whenReady() ?? Promise.resolve(),
            isCurrent: () => this.isCurrentList()
        });
    }

    getLocation(): MasterDetailLocation {
        return this.location;
    }

    isCurrentLocation(key: string): boolean {
        return this.active && this.location.key === key;
    }

    destroy(): void {
        this.active = false;
        this.generation++;
        this.scroll.cancelPendingRestore(this.options.listLocationKey);
        this.scroll.cancelPendingRestore(this.location.key);
        this.surface?.destroy();
        this.surface = null;
        this.listSnapshot = null;
        this.pageRoot.replaceChildren();
    }

    private isCurrentList(): boolean {
        return this.active && this.location.kind === 'list';
    }

    private isCurrentDetail(): boolean {
        return this.active && this.location.kind === 'detail';
    }
}
