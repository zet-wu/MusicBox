import type {LyricsProvider} from './LyricsProvider';

export class LyricsProviderRegistry {
    private readonly providers = new Map<string, LyricsProvider>();

    register(provider: LyricsProvider): () => void {
        if (this.providers.has(provider.id)) {
            throw new Error(`歌词 provider 已注册: ${provider.id}`);
        }
        this.providers.set(provider.id, provider);
        return () => this.providers.delete(provider.id);
    }

    get(providerId: string): LyricsProvider | undefined {
        return this.providers.get(providerId);
    }

    list(): LyricsProvider[] {
        return [...this.providers.values()];
    }
}
