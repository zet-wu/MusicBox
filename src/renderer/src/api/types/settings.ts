export type WasapiShareMode = 'exclusive' | 'shared';
export type PlaylistInfoAlignment = 'left' | 'center' | 'right';
export type ArtistViewMode = 'grid' | 'list';
export type AlbumViewMode = 'grid' | 'list';
export type PlaylistViewMode = 'grid' | 'list';
export type FolderSourceViewMode = 'grid' | 'list';

export interface DesktopLyricsSettings {
    color?: string;
    fontSize?: number;
    opacity?: number;
    alwaysOnTop?: boolean;
    clickThrough?: boolean;
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
    artistViewMode?: ArtistViewMode;
    albumViewMode?: AlbumViewMode;
    playlistViewMode?: PlaylistViewMode;
    folderSourceViewMode?: FolderSourceViewMode;
    splitAlbumsByArtist?: boolean;
    showTrackCovers?: boolean;
    autoFetchMissingTrackCovers?: boolean;
    gaplessPlayback?: boolean;
    playlistInfoAlignment?: PlaylistInfoAlignment;
    lyricsFontFamily?: string;
    lyricsCustomLatinFont?: string;
    lyricsCustomCjkFont?: string;
    lyricsFontSize?: number | null;
    exclusiveMode?: boolean;
    wasapiShareMode?: WasapiShareMode;
    [key: string]: unknown;
}
