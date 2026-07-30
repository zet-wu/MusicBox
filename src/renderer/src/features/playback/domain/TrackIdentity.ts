import type {Track} from '@api/types/track';

function normalizeTrackPath(value: unknown): string | null {
    if (typeof value !== 'string') {
        return null;
    }

    const normalized = value.trim().replace(/\\/g, '/');
    return normalized || null;
}

export function getTrackPath(track: Track | null | undefined): string | null {
    return normalizeTrackPath(track?.filePath) || normalizeTrackPath(track?.path);
}

export function isSameTrack(
    left: Track | null | undefined,
    right: Track | null | undefined
): boolean {
    if (!left || !right) {
        return false;
    }

    if (left.fileId && right.fileId && left.fileId === right.fileId) {
        return true;
    }

    const leftPath = getTrackPath(left);
    const rightPath = getTrackPath(right);
    return leftPath !== null && rightPath !== null && leftPath === rightPath;
}

export function deduplicateTracks(tracks: Track[]): Track[] {
    return tracks.filter((track, index) => (
        tracks.findIndex((candidate) => isSameTrack(candidate, track)) === index
    ));
}
