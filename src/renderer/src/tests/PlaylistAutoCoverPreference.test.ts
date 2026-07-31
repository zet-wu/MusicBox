import {beforeEach, describe, expect, it, vi} from 'vitest';
import {settingsShellService} from '../features/appShell/service/SettingsShellService';
import {PlaylistAutoCoverPreferenceService} from '../features/settings/service/PlaylistAutoCoverPreferenceService';

describe('PlaylistAutoCoverPreferenceService', () => {
    beforeEach(() => {
        vi.restoreAllMocks();
    });

    it('缺少设置时默认关闭', async () => {
        vi.spyOn(settingsShellService, 'getSetting').mockResolvedValue(null);

        await expect(new PlaylistAutoCoverPreferenceService().load()).resolves.toBe(false);
    });

    it('通过主进程设置存取开关', async () => {
        vi.spyOn(settingsShellService, 'getSetting').mockResolvedValue(true);
        const setSetting = vi.spyOn(settingsShellService, 'setSetting').mockResolvedValue(true);
        const service = new PlaylistAutoCoverPreferenceService();

        await expect(service.load()).resolves.toBe(true);
        await expect(service.save(false)).resolves.toBe(true);
        expect(setSetting).toHaveBeenCalledWith('autoPlaylistCoverFromFirstTrack', false);
    });
});
