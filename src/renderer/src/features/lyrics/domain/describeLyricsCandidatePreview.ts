import type {LyricsCandidatePreview, LyricsDocument} from './types';

export function describeLyricsCandidatePreview(preview: LyricsCandidatePreview): string[] {
    const [timing, ...features] = describeLyricsDocument(preview.document);
    return [
        preview.format.toUpperCase(),
        timing,
        preview.fallbackReason === 'source-unavailable' && preview.fallbackFrom
            ? `来源无 ${preview.fallbackFrom.toUpperCase()}`
            : false,
        ...features
    ].filter((label): label is string => Boolean(label));
}

export function describeLyricsDocument(document: LyricsDocument): string[] {
    const lines = document.render.lines;
    const labels = [
        document.ttml.metadata.timingMode === 'Word' || lines.some(line => line.words.length > 1) ? '逐字' : '逐行',
        lines.some(line => Boolean(line.translatedLyric?.trim())) && '翻译',
        lines.some(line => Boolean(line.romanLyric?.trim()) || line.words.some(word => Boolean(word.romanWord?.trim()))) && '音译',
        lines.some(line => line.words.some(word => Boolean(word.ruby?.length))) && '假名'
    ];
    return labels.filter((label): label is string => Boolean(label));
}
