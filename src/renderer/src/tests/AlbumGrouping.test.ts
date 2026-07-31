import {afterEach, describe, expect, it, vi} from 'vitest';
import type {Track} from '../api/types/library';
import {libraryPageDataService} from '../features/library/service/LibraryPageDataService';
import {coverLookupService} from '../features/mediaAssets/service/CoverLookupService';
import {settingsStore} from '../features/settings/service/SettingsStore';

const createTrack = (overrides: Partial<Track>): Track => ({
    title: '歌曲',
    artist: '艺术家',
    album: '专辑',
    filePath: `C:/music/${Math.random()}.flac`,
    ...overrides
});

afterEach(() => {
    vi.restoreAllMocks();
});

describe('专辑分组', () => {
    it('默认合并不同艺术家的同名专辑', () => {
        const albums = libraryPageDataService.buildAlbums([
            createTrack({artist: '甲', album: ' 合辑 '}),
            createTrack({artist: '乙', album: '合辑'})
        ]);

        expect(albums).toHaveLength(1);
        expect(albums[0].artist).toBe('多位艺术家');
        expect(albums[0].tracks).toHaveLength(2);
    });

    it('可按艺术家拆分同名专辑', () => {
        const albums = libraryPageDataService.buildAlbums([
            createTrack({artist: '甲', album: '合辑'}),
            createTrack({artist: '乙', album: '合辑'})
        ], {splitByArtist: true});

        expect(albums).toHaveLength(2);
    });

    it('未知专辑即使默认合并也按艺术家分开', () => {
        const albums = libraryPageDataService.buildAlbums([
            createTrack({artist: '甲', album: ''}),
            createTrack({artist: '乙', album: undefined})
        ]);

        expect(albums).toHaveLength(2);
    });

    it('按碟号和曲序排列专辑歌曲', () => {
        const albums = libraryPageDataService.buildAlbums([
            createTrack({title: '第三首', diskNumber: 2, trackNumber: 1}),
            createTrack({title: '第二首', diskNumber: 1, trackNumber: 2}),
            createTrack({title: '第一首', diskNumber: 1, trackNumber: 1})
        ]);

        expect(albums[0].tracks.map(track => track.title)).toEqual(['第一首', '第二首', '第三首']);
    });
});

describe('媒体库浏览排序', () => {
    it('艺术家名称和歌曲数均支持双向排序', () => {
        const artists = libraryPageDataService.buildArtists([
            createTrack({artist: '乙'}),
            createTrack({artist: '甲'}),
            createTrack({artist: '乙', title: '第二首'})
        ]);

        libraryPageDataService.sortArtists(artists, 'tracks', 'desc');
        expect(artists.map(artist => artist.name)).toEqual(['乙', '甲']);

        libraryPageDataService.sortArtists(artists, 'name', 'asc');
        expect(artists.map(artist => artist.name)).toEqual(['甲', '乙']);
    });

    it('专辑歌曲数支持双向排序并保持名称次序稳定', () => {
        const albums = libraryPageDataService.buildAlbums([
            createTrack({album: '乙'}),
            createTrack({album: '甲'}),
            createTrack({album: '乙', title: '第二首'})
        ]);

        libraryPageDataService.sortAlbums(albums, 'tracks', 'desc');
        expect(albums.map(album => album.name)).toEqual(['乙', '甲']);

        libraryPageDataService.sortAlbums(albums, 'tracks', 'asc');
        expect(albums.map(album => album.name)).toEqual(['甲', '乙']);
    });

    it('未知年份始终位于已知年份之后', () => {
        const albums = libraryPageDataService.buildAlbums([
            createTrack({album: '未知', year: undefined}),
            createTrack({album: '较早', year: 2001}),
            createTrack({album: '较晚', year: 2020})
        ]);

        libraryPageDataService.sortAlbums(albums, 'year', 'asc');
        expect(albums.map(album => album.name)).toEqual(['较早', '较晚', '未知']);

        libraryPageDataService.sortAlbums(albums, 'year', 'desc');
        expect(albums.map(album => album.name)).toEqual(['较晚', '较早', '未知']);
    });
});

describe('媒体库页面设置', () => {
    it('默认合并专辑并使用媒体库方格视图', () => {
        const settings = settingsStore.getInitialValues({});

        expect(settings.splitAlbumsByArtist).toBe(false);
        expect(settings.artistViewMode).toBe('grid');
        expect(settings.albumViewMode).toBe('grid');
    });

    it('保留专辑拆分和独立列表设置', () => {
        const settings = settingsStore.getInitialValues({
            splitAlbumsByArtist: true,
            artistViewMode: 'list',
            albumViewMode: 'list'
        });

        expect(settings.splitAlbumsByArtist).toBe(true);
        expect(settings.artistViewMode).toBe('list');
        expect(settings.albumViewMode).toBe('list');
    });
});

describe('集合封面', () => {
    it('关闭联网时仍优先读取音乐文件内嵌封面', async () => {
        const track = createTrack({filePath: 'C:/music/embedded.flac'});
        const getCover = vi.spyOn(coverLookupService, 'getCover').mockResolvedValue({
            success: true,
            imageUrl: 'blob:embedded-cover'
        });

        const result = await libraryPageDataService.findCollectionCover(
            [track],
            track.artist,
            track.album || '',
            false
        );

        expect(result.imageUrl).toBe('blob:embedded-cover');
        expect(track.cover).toBe('blob:embedded-cover');
        expect(getCover).toHaveBeenCalledWith(
            track.title,
            track.artist,
            track.album,
            track.filePath,
            false,
            expect.objectContaining({allowNetwork: false})
        );
    });

    it('本地封面缺失且允许联网时才执行集合级联网回退', async () => {
        const track = createTrack({filePath: 'C:/music/no-cover.flac'});
        const getCover = vi.spyOn(coverLookupService, 'getCover')
            .mockResolvedValueOnce({success: false})
            .mockResolvedValueOnce({success: true, imageUrl: 'https://example.test/cover.jpg'});

        const result = await libraryPageDataService.findCollectionCover(
            [track],
            '艺术家',
            '专辑',
            true
        );

        expect(result.imageUrl).toBe('https://example.test/cover.jpg');
        expect(getCover).toHaveBeenLastCalledWith(
            '',
            '艺术家',
            '专辑',
            null,
            false,
            expect.objectContaining({allowNetwork: true})
        );
    });
});
