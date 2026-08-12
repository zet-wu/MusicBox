import {describe, expect, it, vi} from 'vitest';
import {
    applyCollectionSearch,
    normalizeCollectionSearchText
} from '../ui/collections/CollectionSearch';

describe('CollectionSearch', () => {
    it('统一去除查询空白并忽略大小写', () => {
        expect(normalizeCollectionSearchText('  Night SKY  ')).toBe('night sky');
    });

    it('支持页面声明多个搜索字段', () => {
        const source = [
            {name: '晨光', artist: '甲'},
            {name: '夜色', artist: '星河乐队'}
        ];
        const commit = vi.fn();

        const results = applyCollectionSearch({
            source,
            query: '  星河  ',
            getSearchableValues: item => [item.name, item.artist],
            commit
        });

        expect(results).toEqual([source[1]]);
        expect(commit).toHaveBeenCalledWith(results);
    });

    it('查询更新时先重置滚动再刷新视图', () => {
        const calls: string[] = [];

        applyCollectionSearch({
            source: ['夜色'],
            query: '夜',
            getSearchableValues: item => [item],
            commit: () => calls.push('commit'),
            refresh: {
                resetScroll: () => calls.push('scroll'),
                updateView: () => calls.push('view')
            }
        });

        expect(calls).toEqual(['commit', 'scroll', 'view']);
    });
});
