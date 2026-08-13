import type {LyricLine} from "@api/types/lyrics";
import type {Track} from "@api/types/track";

type WordLyric = {
    text: string;
    time: number;
    endTime?: number;
};

type RenderLyricLine = LyricLine & {
    type?: string;
    words?: WordLyric[];
    endTime?: number;
};

type LyricsTrack = Track & {
    path?: string;
    lyrics?: string | RenderLyricLine[];
    lrcText?: string;
    lyricsContent?: string;
    lyricsFormat?: string;
};

function getLyricsTrackIdentity(track: LyricsTrack): string {
    const stableIdentity = track.fileId || track.filePath || track.path || track.id;
    if (stableIdentity) {
        return String(stableIdentity).replace(/\\/g, '/');
    }

    return `${track.title}\u0000${track.artist}\u0000${track.album || ''}`;
}

export {getLyricsTrackIdentity};
export type {LyricsTrack, RenderLyricLine, WordLyric};
