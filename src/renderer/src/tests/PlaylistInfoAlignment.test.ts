import {describe, expect, it} from 'vitest';
import type {MusicBoxSettings} from '../api/types/settings';
import {settingsStore} from '../features/settings/service/SettingsStore';

describe('歌单信息对齐设置', () => {
    it('默认使用靠左对齐', () => {
        expect(settingsStore.getInitialValues({}).playlistInfoAlignment).toBe('left');
    });

    it.each(['center', 'right'] as const)('保留有效的 %s 对齐设置', (alignment) => {
        const settings: MusicBoxSettings = {playlistInfoAlignment: alignment};

        expect(settingsStore.getInitialValues(settings).playlistInfoAlignment).toBe(alignment);
    });

    it('无效设置回退为靠左对齐', () => {
        const settings = {playlistInfoAlignment: 'invalid'} as unknown as MusicBoxSettings;

        expect(settingsStore.getInitialValues(settings).playlistInfoAlignment).toBe('left');
    });
});
