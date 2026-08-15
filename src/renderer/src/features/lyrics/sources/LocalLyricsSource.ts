import {lyricsGateway} from '@/infrastructure/electron';
import type {TrackLyricsQuery} from '../domain/types';

export interface LocalLyricsPayload {
    path: string;
    kind: 'ttml' | 'lrc';
    content: string;
}

export class LocalLyricsSource {
    constructor(private readonly getDirectory: () => string | null) {}

    async find(query: TrackLyricsQuery): Promise<LocalLyricsPayload | null> {
        const directory = this.getDirectory();
        if (!directory) return null;

        for (const kind of ['ttml', 'lrc'] as const) {
            const result = await lyricsGateway.searchLocalFiles(
                directory,
                query.title,
                query.artists.join(', '),
                query.album ?? '',
                `.${kind}`
            );
            if (!result.success || !result.filePath) continue;

            const content = await lyricsGateway.readLocalFile(result.filePath);
            if (content.success && content.content?.trim()) {
                return {path: result.filePath, kind, content: content.content};
            }
        }
        return null;
    }
}
