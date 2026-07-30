import type {PlaylistDoubleClickMode} from "@api/types/settings";

interface PlaylistDoubleClickSettings {
    playlistDoubleClickMode?: PlaylistDoubleClickMode;
}

export function resolvePlaylistDoubleClickMode(
    settings: PlaylistDoubleClickSettings | null | undefined
): PlaylistDoubleClickMode {
    return settings?.playlistDoubleClickMode === 'sequence' ? 'sequence' : 'shuffle';
}
