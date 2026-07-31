import type {Track} from "@api/types/track";
import type {Playlist} from "@api/types/playlist";
import type {LibraryDirectoryOverview} from "@api/types/electron";
import type {AppView} from "@/shared/types/AppContracts";

import type {
    ComponentEventName,
    ComponentNotificationPayload,
    PageComponentBindingContext
} from "./ComponentBindingTypes";

export class PageComponentBindings {
    constructor(private readonly context: PageComponentBindingContext) {}

    setupComponentEvents(componentName: ComponentEventName | null = null): void {
        if (componentName) {
            this.setupSingleComponentEvents(componentName);
            return;
        }

        const {app, components, content, playback} = this.context;

        components.homePage.on('trackPlayed', async (track: Track, index: number) => {
            await app.handleTrackPlayed(track, index);
        });

        components.homePage.on('viewChange', (view: AppView) => {
            content.navigateToView(view);
        });

        components.homePage.on('toggleLyricsFullscreen', () => {
            playback.toggleLyricsFullscreen(false);
        });

        if (components.recentPage) {
            this.setupSingleComponentEvents('recentPage');
        }

        if (components.artistsPage) {
            this.setupSingleComponentEvents('artistsPage');
        }

        if (components.albumsPage) {
            this.setupSingleComponentEvents('albumsPage');
        }

        if (components.playlistsPage) {
            this.setupSingleComponentEvents('playlistsPage');
        }

        if (components.folderSourcesPage) {
            this.setupSingleComponentEvents('folderSourcesPage');
        }

        components.folderPlaylistBindingDialog?.on('bindingsChanged', async () => {
            await components.folderSourcesPage?.refresh();
        });

        if (components.statisticsPage) {
            this.setupSingleComponentEvents('statisticsPage');
        }

        if (components.networkDiskModal) {
            this.setupSingleComponentEvents('networkDiskModal');
        }

        if (components.networkDriveDetailPage) {
            this.setupSingleComponentEvents('networkDriveDetailPage');
        }
    }

    setupSingleComponentEvents(componentName: ComponentEventName | string): void {
        const {app, components, content, notify} = this.context;

        switch (componentName) {
            case 'recentPage':
                if (components.recentPage) {
                    components.recentPage.on('trackPlayed', async (track: Track, index: number, tracks: Track[]) => {
                        await app.handleTrackPlayed(track, index, tracks);
                    });

                    components.recentPage.on('playAll', async (tracks: Track[]) => {
                        await app.handlePlayAllTracks(tracks);
                    });

                    components.recentPage.on('addToPlaylist', (track: Track) => {
                        app.addToPlaylist(track);
                    });

                    components.recentPage.on('viewChange', (view: AppView) => {
                        content.navigateToView(view);
                    });
                }
                break;

            case 'artistsPage':
                if (components.artistsPage) {
                    components.artistsPage.on('trackPlayed', async (
                        track: Track,
                        index: number,
                        tracks?: Track[],
                        mode?: 'shuffle' | 'sequence'
                    ) => {
                        if (tracks?.length) {
                            await app.playTrackFromPlaylist(track, index, tracks, mode);
                            return;
                        }
                        await app.handleTrackPlayed(track, index);
                    });

                    components.artistsPage.on('playAllTracks', async (tracks: Track[]) => {
                        await app.handlePlayAllTracks(tracks);
                    });
                    components.artistsPage.on('appendAllTracks', async (tracks: Track[]) => {
                        await app.addTracksToQueue(tracks);
                    });
                    components.artistsPage.on('trackRightClick', (
                        track: Track,
                        index: number,
                        x: number,
                        y: number,
                        selectedTracks: Set<number>,
                        selectedTrackItems: Track[],
                        sourceTracks: Track[]
                    ) => {
                        content.showContextMenu(x, y, track, index, selectedTracks, selectedTrackItems, sourceTracks);
                    });
                    components.artistsPage.on('collectionRightClick', (tracks: Track[], x: number, y: number) => {
                        content.showCollectionContextMenu(x, y, tracks);
                    });
                }
                break;

            case 'albumsPage':
                if (components.albumsPage) {
                    components.albumsPage.on('trackPlayed', async (
                        track: Track,
                        index: number,
                        tracks?: Track[],
                        mode?: 'shuffle' | 'sequence'
                    ) => {
                        if (tracks?.length) {
                            await app.playTrackFromPlaylist(track, index, tracks, mode);
                            return;
                        }
                        await app.handleTrackPlayed(track, index);
                    });

                    components.albumsPage.on('playAllTracks', async (tracks: Track[]) => {
                        await app.handlePlayAllTracks(tracks);
                    });
                    components.albumsPage.on('appendAllTracks', async (tracks: Track[]) => {
                        await app.addTracksToQueue(tracks);
                    });
                    components.albumsPage.on('trackRightClick', (
                        track: Track,
                        index: number,
                        x: number,
                        y: number,
                        selectedTracks: Set<number>,
                        selectedTrackItems: Track[],
                        sourceTracks: Track[]
                    ) => {
                        content.showContextMenu(x, y, track, index, selectedTracks, selectedTrackItems, sourceTracks);
                    });
                    components.albumsPage.on('collectionRightClick', (tracks: Track[], x: number, y: number) => {
                        content.showCollectionContextMenu(x, y, tracks);
                    });
                }
                break;

            case 'playlistsPage':
                components.playlistsPage?.on('playlistSelected', async (playlist: Playlist) => {
                    await app.handlePlaylistSelected(playlist);
                });
                components.playlistsPage?.on(
                    'playlistCollectionRightClick',
                    (playlist: Playlist, tracks: Track[], x: number, y: number) => {
                        content.showCollectionContextMenu(x, y, tracks, playlist);
                    }
                );
                break;

            case 'folderSourcesPage':
                components.folderSourcesPage?.on('manageBindings', async (source: LibraryDirectoryOverview) => {
                    await this.context.dialogs.showFolderPlaylistBindingDialog(source);
                });
                break;

            case 'statisticsPage':
                break;

            case 'networkDiskModal':
                if (components.networkDiskModal) {
                    components.networkDiskModal.on('notification', (data: ComponentNotificationPayload) => {
                        notify(data);
                    });
                }
                break;

            case 'networkDriveDetailPage':
                if (components.networkDriveDetailPage) {
                    components.networkDriveDetailPage.on('driveRemoved', async (drive: unknown) => {
                        await app.handleDriveRemoved(drive);
                    });

                    components.networkDriveDetailPage.on('playTrack', async (track: Track, index: number) => {
                        await app.handleTrackPlayed(track, index, components.networkDriveDetailPage?.tracks || []);
                    });

                    components.networkDriveDetailPage.on('playTracks', async (tracks: Track[]) => {
                        await app.handlePlayAllTracks(tracks);
                    });

                    components.networkDriveDetailPage.on(
                        'trackRightClick',
                        (
                            track: Track,
                            index: number,
                            x: number,
                            y: number,
                            selectedTracks?: Set<number>,
                            selectedTrackItems?: Track[],
                            sourceTracks?: Track[]
                        ) => {
                            content.showContextMenu(
                                x,
                                y,
                                track,
                                index,
                                selectedTracks,
                                selectedTrackItems,
                                sourceTracks
                            );
                        }
                    );
                }
                break;

            default:
                console.warn('🎵 App: 未知的组件名称:', componentName);
        }
    }
}
