import {settingsStore} from '@/features/settings/service/SettingsStore';
import {createBuiltinLyricsProviderRegistry} from '../providers/builtin';
import {LocalLyricsSource} from '../sources/LocalLyricsSource';
import {LyricsSearchService} from './LyricsSearchService';
import {LyricsService} from './LyricsService';

export const lyricsProviderRegistry = createBuiltinLyricsProviderRegistry();
export const lyricsSearchService = new LyricsSearchService(lyricsProviderRegistry);
let service: LyricsService | null = null;

export function getLyricsService(): LyricsService {
    service ??= new LyricsService({
        providers: lyricsProviderRegistry,
        localSource: new LocalLyricsSource(() => {
            const directory = settingsStore.load().lyricsDirectory;
            return typeof directory === 'string' ? directory : null;
        })
    });
    return service;
}
