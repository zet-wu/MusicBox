import {beforeEach, describe, expect, it, vi} from 'vitest';

const gatewayMocks = vi.hoisted(() => ({
    onLibraryUpdated: vi.fn(),
    onPlaylistsUpdated: vi.fn()
}));

vi.mock('@/infrastructure/electron', () => ({
    libraryGateway: gatewayMocks
}));

vi.mock('@/features/appShell/service', () => ({
    windowShellService: {}
}));

vi.mock('@/features/networkDrive/service', () => ({
    networkDriveManagementService: {}
}));

vi.mock('@/features/library/service/LibraryDataService', () => ({
    libraryDataService: {}
}));

import NavigationDataService from '@/ui/widgets/navigation/NavigationDataService';

describe('NavigationDataService 更新事件路由', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('侧边栏歌单订阅专用歌单更新事件', () => {
        const unsubscribe = vi.fn();
        const handler = vi.fn();
        gatewayMocks.onPlaylistsUpdated.mockReturnValue(unsubscribe);
        const service = new NavigationDataService();

        const result = service.onPlaylistsUpdated(handler);

        expect(gatewayMocks.onPlaylistsUpdated).toHaveBeenCalledWith(handler);
        expect(gatewayMocks.onLibraryUpdated).not.toHaveBeenCalled();
        expect(result).toBe(unsubscribe);
    });
});
