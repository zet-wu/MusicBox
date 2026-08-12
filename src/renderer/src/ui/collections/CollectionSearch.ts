export type CollectionSearchValue = string | number | null | undefined;

export interface CollectionSearchOptions<T> {
    source: readonly T[];
    query: string;
    getSearchableValues(item: T): readonly CollectionSearchValue[];
    commit(results: T[]): void;
    refresh?: {
        resetScroll(): void;
        updateView(): void;
    };
}

/**
 * 统一规范化本地集合搜索文本。
 */
export function normalizeCollectionSearchText(value: CollectionSearchValue): string {
    return String(value ?? '').trim().toLocaleLowerCase();
}

/**
 * 按页面声明的字段过滤本地集合，并统一提交与刷新生命周期。
 */
export function applyCollectionSearch<T>(options: CollectionSearchOptions<T>): T[] {
    const query = normalizeCollectionSearchText(options.query);
    const results = query
        ? options.source.filter(item => options.getSearchableValues(item).some(value => (
            normalizeCollectionSearchText(value).includes(query)
        )))
        : [...options.source];

    options.commit(results);
    if (options.refresh) {
        options.refresh.resetScroll();
        options.refresh.updateView();
    }
    return results;
}
