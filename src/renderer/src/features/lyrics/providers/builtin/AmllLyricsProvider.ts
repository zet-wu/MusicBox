import type {LyricsCandidate, ProviderLyricsPayload, TrackLyricsQuery} from '../../domain/types';
import type {LyricsProvider} from '../LyricsProvider';
import {fetchJson, fetchText, providerFetch, rankProviderCandidates, splitArtists, type LyricsFetch} from './shared';

interface AmllSearchItem {
    id?: string | number;
    title?: string;
    titles?: string[];
    artist?: string;
    artists?: string[];
    album?: string | string[];
    albums?: string[];
    duration?: number;
    platform?: string;
    file?: string;
}

interface AmllProviderData {
    platform: string;
    file: string;
}

export class AmllLyricsProvider implements LyricsProvider {
    readonly id = 'amll';
    readonly displayName = 'AMLL';

    constructor(
        private readonly request: LyricsFetch = providerFetch,
        private readonly baseUrl = 'https://amlldb.bikonoo.com'
    ) {}

    async search(query: TrackLyricsQuery, signal: AbortSignal): Promise<LyricsCandidate[]> {
        const results = await fetchJson<AmllSearchItem[]>(
            this.request,
            `${this.baseUrl}/api/search-lyrics`,
            signal,
            {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({query: query.title.trim(), type: 'all'})
            }
        );

        return rankProviderCandidates(query, results
            .filter(item => item.platform && item.file)
            .map(item => ({
                providerId: this.id,
                candidateId: String(item.id ?? `${item.platform}:${item.file}`),
                title: item.title ?? item.titles?.[0] ?? query.title,
                artists: item.artists ?? splitArtists(item.artist),
                album: item.albums?.[0] ?? (Array.isArray(item.album) ? item.album[0] : item.album),
                durationMs: item.duration ? normalizeDuration(item.duration) : undefined,
                capabilities: {lineTimed: true, wordTimed: true, translation: true, romanization: true, ruby: true, ttml: true},
                providerData: {platform: item.platform!, file: item.file!} satisfies AmllProviderData
            })));
    }

    async fetch(candidate: LyricsCandidate, signal: AbortSignal): Promise<ProviderLyricsPayload> {
        const data = candidate.providerData as AmllProviderData | undefined;
        if (!data?.platform || !data.file) throw new Error('AMLL 候选缺少下载信息');
        const platform = encodeURIComponent(data.platform);
        const file = data.file.split('/').map(encodeURIComponent).join('/');
        const ttml = await fetchText(this.request, `${this.baseUrl}/${platform}/${file}`, signal);
        return {kind: 'ttml', ttml};
    }
}

function normalizeDuration(value: number): number {
    return value < 10_000 ? value * 1000 : value;
}
