import type {AmllLyricResult, TTMLResult} from '@applemusic-like-lyrics/ttml';

export interface TrackLyricsQuery {
    trackId: string;
    title: string;
    artists: string[];
    album?: string;
    durationMs?: number;
    filePath?: string;
}

export interface LyricsCapabilities {
    lineTimed?: boolean;
    wordTimed?: boolean;
    translation?: boolean;
    romanization?: boolean;
    ruby?: boolean;
    ttml?: boolean;
}

export interface LyricsCandidate {
    providerId: string;
    candidateId: string;
    title: string;
    artists: string[];
    album?: string;
    durationMs?: number;
    identityScore: number;
    qualityScore: number;
    capabilities?: LyricsCapabilities;
    providerData?: unknown;
}

export interface LyricsPayloadFallback {
    fallbackFrom?: 'ttml' | 'yrc' | 'qrc' | 'krc';
    fallbackReason?: 'source-unavailable';
}

export type ProviderLyricsPayload = (
    | {kind: 'ttml'; ttml: string}
    | {kind: 'lrc'; lyrics: string; translation?: string; romanization?: string}
    | {kind: 'yrc'; lyrics: string; translation?: string; romanization?: string}
    | {kind: 'qrc'; lyrics: string; translation?: string; romanization?: string; romanizationQrc?: string}
    | {kind: 'krc'; bytes: Uint8Array}
) & LyricsPayloadFallback;

export type LyricsSourceRef =
    | {kind: 'local'; path: string}
    | {kind: 'embedded'; trackId: string}
    | {
        kind: 'provider';
        providerId: string;
        candidateId: string;
    };

export type LyricsSelectionMode = 'auto' | 'manual';

export interface LyricsDocument {
    ttmlText: string;
    ttml: TTMLResult;
    render: AmllLyricResult;
    source: LyricsSourceRef;
}

export interface LyricsCandidatePreview {
    document: LyricsDocument;
    format: ProviderLyricsPayload['kind'];
    fallbackFrom?: LyricsPayloadFallback['fallbackFrom'];
    fallbackReason?: LyricsPayloadFallback['fallbackReason'];
}

export interface NormalizeContext {
    source: LyricsSourceRef;
    durationMs?: number;
    title?: string;
    artists?: string[];
    album?: string;
    translationLanguage?: string;
    romanizationLanguage?: string;
}

export interface AuxiliaryLyrics {
    translation?: string;
    romanization?: string;
    romanizationQrc?: string;
}

export interface LyricsBinding {
    trackId: string;
    canonicalTtmlPath: string;
    source: LyricsSourceRef;
    selectionMode: LyricsSelectionMode;
    updatedAt: number;
}

export type LyricsErrorCode = 'NOT_FOUND' | 'NETWORK' | 'PARSE' | 'INVALID_FORMAT' | 'CANCELLED';
