import {afterEach, describe, expect, it, vi} from 'vitest';
import type {Track} from '../api/types/library';
import {LibraryAppController} from '../features/library/ui-bindings/LibraryAppController';
import {libraryDataService} from '../features/library/service/LibraryDataService';
import {ViewRouter} from '../app/runtime/ViewRouter';
import {flattenRecentTrackRows, groupRecentTracksByDate} from '../features/playback/domain/RecentTrackGrouping';
import {PlaybackAppController} from '../features/playback/ui-bindings/PlaybackAppController';
import {MainContentScrollCoordinator} from '../app/runtime/MainContentScrollCoordinator';

const createTrack = (fileId: string, overrides: Partial<Track> = {}): Track => ({
    fileId,
    title: `歌曲 ${fileId}`,
    artist: '艺术家',
    album: '专辑',
    filePath: `C:/music/${fileId}.flac`,
    ...overrides
});

function createLibraryController(currentView = 'library') {
    const app = {
        currentView,
        library: [] as Track[],
        filteredLibrary: [] as Track[],
        addManagedAPIEventListener: vi.fn(),
        confirm: vi.fn().mockResolvedValue(true),
        showSuccess: vi.fn(),
        showError: vi.fn(),
        showInfo: vi.fn(),
        showCacheLoadingStatus: vi.fn(),
        hideCacheLoadingStatus: vi.fn(),
        showWelcomeScreen: vi.fn(),
        handleViewChange: vi.fn(async (view: string) => {
            app.currentView = view;
        }),
        syncDesktopLyricsButtonState: vi.fn().mockResolvedValue(undefined)
    };
    const ui = {
        removeTrackFromPlaylistDetail: vi.fn().mockResolvedValue(false),
        removeSelectedTracksFromPlaylistDetail: vi.fn().mockResolvedValue(false),
        clearPlaylistDetailSelection: vi.fn(),
        updatePlayerTrackInfo: vi.fn().mockResolvedValue(undefined),
        isPlaylistDetailVisible: vi.fn().mockReturnValue(true),
        updatePlaylistDetailTrack: vi.fn().mockReturnValue(false),
        applySystemCollectionSearchResults: vi.fn().mockReturnValue(true),
        reloadPlaylistDetailTracks: vi.fn().mockResolvedValue(undefined)
    };
    const integrations = {
        getCurrentPlaybackTrack: vi.fn().mockReturnValue(null),
        getPlaybackPlaylist: vi.fn().mockReturnValue([]),
        getCurrentPlaybackIndex: vi.fn().mockReturnValue(-1),
        setPlaybackPlaylist: vi.fn().mockResolvedValue(true)
    };

    return {
        app,
        ui,
        integrations,
        controller: new LibraryAppController({app, ui, integrations})
    };
}

afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
    vi.unstubAllGlobals();
});

describe('歌曲集合搜索与删除', () => {
    it('非歌曲集合页搜索时先导航到全部歌曲页', async () => {
        const {app, controller, ui} = createLibraryController('artists');
        const result = createTrack('result');
        vi.spyOn(libraryDataService, 'searchLibrary').mockResolvedValue([result]);

        await controller.handleSearchQuery('result');

        expect(app.handleViewChange).toHaveBeenCalledWith('library', {preserveSearch: true});
        expect(app.filteredLibrary).toEqual([result]);
        expect(ui.applySystemCollectionSearchResults).toHaveBeenLastCalledWith([result]);
    });

    it('丢弃后返回的旧搜索结果', async () => {
        const {app, controller, ui} = createLibraryController();
        let resolveFirst!: (tracks: Track[]) => void;
        const first = new Promise<Track[]>((resolve) => {
            resolveFirst = resolve;
        });
        const newest = createTrack('newest');
        vi.spyOn(libraryDataService, 'searchLibrary')
            .mockReturnValueOnce(first)
            .mockResolvedValueOnce([newest]);

        const firstSearch = controller.handleSearchQuery('first');
        await controller.handleSearchQuery('newest');
        resolveFirst([createTrack('stale')]);
        await firstSearch;

        expect(app.filteredLibrary).toEqual([newest]);
        expect(ui.applySystemCollectionSearchResults).toHaveBeenLastCalledWith([newest]);
    });

    it('批量删除使用选中歌曲身份而不是过滤列表下标', async () => {
        const {app, controller} = createLibraryController('artists');
        const first = createTrack('first');
        const second = createTrack('second');
        const unrelated = createTrack('unrelated');
        app.library = [unrelated, first, second];
        app.filteredLibrary = [unrelated];
        const removeTrack = vi.spyOn(libraryDataService, 'removeTrack').mockResolvedValue({success: true});

        await controller.handleBatchDelete([second, first, second], second, 0);

        expect(removeTrack.mock.calls.map(([fileId]) => fileId)).toEqual(['second', 'first']);
        expect(app.library).toEqual([unrelated]);
        expect(app.filteredLibrary).toEqual([unrelated]);
    });

    it('用户切换到其他歌曲集合前也会清除当前搜索', async () => {
        const {app, controller, ui} = createLibraryController();
        const result = createTrack('result');
        app.library = [result, createTrack('other')];
        vi.spyOn(libraryDataService, 'searchLibrary').mockResolvedValue([result]);
        await controller.handleSearchQuery('result');

        controller.clearSearchState();

        expect(app.filteredLibrary).toEqual(app.library);
        expect(ui.applySystemCollectionSearchResults).toHaveBeenLastCalledWith(null);
    });

    it('清除查询后丢弃仍在执行的旧搜索结果', async () => {
        const {app, controller, ui} = createLibraryController();
        const original = createTrack('original');
        app.library = [original];
        let resolveSearch!: (tracks: Track[]) => void;
        vi.spyOn(libraryDataService, 'searchLibrary').mockReturnValue(new Promise(resolve => {
            resolveSearch = resolve;
        }));

        const search = controller.handleSearchQuery('stale');
        controller.clearSearchState();
        resolveSearch([createTrack('stale')]);
        await search;

        expect(app.filteredLibrary).toEqual([original]);
        expect(ui.applySystemCollectionSearchResults).toHaveBeenLastCalledWith(null);
    });

    it('取消防抖任务后不再执行旧回调', async () => {
        vi.useFakeTimers();
        vi.stubGlobal('document', {
            readyState: 'loading',
            addEventListener: vi.fn()
        });
        const {debounce} = await import('../utils/index');
        const callback = vi.fn();
        const debounced = debounce(callback, 200);

        debounced('stale');
        debounced.cancel();
        await vi.advanceTimersByTimeAsync(200);

        expect(callback).not.toHaveBeenCalled();
    });

});

describe('页面路由和最近播放索引', () => {
    it('未知路由保持当前页面且不清空内容区', async () => {
        const app = {currentView: 'albums', library: [], filteredLibrary: []};
        const content = {
            hideAllPages: vi.fn(),
            updateSidebarSelection: vi.fn()
        };
        const router = new ViewRouter({
            app,
            content: content as never,
            scroll: new MainContentScrollCoordinator()
        });

        await router.handleViewChange('third-party-view');

        expect(app.currentView).toBe('albums');
        expect(content.hideAllPages).not.toHaveBeenCalled();
    });

    it('重复进入同一视图时不重复隐藏和显示页面', async () => {
        vi.stubGlobal('document', {querySelector: vi.fn(() => null)});
        const app = {currentView: 'home-page', library: [], filteredLibrary: []};
        const content = {
            hideAllPages: vi.fn(),
            updateSidebarSelection: vi.fn(),
            showHomePage: vi.fn().mockResolvedValue(undefined)
        };
        const router = new ViewRouter({
            app,
            content: content as never,
            scroll: new MainContentScrollCoordinator()
        });

        await router.handleViewChange('home-page');
        await router.handleViewChange('home-page');

        expect(content.hideAllPages).toHaveBeenCalledOnce();
        expect(content.showHomePage).toHaveBeenCalledOnce();
    });

    it('Surface 管理的集合视图不会再被路由级像素恢复覆盖', async () => {
        const app = {currentView: 'artists', library: [], filteredLibrary: []};
        const content = {
            hideAllPages: vi.fn(),
            updateSidebarSelection: vi.fn(),
            showAlbumsPage: vi.fn().mockResolvedValue(undefined)
        };
        const scroll = {
            capture: vi.fn(),
            restore: vi.fn()
        };
        const router = new ViewRouter({app, content: content as never, scroll: scroll as never});

        await router.handleViewChange('albums');

        expect(scroll.capture).not.toHaveBeenCalled();
        expect(scroll.restore).not.toHaveBeenCalled();
    });

    it('跨日期分组保留原始队列索引', () => {
        const first = createTrack('first', {playTime: new Date('2026-07-30T10:00:00').getTime()});
        const second = createTrack('second', {playTime: new Date('2026-07-29T10:00:00').getTime()});

        const groups = groupRecentTracksByDate([first, second], new Date('2026-07-31T10:00:00'));
        const entries = Object.values(groups).flat();

        expect(entries.map(({track, index}) => [track.fileId, index])).toEqual([
            ['first', 0],
            ['second', 1]
        ]);
    });

    it('最近播放扁平序列保留日期标题和原始歌曲索引', () => {
        const first = createTrack('first', {playTime: new Date('2026-07-30T10:00:00').getTime()});
        const second = createTrack('second', {playTime: new Date('2026-07-29T10:00:00').getTime()});

        const rows = flattenRecentTrackRows([first, second], new Date('2026-07-31T10:00:00'));

        expect(rows.map(row => row.kind)).toEqual(['date-header', 'track', 'date-header', 'track']);
        expect(rows.filter(row => row.kind === 'track').map(row => row.index)).toEqual([0, 1]);
    });
});

describe('页面来源播放队列', () => {
    it('单曲上下文来源会把页面下标归一为来源下标', async () => {
        const track = createTrack('context-track');
        const setPlaylist = vi.fn().mockResolvedValue(true);
        const controller = new PlaybackAppController({
            app: {
                currentView: 'artists',
                library: [track],
                filteredLibrary: [track],
                showError: vi.fn()
            },
            integrations: {
                getLibraryTracks: vi.fn().mockResolvedValue([track]),
                setPlaylist,
                restorePlaybackQueue: vi.fn().mockResolvedValue(true),
                moveQueueEntry: vi.fn().mockReturnValue(true),
                loadTrack: vi.fn().mockResolvedValue(true),
                play: vi.fn().mockResolvedValue(true),
                setPosition: vi.fn().mockResolvedValue(true),
                setPlayMode: vi.fn().mockReturnValue(true),
                getPlaybackSnapshot: vi.fn().mockReturnValue({playMode: 'sequence'})
            }
        });

        await controller.handleTrackPlayed(track, 8, [track]);

        expect(setPlaylist).toHaveBeenCalledWith([track], 0);
    });
});
