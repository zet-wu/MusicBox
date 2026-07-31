import {describe, expect, it} from 'vitest';
import type {Track} from '../api/types/library';
import {libraryPageDataService} from '../features/library/service/LibraryPageDataService';
import {settingsStore} from '../features/settings/service/SettingsStore';

const createTrack = (overrides: Partial<Track>): Track => ({
    title: '歌曲',
    artist: '艺术家',
    album: '专辑',
    filePath: `C:/music/${Math.random()}.flac`,
    ...overrides
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

describe('媒体库页面设置', () => {
    it('默认合并专辑并使用艺术家方格视图', () => {
        const settings = settingsStore.getInitialValues({});

        expect(settings.splitAlbumsByArtist).toBe(false);
        expect(settings.artistViewMode).toBe('grid');
    });

    it('保留专辑拆分和艺术家列表设置', () => {
        const settings = settingsStore.getInitialValues({
            splitAlbumsByArtist: true,
            artistViewMode: 'list'
        });

        expect(settings.splitAlbumsByArtist).toBe(true);
        expect(settings.artistViewMode).toBe('list');
    });
});
