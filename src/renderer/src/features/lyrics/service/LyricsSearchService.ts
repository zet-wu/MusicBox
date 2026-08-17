import type {LyricsCandidate, TrackLyricsQuery} from '../domain/types';
import type {LyricsProviderRegistry} from '../providers/LyricsProviderRegistry';

export type ProviderSearchState = 'idle' | 'loading' | 'success' | 'error';

export interface ProviderSearchResult {
    providerId: string;
    displayName: string;
    state: ProviderSearchState;
    candidates: LyricsCandidate[];
    error?: string;
}

export class LyricsSearchService {
    constructor(private readonly registry: LyricsProviderRegistry) {}

    async searchProvider(
        providerId: string,
        query: TrackLyricsQuery,
        signal: AbortSignal
    ): Promise<ProviderSearchResult> {
        const provider = this.registry.get(providerId);
        if (!provider) {
            return {providerId, displayName: providerId, state: 'error', candidates: [], error: '未知歌词来源'};
        }
        try {
            const candidates = await provider.search(query, signal);
            return {providerId, displayName: provider.displayName, state: 'success', candidates};
        } catch (error) {
            if (signal.aborted) throw error;
            return {
                providerId,
                displayName: provider.displayName,
                state: 'error',
                candidates: [],
                error: error instanceof Error ? error.message : String(error)
            };
        }
    }

    async searchAll(query: TrackLyricsQuery, signal: AbortSignal): Promise<ProviderSearchResult[]> {
        return Promise.all(this.registry.list().map(provider => this.searchProvider(provider.id, query, signal)));
    }
}
