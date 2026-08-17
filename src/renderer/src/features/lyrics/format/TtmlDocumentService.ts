import {
    TTMLGenerator,
    TTMLParser,
    toAmllLyrics,
    type AmllLyricResult,
    type GeneratorOptions,
    type TTMLParserOptions,
    type TTMLResult,
    type TTMLToAmllOptions
} from '@applemusic-like-lyrics/ttml';

export interface TtmlDomAdapters {
    parser?: TTMLParserOptions['domParser'];
    implementation?: GeneratorOptions['domImplementation'];
    serializer?: GeneratorOptions['xmlSerializer'];
}

export class TtmlDocumentService {
    private readonly parser: TTMLParser;
    private readonly generator: TTMLGenerator;

    constructor(adapters: TtmlDomAdapters = {}) {
        this.parser = new TTMLParser(adapters.parser ? {domParser: adapters.parser} : undefined);
        this.generator = new TTMLGenerator(
            adapters.implementation && adapters.serializer
                ? {
                    domImplementation: adapters.implementation,
                    xmlSerializer: adapters.serializer,
                    useSidecar: true
                }
                : {useSidecar: true}
        );
    }

    parse(ttmlText: string): TTMLResult {
        if (!ttmlText.trim()) {
            throw new Error('TTML 内容为空');
        }
        return this.parser.parse(ttmlText);
    }

    serialize(document: TTMLResult): string {
        return this.generator.generate(document);
    }

    project(document: TTMLResult, options: TTMLToAmllOptions = {}): AmllLyricResult {
        return toAmllLyrics(document, options);
    }
}
