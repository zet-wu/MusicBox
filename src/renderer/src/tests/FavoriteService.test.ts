import {beforeEach, describe, expect, it, vi} from 'vitest';

const defaultGateway = vi.hoisted(() => ({
    setTrackFavorite: vi.fn(),
    onFavoritesChanged: vi.fn(() => () => undefined)
}));

vi.mock('../infrastructure/electron', () => ({
    libraryGateway: defaultGateway
}));

import {FavoriteService} from '../features/library/service/FavoriteService';
import type {FavoritesChangedData} from '../api/types/electron';

function deferred<T>() {
    let resolve!: (value: T) => void;
    const promise = new Promise<T>((resolvePromise) => {
        resolve = resolvePromise;
    });
    return {promise, resolve};
}

function createGateway() {
    let eventHandler: ((data: FavoritesChangedData) => void) | null = null;
    return {
        gateway: {
            setTrackFavorite: vi.fn(),
            onFavoritesChanged: vi.fn((handler: (data: FavoritesChangedData) => void) => {
                eventHandler = handler;
                return () => undefined;
            })
        },
        emit(data: FavoritesChangedData) {
            eventHandler?.(data);
        }
    };
}

describe('FavoriteService', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('接收主进程事件并统一发布最终状态', () => {
        const {gateway, emit} = createGateway();
        const service = new FavoriteService(gateway);
        const listener = vi.fn();
        service.onChanged(listener);

        emit({trackIds: ['track-1'], favorite: true});

        expect(service.isFavorite({fileId: 'track-1'})).toBe(true);
        expect(listener).toHaveBeenCalledWith({trackIds: ['track-1'], favorite: true});
        service.destroy();
    });

    it('命令结果与主进程推送相同时只通知一次', async () => {
        const {gateway, emit} = createGateway();
        const service = new FavoriteService(gateway);
        const listener = vi.fn();
        service.onChanged(listener);
        gateway.setTrackFavorite.mockResolvedValue({success: true, favorite: true});

        emit({trackIds: ['track-1'], favorite: true});
        await service.setFavorite({fileId: 'track-1', favorite: false}, true);
        emit({trackIds: ['track-1'], favorite: true});

        expect(listener).toHaveBeenCalledOnce();
        expect(listener).toHaveBeenCalledWith({trackIds: ['track-1'], favorite: true});
        service.destroy();
    });

    it('成功和失败均返回明确的最终状态', async () => {
        const {gateway} = createGateway();
        const service = new FavoriteService(gateway);
        gateway.setTrackFavorite
            .mockResolvedValueOnce({success: true, favorite: true})
            .mockResolvedValueOnce({success: false, error: '写入失败'});

        await expect(service.setFavorite({fileId: 'track-1', favorite: false}, true))
            .resolves.toEqual({success: true, favorite: true});
        await expect(service.setFavorite({fileId: 'track-1', favorite: true}, false))
            .resolves.toMatchObject({success: false, favorite: true, error: '写入失败'});
        service.destroy();
    });

    it('同一歌曲快速重复点击会串行写入并保留每次切换意图', async () => {
        const first = deferred<{success: boolean; favorite: boolean}>();
        const second = deferred<{success: boolean; favorite: boolean}>();
        const {gateway} = createGateway();
        const service = new FavoriteService(gateway);
        gateway.setTrackFavorite
            .mockImplementationOnce(() => first.promise)
            .mockImplementationOnce(() => second.promise);
        const track = {fileId: 'track-1', favorite: false};

        const firstToggle = service.toggle(track);
        const secondToggle = service.toggle(track);

        await vi.waitFor(() => {
            expect(gateway.setTrackFavorite).toHaveBeenCalledTimes(1);
        });
        expect(gateway.setTrackFavorite).toHaveBeenNthCalledWith(1, 'track-1', true);

        first.resolve({success: true, favorite: true});
        await firstToggle;
        await vi.waitFor(() => {
            expect(gateway.setTrackFavorite).toHaveBeenCalledTimes(2);
        });
        expect(gateway.setTrackFavorite).toHaveBeenNthCalledWith(2, 'track-1', false);

        second.resolve({success: true, favorite: false});
        await expect(secondToggle).resolves.toEqual({success: true, favorite: false});
        expect(service.isFavorite(track)).toBe(false);
        service.destroy();
    });
});
