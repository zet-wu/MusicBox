import {describe, expect, it} from 'vitest';
import {settingsStore} from '../features/settings/service/SettingsStore';

describe('列表封面联网设置', () => {
    it('默认不联网补全缺失封面', () => {
        expect(settingsStore.getInitialValues({}).autoFetchMissingTrackCovers).toBe(false);
    });

    it('保留用户启用联网补全的设置', () => {
        const settings = {autoFetchMissingTrackCovers: true};

        expect(settingsStore.getInitialValues(settings).autoFetchMissingTrackCovers).toBe(true);
    });
});
