import type {Track} from "@api/types/library";
import {coverLookupService} from "@/features/mediaAssets/service/CoverLookupService";
import {userDataService} from "@/features/userData/service";
import type {DiaryData, MoodData} from "@api/types/userdata";
import {libraryDataService} from "./LibraryDataService";

export interface LibraryArtistInfo {
    name: string;
    tracks: Track[];
    albums: Set<string>;
    totalDuration: number;
    cover: string | null;
}

export interface LibraryAlbumItem {
    key: string;
    name: string;
    artist: string;
    year: string | number | null;
    cover: string | null;
    tracks: Track[];
    totalDuration: number;
    album?: string;
}

export interface AlbumGroupingOptions {
    splitByArtist?: boolean;
}

export type SortDirection = 'asc' | 'desc';
export type ArtistSortKey = 'name' | 'tracks';
export type AlbumSortKey = 'name' | 'artist' | 'tracks' | 'year';

export interface CoverLookupResult {
    success?: boolean;
    imageUrl?: string;
    error?: string;
}

export interface StatisticsPageData {
    tracks: Track[];
    moodHistory: MoodData[];
    diaryHistory: DiaryData[];
}

export class LibraryPageDataService {
    async getTracks(): Promise<Track[]> {
        return await libraryDataService.getTracks();
    }

    async getHomeTracks(): Promise<Track[]> {
        return await this.getTracks();
    }

    async getArtists(): Promise<{tracks: Track[]; artists: LibraryArtistInfo[]}> {
        const tracks = await this.getTracks();
        return {
            tracks,
            artists: this.buildArtists(tracks)
        };
    }

    async getAlbums(
        sortBy: AlbumSortKey = 'name',
        sortDirection: SortDirection = 'asc',
        options: AlbumGroupingOptions = {}
    ): Promise<{tracks: Track[]; albums: LibraryAlbumItem[]}> {
        const tracks = await this.getTracks();
        const albums = this.buildAlbums(tracks, options);
        this.sortAlbums(albums, sortBy, sortDirection);
        return {tracks, albums};
    }

    async getStatisticsPageData(): Promise<StatisticsPageData> {
        const [tracks, moodHistory, diaryHistory] = await Promise.all([
            this.getTracks(),
            userDataService.getMoodHistory(),
            userDataService.getDiaryHistory()
        ]);

        return {tracks, moodHistory, diaryHistory};
    }

    async findArtistCover(artistName: string): Promise<CoverLookupResult> {
        return await coverLookupService.getCover('', artistName.trim(), '', null, false) as CoverLookupResult;
    }

    async findAlbumCover(artistName: string, albumName: string): Promise<CoverLookupResult> {
        return await coverLookupService.getCover('', artistName.trim(), albumName.trim(), null, false) as CoverLookupResult;
    }

    async findCollectionCover(
        tracks: Track[],
        artistName: string,
        albumName: string,
        allowNetwork: boolean,
        signal?: AbortSignal
    ): Promise<CoverLookupResult> {
        for (const track of tracks) {
            signal?.throwIfAborted();
            if (!track.filePath) continue;
            const result = await coverLookupService.getCover(
                track.title,
                track.artist,
                track.album,
                track.filePath,
                false,
                {allowNetwork: false, signal}
            ) as CoverLookupResult;
            if (result.success && result.imageUrl) {
                track.cover = result.imageUrl;
                return result;
            }
        }

        if (!allowNetwork) {
            return {success: false, error: '自动联网获取封面已关闭'};
        }
        return await coverLookupService.getCover(
            '',
            artistName.trim(),
            albumName.trim(),
            null,
            false,
            {allowNetwork: true, signal}
        ) as CoverLookupResult;
    }

    buildArtists(tracks: Track[]): LibraryArtistInfo[] {
        const artistMap = new Map<string, LibraryArtistInfo>();
        tracks.forEach((track) => {
            const artistName = track.artist || '未知艺术家';

            if (!artistMap.has(artistName)) {
                artistMap.set(artistName, {
                    name: artistName,
                    tracks: [],
                    albums: new Set(),
                    totalDuration: 0,
                    cover: null
                });
            }

            const artist = artistMap.get(artistName)!;
            artist.tracks.push(track);
            artist.totalDuration += track.duration || 0;

            if (track.album) {
                artist.albums.add(track.album);
            }

            if (!artist.cover && track.cover) {
                artist.cover = track.cover;
            }
        });

        return Array.from(artistMap.values())
            .sort((a, b) => a.name.localeCompare(b.name, 'zh-CN'));
    }

    sortArtists(
        artists: LibraryArtistInfo[],
        sortBy: ArtistSortKey,
        direction: SortDirection
    ): void {
        const multiplier = direction === 'asc' ? 1 : -1;
        artists.sort((a, b) => {
            const result = sortBy === 'tracks'
                ? a.tracks.length - b.tracks.length
                : a.name.localeCompare(b.name, 'zh-CN');
            return result === 0
                ? a.name.localeCompare(b.name, 'zh-CN')
                : result * multiplier;
        });
    }

    buildAlbums(tracks: Track[], options: AlbumGroupingOptions = {}): LibraryAlbumItem[] {
        const map = new Map<string, LibraryAlbumItem>();
        tracks.forEach(track => {
            const rawAlbumName = String(track.album || '').trim();
            const albumName = rawAlbumName || '未知专辑';
            const albumArtist = String(track.albumArtist || track.albumartist || track.artist || '未知艺术家').trim();
            const normalizedAlbumName = this.normalizeGroupingValue(albumName);
            const normalizedArtist = this.normalizeGroupingValue(albumArtist);
            const shouldIncludeArtist = options.splitByArtist === true || !rawAlbumName;
            const key = shouldIncludeArtist
                ? `${normalizedAlbumName}:::${normalizedArtist}`
                : normalizedAlbumName;
            if (!map.has(key)) {
                map.set(key, {
                    key,
                    name: albumName,
                    artist: albumArtist,
                    year: track.year || null,
                    cover: track.cover || null,
                    tracks: [],
                    totalDuration: 0
                });
            }

            const album = map.get(key)!;
            album.tracks.push(track);
            if (album.artist !== albumArtist) {
                album.artist = '多位艺术家';
            }
            album.totalDuration += track.duration || 0;
            if (!album.cover && track.cover) album.cover = track.cover;
            if (!album.year && track.year) album.year = track.year;
        });

        const albums = Array.from(map.values());
        albums.forEach((album) => {
            album.tracks.sort((a, b) => {
                const diskA = Number(a.diskNumber ?? a.disc ?? 0);
                const diskB = Number(b.diskNumber ?? b.disc ?? 0);
                const trackA = Number(a.trackNumber ?? a.track ?? 0);
                const trackB = Number(b.trackNumber ?? b.track ?? 0);
                return diskA - diskB || trackA - trackB;
            });
        });
        return albums;
    }

    sortAlbums(
        albums: LibraryAlbumItem[],
        sortBy: AlbumSortKey,
        direction: SortDirection
    ): void {
        const multiplier = direction === 'asc' ? 1 : -1;
        albums.sort((a, b) => {
            if (sortBy === 'year') {
                const yearA = Number(a.year || 0);
                const yearB = Number(b.year || 0);
                if (!yearA || !yearB) {
                    if (!yearA && !yearB) return a.name.localeCompare(b.name, 'zh-CN');
                    return yearA ? -1 : 1;
                }
                const result = yearA - yearB;
                return result === 0 ? a.name.localeCompare(b.name, 'zh-CN') : result * multiplier;
            }

            const result = sortBy === 'artist'
                ? a.artist.localeCompare(b.artist, 'zh-CN')
                : sortBy === 'tracks'
                    ? a.tracks.length - b.tracks.length
                    : a.name.localeCompare(b.name, 'zh-CN');
            return result === 0
                ? a.name.localeCompare(b.name, 'zh-CN')
                : result * multiplier;
        });
    }

    private normalizeGroupingValue(value: string): string {
        return value.trim().replace(/\s+/g, ' ').toLocaleLowerCase();
    }
}

export const libraryPageDataService = new LibraryPageDataService();
