import type {Track} from '@api/types/track';

export function buildTtmlExportName(track: Track): string {
    const pathName = String(track.filePath || track.path || '').split(/[\\/]/).pop() || '';
    const sourceName = pathName || String(track.fileName || '');
    const baseName = sourceName.replace(/\.[^.]*$/, '');
    const safeName = baseName
        .replace(/[<>:"/\\|?*\u0000-\u001f]/g, '_')
        .replace(/[. ]+$/g, '')
        .trim();
    return `${safeName || 'lyrics'}.ttml`;
}
