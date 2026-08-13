export type CollectionItemKey = string | number;

export const COLLECTION_VIRTUALIZATION_THRESHOLD = 50;
export const COLLECTION_LIST_OVERSCAN = 8;
export const COLLECTION_GRID_OVERSCAN = 3;

export type CollectionLayout =
    | {
        mode: 'list';
        estimateRowSize: number;
        overscan?: 8;
    }
    | {
        mode: 'grid';
        estimateRowSize: number;
        getColumnCount(width: number): number;
        overscan?: 3;
    };

export interface CollectionSurfaceSnapshot {
    anchorKey: CollectionItemKey | null;
    anchorOffset: number;
    fallbackScrollTop: number;
    focusedKey: CollectionItemKey | null;
}

export interface CollectionSurfaceRenderer<T> {
    getKey(item: T): CollectionItemKey;
    renderItem(item: T, index: number): string;
}

export type CollectionSurfaceMode = 'direct' | 'virtual';

export interface CollectionSurfaceOptions {
    onRenderedRangeChange?(keys: CollectionItemKey[]): void;
    restoreScrollOffset?(scrollTop: number): void | Promise<void>;
}
