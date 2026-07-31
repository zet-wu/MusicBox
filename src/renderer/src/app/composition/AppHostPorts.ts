import type {Playlist} from '@api/types/playlist';
import type {Track} from '@api/types/track';
import type {AppShellRuntimeHost} from '@/features/appShell/service/AppShellRuntimeHost';
import type {ExtensionHostApp} from '@/features/extensions/service/ExtensionHostService';
import type {FileImportHost, LibraryAppHost} from '@/features/library/ui-bindings';
import type {PlaybackAppHost} from '@/features/playback/ui-bindings';
import type {PlaylistAppHost} from '@/features/playlists/PlaylistController';
import type {SettingsComponentBindingHost} from '@/features/settings/ui-bindings';
import type {
    AppComponentPort,
    APIEventBindingHost,
    DOMEventBindingHost,
    PluginBootstrapHost,
    ViewRouterHost
} from '@/app/runtime/AppRuntimePorts';
import type {NetworkDriveRouteHost} from '@/app/runtime/NetworkDriveRouteController';
import type {ShortcutHost} from '@/app/runtime/ShortcutController';
import type {
    NavigationComponentBindingHost,
    PageComponentBindingHost
} from '@/app/runtime/components/bindings/ComponentBindingTypes';
import type {PlaybackComponentBindingHost} from '@/features/playback/ui-bindings';
import type {PlaylistComponentBindingHost} from '@/features/playlists/ui-bindings';
import type {ComponentMap} from '@/app/runtime/components/ComponentTypes';
import type {MusicBoxAPIEvents, ScanProgress} from '@api/types/events';
import type {AppView, ConfirmOptions} from '@/shared/types/AppContracts';

export interface MusicBoxCompositionHost {
    isInitialized: boolean;
    currentView: AppView;
    library: Track[];
    filteredLibrary: Track[];
    coversPreloadedByApp?: boolean;
    components: ComponentMap;
    addManagedEventListener(
        element: EventTarget,
        event: string,
        handler: EventListenerOrEventListenerObject,
        options?: boolean | AddEventListenerOptions
    ): void;
    addManagedAPIEventListener<K extends keyof MusicBoxAPIEvents>(
        event: K,
        handler: (payload: MusicBoxAPIEvents[K]) => void | Promise<void>
    ): void;
    on(event: string, handler: (...args: any[]) => void): void;
    off(event: string, handler: (...args: any[]) => void): void;
    emit(event: string, ...args: any[]): void;
    removeAllListeners(event?: string): void;
    addToPlaylist(track: Track): void | Promise<void>;
    addTracksToQueue(tracks: Track[]): Promise<void>;
    addMusicFiles(): Promise<void>;
    cleanup(): Promise<void>;
    clearRuntimeData(): void;
    confirm(options: ConfirmOptions): Promise<boolean>;
    destroyComponent(componentName: string): void;
    handleAddToCustomPlaylist(tracks: Track[], index: number): Promise<void>;
    handleBatchDelete(selectedTracks: Track[] | null | undefined, track: Track, index: number): Promise<void>;
    handleDeleteTrack(track: Track, index: number): Promise<void>;
    handleDriveRemoved(drive?: unknown): Promise<void>;
    handleEditTrackInfo(track: Track, index: number): Promise<void>;
    moveQueueEntry(queueId: string, targetIndex: number): boolean;
    playTracksNext(tracks: Track[]): Promise<void>;
    handleNetworkDriveSelected(drive: unknown): Promise<void>;
    handlePlayAllTracks(tracks: Track[]): Promise<void>;
    handleShuffleAllTracks(tracks: Track[]): Promise<void>;
    handlePlaylistCleared(): Promise<void>;
    handlePlaylistCoverUpdated(playlist: Playlist): Promise<void>;
    handlePlaylistCreated(playlist?: Playlist): Promise<void>;
    handlePlaylistRenamed(playlist?: Playlist): Promise<void>;
    handlePlaylistSelected(playlist: Playlist): Promise<void>;
    handlePlaylistTrackPlayed(track: Track, index: number): Promise<void>;
    handlePlaylistTrackRemoved(track: Track, index: number): Promise<void>;
    handlePlaylistTrackSelected(track: Track, index: number): void;
    handlePlaylistUpdated(playlist?: Playlist): Promise<void>;
    handlePlaylistBindingsChanged(): Promise<void>;
    handleSearchQuery(query: string): Promise<void>;
    handleTrackAddedToPlaylist(playlist?: Playlist, track?: Track): Promise<void>;
    handleTrackIndexChanged(index: number): void;
    handleTrackInfoUpdated(data: unknown): Promise<void>;
    handleTrackPlayed(track: Track, index: number, tracks?: Track[]): Promise<void>;
    handleViewChange(view: AppView, options?: {preserveSearch?: boolean}): Promise<void>;
    hideCacheLoadingStatus(): void;
    hideAllPages(): void;
    initGlobalShortcuts(): Promise<void>;
    initKeyboardShortcuts(): void;
    initializeComponent(componentName: string): void;
    initializeComponents(): void;
    loadAndPlayFile?(filePath: string): Promise<void>;
    loadInitialData(): Promise<void>;
    openDirectoryDialog(): Promise<void>;
    playTrackFromPlaylist(
        track: Track,
        index: number,
        tracks?: Track[],
        mode?: 'shuffle' | 'sequence'
    ): Promise<void>;
    preloadTrackCovers(): Promise<void>;
    refreshLibrary(tracks?: Track[]): Promise<void>;
    scanMusicFolder(): Promise<void>;
    schedulePluginSystemInitialization(): void;
    setupComponentEvents(componentName?: string | null): void;
    setupEventListeners(): Promise<void>;
    setupFileLoading(): void;
    showApp(): void;
    showCacheLoadingStatus(): void;
    showCreatePlaylistDialog(): void;
    showError(message: string): void;
    showFatalError(message: string): void;
    showInfo(message: string): void;
    showNetworkDriveModal(): boolean;
    showPluginManager(): Promise<boolean>;
    showScanProgress(): void;
    showSuccess(message: string): void;
    showWelcomeScreen(): void;
    syncDesktopLyricsButtonState(): Promise<void>;
    updateLibraryTrackDuration(filePath: string, duration: number): void;
    updateScanProgress(progress: ScanProgress): void;
    updateSidebarSelection(type: string, id?: string | null): void;
    navigateToView(viewId: string): void;
}

export interface AppHostPorts {
    apiEvents: APIEventBindingHost;
    appShellRuntime: AppShellRuntimeHost;
    components: AppComponentPort;
    domEvents: DOMEventBindingHost;
    extensionHost: ExtensionHostApp;
    fileImport: FileImportHost;
    legacyPluginApp: MusicBoxCompositionHost;
    library: LibraryAppHost;
    lifecycle: import('@/app/lifecycle').AppLifecycleHost;
    navigationBindings: NavigationComponentBindingHost;
    networkDriveRoute: NetworkDriveRouteHost;
    pageBindings: PageComponentBindingHost;
    playback: PlaybackAppHost;
    playbackBindings: PlaybackComponentBindingHost;
    playlist: PlaylistAppHost;
    playlistBindings: PlaylistComponentBindingHost;
    pluginBootstrap: PluginBootstrapHost;
    settingsBindings: SettingsComponentBindingHost;
    shortcuts: ShortcutHost;
    viewRouter: ViewRouterHost;
}

export function createAppHostPorts(app: MusicBoxCompositionHost): AppHostPorts {
    const notificationPort = {
        showSuccess: (message: string) => app.showSuccess(message),
        showError: (message: string) => app.showError(message),
        showInfo: (message: string) => app.showInfo(message)
    };

    return {
        apiEvents: {
            refreshLibrary: (tracks) => app.refreshLibrary(tracks),
            updateLibraryTrackDuration: (filePath, duration) => app.updateLibraryTrackDuration(filePath, duration),
            updateScanProgress: (progress) => app.updateScanProgress(progress)
        },
        appShellRuntime: {
            confirm: (options) => app.confirm(options),
            showInfo: notificationPort.showInfo,
            showSuccess: notificationPort.showSuccess,
            showError: notificationPort.showError,
            handleViewChange: (view) => app.handleViewChange(view),
            addMusicFiles: () => app.addMusicFiles(),
            showNetworkDriveModal: () => app.showNetworkDriveModal(),
            showPluginManager: () => app.showPluginManager()
        },
        components: {
            components: app.components
        },
        domEvents: {
            addManagedEventListener: (...args) => app.addManagedEventListener(...args),
            cleanup: () => app.cleanup(),
            initKeyboardShortcuts: () => app.initKeyboardShortcuts(),
            initGlobalShortcuts: () => app.initGlobalShortcuts(),
            showCreatePlaylistDialog: () => app.showCreatePlaylistDialog(),
            setupFileLoading: () => app.setupFileLoading()
        },
        extensionHost: {
            get currentView() {
                return app.currentView;
            },
            get library() {
                return app.library;
            },
            on: (event, handler) => app.on(event, handler),
            off: (event, handler) => app.off(event, handler),
            emit: (event, ...args) => app.emit(event, ...args),
            removeAllListeners: (event) => app.removeAllListeners(event),
            handleDeleteTrack: (track, index) => app.handleDeleteTrack(track, index),
            navigateToView: (viewId) => app.navigateToView(viewId),
            ...(app.loadAndPlayFile
                ? {loadAndPlayFile: (filePath: string) => app.loadAndPlayFile!(filePath)}
                : {})
        },
        fileImport: {
            addManagedEventListener: (...args) => app.addManagedEventListener(...args),
            showScanProgress: () => app.showScanProgress(),
            showSuccess: notificationPort.showSuccess,
            showError: notificationPort.showError,
            showInfo: notificationPort.showInfo
        },
        legacyPluginApp: app,
        library: {
            get currentView() {
                return app.currentView;
            },
            get library() {
                return app.library;
            },
            set library(value: Track[]) {
                app.library = value;
            },
            get filteredLibrary() {
                return app.filteredLibrary;
            },
            set filteredLibrary(value: Track[]) {
                app.filteredLibrary = value;
            },
            get coversPreloadedByApp() {
                return app.coversPreloadedByApp;
            },
            set coversPreloadedByApp(value: boolean | undefined) {
                app.coversPreloadedByApp = value;
            },
            addManagedAPIEventListener: (...args) => app.addManagedAPIEventListener(...args),
            confirm: (options) => app.confirm(options),
            showSuccess: notificationPort.showSuccess,
            showError: notificationPort.showError,
            showInfo: notificationPort.showInfo,
            showCacheLoadingStatus: () => app.showCacheLoadingStatus(),
            hideCacheLoadingStatus: () => app.hideCacheLoadingStatus(),
            showWelcomeScreen: () => app.showWelcomeScreen(),
            handleViewChange: (view, options) => app.handleViewChange(view, options),
            syncDesktopLyricsButtonState: () => app.syncDesktopLyricsButtonState()
        },
        lifecycle: {
            get isInitialized() {
                return app.isInitialized;
            },
            set isInitialized(value: boolean) {
                app.isInitialized = value;
            },
            initializeComponents: () => app.initializeComponents(),
            setupEventListeners: () => app.setupEventListeners(),
            loadInitialData: () => app.loadInitialData(),
            showApp: () => app.showApp(),
            schedulePluginSystemInitialization: () => app.schedulePluginSystemInitialization(),
            showFatalError: (message) => app.showFatalError(message),
            clearRuntimeData: () => app.clearRuntimeData()
        },
        navigationBindings: {
            handleSearchQuery: (query) => app.handleSearchQuery(query),
            handleViewChange: (view) => app.handleViewChange(view),
            handlePlaylistSelected: (playlist) => app.handlePlaylistSelected(playlist),
            handleNetworkDriveSelected: (drive) => app.handleNetworkDriveSelected(drive)
        },
        networkDriveRoute: {
            get currentView() {
                return app.currentView;
            },
            set currentView(value: AppView) {
                app.currentView = value;
            }
        },
        pageBindings: {
            handleDriveRemoved: (drive) => app.handleDriveRemoved(drive),
            handlePlaylistSelected: (playlist) => app.handlePlaylistSelected(playlist),
            handleTrackPlayed: (track, index, tracks) => app.handleTrackPlayed(track, index, tracks),
            handlePlayAllTracks: (tracks) => app.handlePlayAllTracks(tracks),
            handleShuffleAllTracks: (tracks) => app.handleShuffleAllTracks(tracks),
            playTrackFromPlaylist: (track, index, tracks, mode) => app.playTrackFromPlaylist(track, index, tracks, mode),
            addTracksToQueue: (tracks) => app.addTracksToQueue(tracks),
            addToPlaylist: (track) => app.addToPlaylist(track)
        },
        playback: {
            get currentView() {
                return app.currentView;
            },
            get library() {
                return app.library;
            },
            get filteredLibrary() {
                return app.filteredLibrary;
            },
            showError: notificationPort.showError
        },
        playbackBindings: {
            handleTrackPlayed: (track, index, tracks) => app.handleTrackPlayed(track, index, tracks),
            handleTrackIndexChanged: (index) => app.handleTrackIndexChanged(index),
            handlePlaylistTrackSelected: (track, index) => app.handlePlaylistTrackSelected(track, index),
            handlePlaylistTrackPlayed: (track, index) => app.handlePlaylistTrackPlayed(track, index),
            handlePlaylistTrackRemoved: (track, index) => app.handlePlaylistTrackRemoved(track, index),
            handlePlaylistCleared: () => app.handlePlaylistCleared(),
            addToPlaylist: (track) => app.addToPlaylist(track),
            addTracksToQueue: (tracks) => app.addTracksToQueue(tracks),
            playTracksNext: (tracks) => app.playTracksNext(tracks),
            handleAddToCustomPlaylist: (track, index) => app.handleAddToCustomPlaylist(track, index),
            handleDeleteTrack: (track, index) => app.handleDeleteTrack(track, index),
            handleBatchDelete: (selectedTracks, track, index) => app.handleBatchDelete(selectedTracks, track, index),
            handleEditTrackInfo: (track, index) => app.handleEditTrackInfo(track, index),
            moveQueueEntry: (queueId, targetIndex) => app.moveQueueEntry(queueId, targetIndex)
        },
        playlist: {
            get currentView() {
                return app.currentView;
            },
            set currentView(value: string) {
                app.currentView = value as AppView;
            },
            hideAllPages: () => app.hideAllPages(),
            showInfo: notificationPort.showInfo,
            updateSidebarSelection: (type, id) => app.updateSidebarSelection(type, id),
            playTrackFromPlaylist: (track, index, tracks) => app.playTrackFromPlaylist(track, index, tracks)
        },
        playlistBindings: {
            handlePlaylistCreated: (playlist) => app.handlePlaylistCreated(playlist),
            handleTrackAddedToPlaylist: (playlist, track) => app.handleTrackAddedToPlaylist(playlist, track),
            handlePlaylistRenamed: (playlist) => app.handlePlaylistRenamed(playlist),
            handleTrackInfoUpdated: (data) => app.handleTrackInfoUpdated(data),
            handleTrackPlayed: (track, index, tracks) => app.handleTrackPlayed(track, index, tracks),
            handlePlayAllTracks: (tracks) => app.handlePlayAllTracks(tracks),
            handleShuffleAllTracks: (tracks) => app.handleShuffleAllTracks(tracks),
            addTracksToQueue: (tracks) => app.addTracksToQueue(tracks),
            playTrackFromPlaylist: (track, index, tracks, mode) => app.playTrackFromPlaylist(track, index, tracks, mode),
            handlePlaylistUpdated: (playlist) => app.handlePlaylistUpdated(playlist),
            handlePlaylistBindingsChanged: () => app.handlePlaylistBindingsChanged(),
            handlePlaylistCoverUpdated: (playlist) => app.handlePlaylistCoverUpdated(playlist)
        },
        pluginBootstrap: {
            get isInitialized() {
                return app.isInitialized;
            },
            get currentView() {
                return app.currentView;
            },
            navigateToView: (viewId) => app.navigateToView(viewId),
            on: (event, handler) => app.on(event, handler),
            off: (event, handler) => app.off(event, handler),
            emit: (event, ...args) => app.emit(event, ...args),
            removeAllListeners: (event) => app.removeAllListeners(event)
        },
        settingsBindings: {
            get isInitialized() {
                return app.isInitialized;
            },
            initializeComponent: (componentName) => app.initializeComponent(componentName),
            destroyComponent: (componentName) => app.destroyComponent(componentName),
            preloadTrackCovers: () => app.preloadTrackCovers()
        },
        shortcuts: {
            addManagedEventListener: (...args) => app.addManagedEventListener(...args),
            openDirectoryDialog: () => app.openDirectoryDialog(),
            addMusicFiles: () => app.addMusicFiles()
        },
        viewRouter: {
            get currentView() {
                return app.currentView;
            },
            set currentView(value: AppView) {
                app.currentView = value;
            },
            get library() {
                return app.library;
            },
            set library(value: Track[]) {
                app.library = value;
            },
            get filteredLibrary() {
                return app.filteredLibrary;
            },
            set filteredLibrary(value: Track[]) {
                app.filteredLibrary = value;
            }
        }
    };
}
