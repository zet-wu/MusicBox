import type {Track} from "@api/types/track";

type LyricsTrack = Track;

function getLyricsTrackIdentity(track: LyricsTrack): string {
    const stableIdentity = track.fileId || track.filePath || track.path || track.id;
    if (stableIdentity) {
        return String(stableIdentity).replace(/\\/g, '/');
    }

    return `${track.title}\u0000${track.artist}\u0000${track.album || ''}`;
}

export {getLyricsTrackIdentity};
export type {LyricsTrack};
