import {lyricsGateway} from '@/infrastructure/electron';
import type {ProviderLyricsPayload, TrackLyricsQuery} from '../domain/types';

export class EmbeddedLyricsSource {
    async find(query: TrackLyricsQuery): Promise<ProviderLyricsPayload | null> {
        if (!query.filePath) return null;
        const result = await lyricsGateway.getEmbedded(query.filePath);
        const embedded = result.lyrics;
        if (!result.success || !embedded?.text?.trim()) return null;

        const text = embedded.text.replace(/^\uFEFF/, '').trim();
        const format = embedded.format?.toLowerCase();
        if (format === 'ttml' || /^<\?xml|^<tt[\s>]/i.test(text)) {
            return {kind: 'ttml', ttml: text};
        }
        if (format === 'lrc' || hasLrcTimestamp(text)) {
            return {kind: 'lrc', lyrics: text};
        }
        if (embedded.synchronized && embedded.timestamps?.length) {
            return {
                kind: 'lrc',
                lyrics: embedded.timestamps
                    .map(item => `[${formatTimestamp(item.time)}]${item.text}`)
                    .join('\n')
            };
        }
        return null;
    }
}

function hasLrcTimestamp(text: string): boolean {
    return /^\[\d{1,3}:\d{2}(?:[.:]\d{1,3})?]/m.test(text);
}

function formatTimestamp(seconds: number): string {
    const milliseconds = Math.max(0, Math.round(seconds * 1000));
    const minutesPart = Math.floor(milliseconds / 60_000);
    const secondsPart = Math.floor((milliseconds % 60_000) / 1000);
    const millisecondsPart = milliseconds % 1000;
    return `${String(minutesPart).padStart(2, '0')}:${String(secondsPart).padStart(2, '0')}.${String(millisecondsPart).padStart(3, '0')}`;
}
