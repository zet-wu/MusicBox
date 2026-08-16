import type {Track} from '@api/types/track';
import {lyricsGateway} from '@/infrastructure/electron';
import type {
    LyricsBinding,
    LyricsCandidate,
    LyricsCandidatePreview,
    LyricsDocument,
    LyricsSourceRef,
    TrackLyricsQuery
} from '../domain/types';
import {LyricsNormalizer} from '../format/LyricsNormalizer';
import type {LyricsProviderRegistry} from '../providers/LyricsProviderRegistry';
import {LyricsSearchService} from './LyricsSearchService';
import {EmbeddedLyricsSource} from '../sources/EmbeddedLyricsSource';
import {LocalLyricsSource} from '../sources/LocalLyricsSource';
import {AUTO_MATCH_IDENTITY_THRESHOLD, compareLyricsCandidates} from '../domain/candidateMatching';

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
        let fallback: {document: LyricsDocument; binding?: LyricsBinding; needsPersistence: boolean} | null = null;
        const persisted = await lyricsGateway.readCanonical(query.trackId);
        if (persisted.success && persisted.ttml && persisted.binding) {
            try {
                const document = this.normalizer.fromTtml(
                    persisted.ttml,
                    this.createContext(query, persisted.binding.source)
                );
                if (isManualBinding(persisted.binding) || isWordTimed(document)) {
                    return {document, binding: persisted.binding};
                }
                fallback = {document, binding: persisted.binding, needsPersistence: false};
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
            if (isWordTimed(document)) return this.persist(query.trackId, document);
            fallback ??= {document, needsPersistence: true};
        }

        const embedded = await this.embeddedSource.find(query);
        if (embedded) {
            const source: LyricsSourceRef = {kind: 'embedded', trackId: query.trackId};
            const document = this.normalizer.fromPayload(embedded, this.createContext(query, source));
            if (isWordTimed(document)) return this.persist(query.trackId, document);
            fallback ??= {document, needsPersistence: true};
        }

        const searchResults = await new LyricsSearchService(this.providers).searchAll(query, signal);
        const candidates = searchResults
            .flatMap(result => result.candidates.slice(0, 2))
            .filter(candidate => candidate.identityScore >= AUTO_MATCH_IDENTITY_THRESHOLD)
            .sort(compareLyricsCandidates);
        let onlineLineTimed: LyricsDocument | null = null;

        for (const candidate of candidates) {
            if (signal.aborted) throw signal.reason;
            try {
                const document = await this.fetchCandidate(query, candidate, false, signal);
                if (isWordTimed(document)) return this.persist(query.trackId, document);
                onlineLineTimed ??= document;
            } catch (error) {
                if (signal.aborted) throw error;
                console.warn(`⚠️ Lyrics: ${candidate.providerId} 自动匹配失败`, error);
            }
        }

        if (fallback) {
            return fallback.needsPersistence
                ? this.persist(query.trackId, fallback.document)
                : {document: fallback.document, binding: fallback.binding};
        }
        if (onlineLineTimed) return this.persist(query.trackId, onlineLineTimed);
        return {document: null, error: '未找到歌词'};
    }

    async applyCandidate(
        query: TrackLyricsQuery,
        candidate: LyricsCandidate,
        manuallySelected: boolean,
        signal: AbortSignal
    ): Promise<LyricsLoadResult> {
        const document = await this.fetchCandidate(query, candidate, manuallySelected, signal);
        return this.persist(query.trackId, document);
    }

    async applyPreview(query: TrackLyricsQuery, preview: LyricsCandidatePreview): Promise<LyricsLoadResult> {
        return this.persist(query.trackId, preview.document);
    }

    async previewCandidate(
        query: TrackLyricsQuery,
        candidate: LyricsCandidate,
        signal: AbortSignal
    ): Promise<LyricsCandidatePreview> {
        const provider = this.providers.get(candidate.providerId);
        if (!provider) throw new Error('未知歌词来源');
        const payload = await provider.fetch(candidate, signal);
        const source: LyricsSourceRef = {
            kind: 'provider',
            providerId: candidate.providerId,
            candidateId: candidate.candidateId,
            manuallySelected: true
        };
        return {
            document: this.normalizer.fromPayload(payload, this.createContext(query, source)),
            format: payload.kind,
            ...(payload.fallbackFrom ? {fallbackFrom: payload.fallbackFrom} : {}),
            ...(payload.fallbackReason ? {fallbackReason: payload.fallbackReason} : {})
        };
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

    private async fetchCandidate(
        query: TrackLyricsQuery,
        candidate: LyricsCandidate,
        manuallySelected: boolean,
        signal: AbortSignal
    ): Promise<LyricsDocument> {
        const provider = this.providers.get(candidate.providerId);
        if (!provider) throw new Error('未知歌词来源');
        const payload = await provider.fetch(candidate, signal);
        const source: LyricsSourceRef = {
            kind: 'provider',
            providerId: candidate.providerId,
            candidateId: candidate.candidateId,
            manuallySelected
        };
        return this.normalizer.fromPayload(payload, this.createContext(query, source));
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

function isManualBinding(binding: LyricsBinding): boolean {
    return binding.source.kind === 'provider' && binding.source.manuallySelected;
}

function isWordTimed(document: LyricsDocument): boolean {
    if (document.ttml.metadata.timingMode === 'Word') return true;
    return document.render.lines.some(line => line.words.length > 1);
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
