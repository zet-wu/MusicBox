import {settingsShellService} from '@/features/appShell/service/SettingsShellService';

const SETTING_KEY = 'autoPlaylistCoverFromFirstTrack';

export class PlaylistAutoCoverPreferenceService {
    async load(): Promise<boolean> {
        return await settingsShellService.getSetting<boolean>(SETTING_KEY) === true;
    }

    async save(enabled: boolean): Promise<boolean> {
        return await settingsShellService.setSetting(SETTING_KEY, enabled);
    }
}

export const playlistAutoCoverPreferenceService = new PlaylistAutoCoverPreferenceService();
