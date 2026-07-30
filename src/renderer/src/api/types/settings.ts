export type WasapiShareMode = 'exclusive' | 'shared';
export type PlaylistDoubleClickMode = 'shuffle' | 'sequence';
export type PlaylistInfoAlignment = 'left' | 'center' | 'right';

export interface DesktopLyricsSettings {
    fontSize?: number;
    opacity?: number;
    alwaysOnTop?: boolean;
    clickThrough?: boolean;
    theme?: string;
    [key: string]: unknown;
}

export interface MusicBoxSettings {
    rememberPosition?: boolean;
    autoplay?: boolean;
    desktopLyrics?: boolean;
    desktopLyricsSettings?: DesktopLyricsSettings;
    networkDriveEnabled?: boolean;
    statistics?: boolean;
    recentPlay?: boolean;
    artistsPage?: boolean;
    albumsPage?: boolean;
    showTrackCovers?: boolean;
    gaplessPlayback?: boolean;
    playlistDoubleClickMode?: PlaylistDoubleClickMode;
    playlistInfoAlignment?: PlaylistInfoAlignment;
    exclusiveMode?: boolean;
    wasapiShareMode?: WasapiShareMode;
    [key: string]: unknown;
}
