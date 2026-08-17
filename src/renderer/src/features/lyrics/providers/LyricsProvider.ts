import type {LyricsCandidate, ProviderLyricsPayload, TrackLyricsQuery} from '../domain/types';

export interface LyricsProvider {
    readonly id: string;
    readonly displayName: string;

    search(query: TrackLyricsQuery, signal: AbortSignal): Promise<LyricsCandidate[]>;
    fetch(candidate: LyricsCandidate, signal: AbortSignal): Promise<ProviderLyricsPayload>;
}
