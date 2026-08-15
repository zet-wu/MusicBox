import {LyricsProviderRegistry} from '../LyricsProviderRegistry';
import {AmllLyricsProvider} from './AmllLyricsProvider';
import {KugouLyricsProvider} from './KugouLyricsProvider';
import {NeteaseLyricsProvider} from './NeteaseLyricsProvider';
import {QqMusicLyricsProvider} from './QqMusicLyricsProvider';

export function createBuiltinLyricsProviderRegistry(): LyricsProviderRegistry {
    const registry = new LyricsProviderRegistry();
    registry.register(new AmllLyricsProvider());
    registry.register(new NeteaseLyricsProvider());
    registry.register(new QqMusicLyricsProvider());
    registry.register(new KugouLyricsProvider());
    return registry;
}

export {AmllLyricsProvider, KugouLyricsProvider, NeteaseLyricsProvider, QqMusicLyricsProvider};
