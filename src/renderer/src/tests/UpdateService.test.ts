import {afterEach, describe, expect, it, vi} from 'vitest';
import {updateService} from '../features/appShell/service/UpdateService';

describe('UpdateService', () => {
    afterEach(() => {
        vi.unstubAllGlobals();
    });

    it('从当前仓库查询最新发行版', async () => {
        const fetchMock = vi.fn().mockResolvedValue({
            ok: true,
            json: async () => ({
                tag_name: '0.3.0'
            })
        });
        vi.stubGlobal('fetch', fetchMock);

        await updateService.getLatestRelease();

        expect(fetchMock).toHaveBeenCalledWith(
            'https://api.github.com/repos/zet-wu/MusicBox/releases/latest'
        );
    });
});
