import {ElectronNamespaceAdapter} from './ElectronBridge';
import type {EmbeddedLyricsData} from '@api/types/electron';
import type {LyricsBinding, LyricsSourceRef} from '@/features/lyrics/domain/types';

export interface LocalLyricsFileResult {
    success: boolean;
    filePath?: string;
    fileName?: string;
    error?: string;
}

export interface LocalLyricsContentResult {
    success: boolean;
    content?: string;
    error?: string;
}

export interface EmbeddedLyricsResult {
    success: boolean;
    lyrics?: EmbeddedLyricsData;
    source?: string;
    error?: string;
}

class LyricsGateway extends ElectronNamespaceAdapter<'lyrics'> {
    constructor() {
        super('lyrics');
    }

    readLocalFile(filePath: string): Promise<LocalLyricsContentResult> {
        return this.call('readLocalFile', filePath);
    }

    searchLocalFiles(
        lyricsDir: string,
        title: string,
        artist: string,
        album: string,
        extension: string
    ): Promise<LocalLyricsFileResult> {
        return this.call('searchLocalFiles', lyricsDir, title, artist, album, extension);
    }

    saveToLocal(
        lyricsDir: string,
        title: string,
        artist: string,
        album: string,
        content: string,
        format: string
    ): Promise<LocalLyricsFileResult> {
        return this.call('saveToLocal', lyricsDir, title, artist, album, content, format);
    }

    getEmbedded(filePath: string): Promise<EmbeddedLyricsResult> {
        return this.call('getEmbedded', filePath);
    }

    readCanonical(trackId: string): Promise<{
        success: boolean;
        binding?: LyricsBinding;
        ttml?: string;
        error?: string;
    }> {
        return this.call('readCanonical', trackId);
    }

    getBinding(trackId: string): Promise<{success: boolean; binding?: LyricsBinding | null; error?: string}> {
        return this.call('getBinding', trackId);
    }

    saveCanonical(trackId: string, ttml: string, source: LyricsSourceRef): Promise<{
        success: boolean;
        binding?: LyricsBinding;
        error?: string;
    }> {
        return this.call('saveCanonical', trackId, ttml, source);
    }

    clearBinding(trackId: string): Promise<{success: boolean; cleared?: boolean; error?: string}> {
        return this.call('clearBinding', trackId);
    }

    async providerRequest(input: RequestInfo | URL, init: RequestInit = {}): Promise<Response> {
        const requestId = crypto.randomUUID();
        const signal = init.signal;
        if (signal?.aborted) throw signal.reason ?? new DOMException('请求已取消', 'AbortError');
        const cancel = () => void this.call('cancelProviderRequest', requestId);
        signal?.addEventListener('abort', cancel, {once: true});
        try {
            const result = await this.call<{
                status: number;
                statusText: string;
                body: string;
                headers: Record<string, string>;
            }>('providerRequest', requestId, String(input), {
                method: init.method,
                headers: headersToRecord(init.headers),
                body: typeof init.body === 'string' ? init.body : undefined
            });
            if (signal?.aborted) throw signal.reason ?? new DOMException('请求已取消', 'AbortError');
            return new Response(result.body, {
                status: result.status,
                statusText: result.statusText,
                headers: result.headers ?? {}
            });
        } finally {
            signal?.removeEventListener('abort', cancel);
        }
    }
}

export const lyricsGateway = new LyricsGateway();

function headersToRecord(headers: HeadersInit | undefined): Record<string, string> | undefined {
    if (!headers) return undefined;
    return Object.fromEntries(new Headers(headers).entries());
}
