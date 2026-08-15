import {
    parseLrc,
    parseQrc,
    parseYrc,
    type LyricLine as ParsedLyricLine
} from '@applemusic-like-lyrics/lyric';
import {
    toTTMLResult,
    type AmllLyricLine,
    type AmllMetadata,
    type LyricLine,
    type TTMLResult
} from '@applemusic-like-lyrics/ttml';
import type {
    AuxiliaryLyrics,
    LyricsDocument,
    NormalizeContext,
    ProviderLyricsPayload
} from '../domain/types';
import {CompanionLyricsMerger} from './CompanionLyricsMerger';
import {parseKrc} from './krc/parseKrc';
import {TtmlDocumentService} from './TtmlDocumentService';

type ParsedFormat = 'lrc' | 'yrc' | 'qrc';

export class LyricsNormalizer {
    constructor(
        private readonly ttmlService = new TtmlDocumentService(),
        private readonly companionMerger = new CompanionLyricsMerger()
    ) {}

    fromPayload(payload: ProviderLyricsPayload, context: NormalizeContext): LyricsDocument {
        switch (payload.kind) {
            case 'ttml':
                return this.fromTtml(payload.ttml, context);
            case 'lrc':
                return this.fromLrc(payload.lyrics, context, payload);
            case 'yrc':
                return this.fromYrc(payload.lyrics, payload, context);
            case 'qrc':
                return this.fromQrc(payload.lyrics, payload, context);
            case 'krc':
                return this.fromKrc(payload.bytes, context);
        }
    }

    fromTtml(ttmlText: string, context: NormalizeContext): LyricsDocument {
        const document = this.ttmlService.parse(ttmlText);
        return this.createDocument(ttmlText, document, context);
    }

    fromLrc(lrc: string, context: NormalizeContext, auxiliary: AuxiliaryLyrics = {}): LyricsDocument {
        return this.fromParsedLines(parseLrc(lrc), 'lrc', auxiliary, context);
    }

    fromYrc(yrc: string, auxiliary: AuxiliaryLyrics, context: NormalizeContext): LyricsDocument {
        return this.fromParsedLines(parseYrc(yrc), 'yrc', auxiliary, context);
    }

    fromQrc(qrc: string, auxiliary: AuxiliaryLyrics, context: NormalizeContext): LyricsDocument {
        return this.fromParsedLines(parseQrc(qrc), 'qrc', auxiliary, context);
    }

    fromKrc(bytes: Uint8Array, context: NormalizeContext): LyricsDocument {
        const parsed = parseKrc(bytes);
        const document: TTMLResult = {
            metadata: {
                ...this.createStructuredMetadata(context),
                timingMode: 'Word'
            },
            lines: parsed.lines.map(line => ({
                text: line.text,
                startTime: line.startTime,
                endTime: line.endTime,
                words: line.words,
                translations: line.translation ? [{text: line.translation}] : undefined,
                romanizations: line.romanization
                    ? [{text: line.romanization, words: line.romanizationWords}]
                    : undefined
            }))
        };
        const ttmlText = this.ttmlService.serialize(document);
        return this.createDocument(ttmlText, this.ttmlService.parse(ttmlText), context);
    }

    private fromParsedLines(
        lines: ParsedLyricLine[],
        format: ParsedFormat,
        auxiliary: AuxiliaryLyrics,
        context: NormalizeContext
    ): LyricsDocument {
        if (lines.length === 0) {
            throw new Error(`${format.toUpperCase()} 未包含可用歌词`);
        }

        const document = format === 'lrc'
            ? this.createLineTimedDocument(lines, context)
            : toTTMLResult(lines as AmllLyricLine[], this.createMetadata(context));

        this.companionMerger.mergeLrc(document, auxiliary.translation, 'translation');
        this.companionMerger.mergeLrc(document, auxiliary.romanization, 'romanization');

        const ttmlText = this.ttmlService.serialize(document);
        const validatedDocument = this.ttmlService.parse(ttmlText);
        return this.createDocument(ttmlText, validatedDocument, context);
    }

    private createLineTimedDocument(lines: ParsedLyricLine[], context: NormalizeContext): TTMLResult {
        const normalizedLines: LyricLine[] = lines.map((line, index) => {
            const nextStart = lines[index + 1]?.startTime;
            const durationEnd = context.durationMs && context.durationMs >= line.startTime
                ? context.durationMs
                : undefined;
            const endTime = nextStart ?? durationEnd ?? line.endTime;
            return {
                text: line.words.map(word => word.word).join(''),
                startTime: line.startTime,
                endTime
            };
        });

        return {
            metadata: {
                ...this.createStructuredMetadata(context),
                timingMode: 'Line'
            },
            lines: normalizedLines
        };
    }

    private createMetadata(context: NormalizeContext): AmllMetadata[] {
        const metadata: AmllMetadata[] = [];
        if (context.title) metadata.push(['musicName', [context.title]]);
        if (context.artists?.length) metadata.push(['artists', context.artists]);
        if (context.album) metadata.push(['album', [context.album]]);
        return metadata;
    }

    private createStructuredMetadata(context: NormalizeContext): TTMLResult['metadata'] {
        return {
            title: context.title ? [context.title] : undefined,
            artist: context.artists,
            album: context.album ? [context.album] : undefined
        };
    }

    private createDocument(ttmlText: string, ttml: TTMLResult, context: NormalizeContext): LyricsDocument {
        return {
            ttmlText,
            ttml,
            render: this.ttmlService.project(ttml, {
                translationLanguage: context.translationLanguage,
                romanizationLanguage: context.romanizationLanguage
            }),
            source: context.source
        };
    }
}
