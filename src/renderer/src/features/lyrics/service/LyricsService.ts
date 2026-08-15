import type {Track} from '@api/types/track';
import {lyricsGateway} from '@/infrastructure/electron';
import type {
    LyricsBinding,
    LyricsCandidate,
    LyricsDocument,
    LyricsSourceRef,
    TrackLyricsQuery
} from '../domain/types';
import {LyricsNormalizer} from '../format/LyricsNormalizer';
import type {LyricsProviderRegistry} from '../providers/LyricsProviderRegistry';
import {EmbeddedLyricsSource} from '../sources/EmbeddedLyricsSource';
import {LocalLyricsSource} from '../sources/LocalLyricsSource';

export interface LyricsLoadResult {
    document: LyricsDocument | null;
    binding?: LyricsBinding;
    error?: string;
}

export interface LyricsServiceOptions {
    providers: LyricsProviderRegistry;
    localSource: LocalLyricsSource;
    embeddedSource?: EmbeddedLyricsSource;
    normalizer?: LyricsNormalizer;
}

export class LyricsService {
    private readonly providers: LyricsProviderRegistry;
    private readonly localSource: LocalLyricsSource;
    private readonly embeddedSource: EmbeddedLyricsSource;
    private readonly normalizer: LyricsNormalizer;

    constructor(options: LyricsServiceOptions) {
        this.providers = options.providers;
        this.localSource = options.localSource;
        this.embeddedSource = options.embeddedSource ?? new EmbeddedLyricsSource();
        this.normalizer = options.normalizer ?? new LyricsNormalizer();
    }

    async load(track: Track, signal: AbortSignal): Promise<LyricsLoadResult> {
        const query = toTrackLyricsQuery(track);
        const persisted = await lyricsGateway.readCanonical(query.trackId);
        if (persisted.success && persisted.ttml && persisted.binding) {
            try {
                return {
                    document: this.normalizer.fromTtml(persisted.ttml, this.createContext(query, persisted.binding.source)),
                    binding: persisted.binding
                };
            } catch (error) {
                console.warn('⚠️ Lyrics: 已持久化 TTML 无效，将重新匹配', error);
            }
        }

        const local = await this.localSource.find(query);
        if (local) {
            const source: LyricsSourceRef = {kind: 'local', path: local.path};
            const document = local.kind === 'ttml'
                ? this.normalizer.fromTtml(local.content, this.createContext(query, source))
                : this.normalizer.fromLrc(local.content, this.createContext(query, source));
            return this.persist(query.trackId, document);
        }

        const embedded = await this.embeddedSource.find(query);
        if (embedded) {
            const source: LyricsSourceRef = {kind: 'embedded', trackId: query.trackId};
            const document = this.normalizer.fromPayload(embedded, this.createContext(query, source));
            return this.persist(query.trackId, document);
        }

        for (const provider of this.providers.list()) {
            if (signal.aborted) throw signal.reason;
            try {
                const candidates = await provider.search(query, signal);
                const candidate = candidates[0];
                if (!candidate) continue;
                return await this.applyCandidate(query, candidate, false, signal);
            } catch (error) {
                if (signal.aborted) throw error;
                console.warn(`⚠️ Lyrics: ${provider.displayName} 自动匹配失败`, error);
            }
        }

        return {document: null, error: '未找到歌词'};
    }

    async applyCandidate(
        query: TrackLyricsQuery,
        candidate: LyricsCandidate,
        manuallySelected: boolean,
        signal: AbortSignal
    ): Promise<LyricsLoadResult> {
        const provider = this.providers.get(candidate.providerId);
        if (!provider) return {document: null, error: '未知歌词来源'};
        const payload = await provider.fetch(candidate, signal);
        const source: LyricsSourceRef = {
            kind: 'provider',
            providerId: candidate.providerId,
            candidateId: candidate.candidateId,
            manuallySelected
        };
        const document = this.normalizer.fromPayload(payload, this.createContext(query, source));
        return this.persist(query.trackId, document);
    }

    async previewCandidate(
        query: TrackLyricsQuery,
        candidate: LyricsCandidate,
        signal: AbortSignal
    ): Promise<LyricsDocument> {
        const provider = this.providers.get(candidate.providerId);
        if (!provider) throw new Error('未知歌词来源');
        const payload = await provider.fetch(candidate, signal);
        const source: LyricsSourceRef = {
            kind: 'provider',
            providerId: candidate.providerId,
            candidateId: candidate.candidateId,
            manuallySelected: true
        };
        return this.normalizer.fromPayload(payload, this.createContext(query, source));
    }

    async clearBinding(track: Track): Promise<void> {
        const result = await lyricsGateway.clearBinding(toTrackLyricsQuery(track).trackId);
        if (!result.success) throw new Error(result.error ?? '清除歌词绑定失败');
    }

    private async persist(trackId: string, document: LyricsDocument): Promise<LyricsLoadResult> {
        const saved = await lyricsGateway.saveCanonical(trackId, document.ttmlText, document.source);
        if (!saved.success) {
            console.warn(`⚠️ Lyrics: canonical TTML 保存失败: ${saved.error ?? '未知错误'}`);
        }
        return {document, binding: saved.binding};
    }

    private createContext(query: TrackLyricsQuery, source: LyricsSourceRef) {
        return {
            source,
            durationMs: query.durationMs,
            title: query.title,
            artists: query.artists,
            album: query.album
        };
    }
}

export function toTrackLyricsQuery(track: Track): TrackLyricsQuery {
    const filePath = String(track.filePath || track.path || '');
    const trackId = String(track.fileId || track.id || filePath || `${track.title}\u0000${track.artist}`);
    const duration = typeof track.duration === 'number' && Number.isFinite(track.duration)
        ? (track.duration < 10_000 ? track.duration * 1000 : track.duration)
        : undefined;
    return {
        trackId,
        title: track.title,
        artists: track.artist ? track.artist.split(/[、/&;,，]+/).map(artist => artist.trim()).filter(Boolean) : [],
        album: track.album,
        durationMs: duration,
        filePath
    };
}
