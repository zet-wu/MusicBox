import {AlbumsPage} from "@ui/pages/AlbumsPage";
import {ArtistsPage} from "@ui/pages/ArtistsPage";
import {HomePage} from "@ui/pages/HomePage";
import {FolderSourcesPage} from "@ui/pages/FolderSourcesPage";
import {NetworkDriveDetailPage} from "@ui/pages/NetworkDriveDetailPage";
import {PlaylistDetailPage} from "@ui/pages/PlaylistDetailPage";
import {PlaylistsPage} from "@ui/pages/PlaylistsPage";
import {RecentPage} from "@ui/pages/RecentPage";
import {Settings} from "@ui/pages/Settings";
import {StatisticsPage} from "@ui/pages/StatisticsPage";
import {ContextMenu} from "@ui/widgets/ContextMenu";
import {EqualizerComponent} from "@ui/widgets/EqualizerComponent";
import ParametricEqualizerComponent from "@ui/widgets/ParametricEqualizerComponent";
import {Lyrics} from "@ui/widgets/Lyrics";
import {Navigation} from "@ui/widgets/Navigation";
import {Player} from '@ui/widgets/Player';
import {Playlist} from "@ui/widgets/Playlist";
import {Search} from "@ui/widgets/Search";
import {NetworkDiskModal} from "@ui/modals/NetworkDiskModal";
import {PluginManagerModal} from "@ui/modals/PluginManagerModal";
import {UpdateModal} from "@ui/modals/UpdateModal";

import {AddToPlaylistDialog} from "@ui/dialogs/AddToPlaylistDialog";
import {ConfirmDialog} from "@ui/dialogs/ConfirmDialog";
import {CreatePlaylistDialog} from "@ui/dialogs/CreatePlaylistDialog";
import {EditTrackInfoDialog} from "@ui/dialogs/EditTrackInfoDialog";
import {FolderPlaylistBindingDialog} from "@ui/dialogs/FolderPlaylistBindingDialog";
import {PlaylistBindingDialog} from "@ui/dialogs/PlaylistBindingDialog";
import {RenamePlaylistDialog} from "@ui/dialogs/RenamePlaylistDialog";

import {cacheManager} from "@/shared/cache";
import type {ComponentMap} from "@/app/runtime/components/ComponentTypes";
import {ContentMountManager, type ContentViewKey} from './ContentMountManager';
import type {MainContentScrollCoordinator} from '../MainContentScrollCoordinator';

interface ComponentRegistryOptions {
    components: ComponentMap;
    setupComponentEvents: (componentName: string) => void;
    contentMounts: ContentMountManager;
    mainContentScroll: MainContentScrollCoordinator;
}

type OnDemandComponentName =
    | 'recentPage'
    | 'artistsPage'
    | 'albumsPage'
    | 'statisticsPage'
    | 'networkDiskModal';

export class ComponentRegistry {
    private readonly components: ComponentMap;
    private readonly setupComponentEvents: (componentName: string) => void;
    private readonly contentMounts: ContentMountManager;
    private readonly mainContentScroll: MainContentScrollCoordinator;

    constructor({components, setupComponentEvents, contentMounts, mainContentScroll}: ComponentRegistryOptions) {
        this.components = components;
        this.setupComponentEvents = setupComponentEvents;
        this.contentMounts = contentMounts;
        this.mainContentScroll = mainContentScroll;
    }

    initializeComponents(): void {
        this.components.player = new Player();
        this.components.search = new Search();
        this.components.navigation = new Navigation();
        this.components.playlist = new Playlist(document.getElementById('playlist-panel'));
        this.components.contextMenu = new ContextMenu(document.getElementById('context-menu'));
        this.components.settings = new Settings(document.getElementById('settings-page'));
        this.components.lyrics = new Lyrics(document.getElementById('lyrics-page'));
        this.components.equalizer = new EqualizerComponent();
        this.components.parametricEqualizer = new ParametricEqualizerComponent();

        this.components.confirmDialog = new ConfirmDialog();
        this.components.createPlaylistDialog = new CreatePlaylistDialog();
        this.components.addToPlaylistDialog = new AddToPlaylistDialog();
        this.components.renamePlaylistDialog = new RenamePlaylistDialog();
        this.components.playlistBindingDialog = new PlaylistBindingDialog();
        this.components.editTrackInfoDialog = new EditTrackInfoDialog();
        this.components.folderPlaylistBindingDialog = new FolderPlaylistBindingDialog();

        this.components.playlistDetailPage = new PlaylistDetailPage(this.mount('playlist-detail'));
        this.components.playlistsPage = new PlaylistsPage(this.mount('playlists'));
        this.components.networkDriveDetailPage = new NetworkDriveDetailPage(this.mount('network-drive-detail'));

        this.components.updateModal = new UpdateModal();

        this.components.networkDiskModal = null;
        this.components.pluginManagerModal = new PluginManagerModal();
        this.components.homePage = new HomePage(this.mount('home-page'));
        this.components.folderSourcesPage = new FolderSourcesPage(this.mount('folders'));

        this.initializePageComponentsOnDemand();
    }

    initializePageComponentsOnDemand(): void {
        const settings = (cacheManager.getLocalCache('musicbox-settings') || {}) as Record<string, unknown>;
        const getSetting = (key: string, fallback: boolean): unknown => (
            Object.prototype.hasOwnProperty.call(settings, key) ? settings[key] : fallback
        );

        const recentPlayEnabled = getSetting('recentPlay', true);
        if (recentPlayEnabled) {
            this.components.recentPage = new RecentPage(this.mount('recent'));
        } else {
            this.components.recentPage = null;
        }

        const artistsPageEnabled = getSetting('artistsPage', true);
        if (artistsPageEnabled) {
            this.components.artistsPage = new ArtistsPage(this.mount('artists'), this.mainContentScroll);
        } else {
            this.components.artistsPage = null;
        }

        const albumsPageEnabled = getSetting('albumsPage', true);
        if (albumsPageEnabled) {
            this.components.albumsPage = new AlbumsPage(this.mount('albums'), this.mainContentScroll);
        } else {
            this.components.albumsPage = null;
        }

        const statisticsEnabled = getSetting('statistics', true);
        if (statisticsEnabled) {
            this.components.statisticsPage = new StatisticsPage(this.mount('statistics'));
        } else {
            this.components.statisticsPage = null;
        }

        const networkDriveEnabled = getSetting('networkDriveEnabled', false);
        if (networkDriveEnabled) {
            this.initializeComponent('networkDiskModal');
        } else {
            this.components.networkDiskModal = null;
        }
    }

    initializeComponent(componentName: OnDemandComponentName | string): void {
        switch (componentName) {
            case 'recentPage':
                if (!this.components.recentPage) {
                    this.components.recentPage = new RecentPage(this.mount('recent'));
                    this.setupComponentEvents('recentPage');
                }
                break;
            case 'artistsPage':
                if (!this.components.artistsPage) {
                    this.components.artistsPage = new ArtistsPage(this.mount('artists'), this.mainContentScroll);
                    this.setupComponentEvents('artistsPage');
                }
                break;
            case 'albumsPage':
                if (!this.components.albumsPage) {
                    this.components.albumsPage = new AlbumsPage(this.mount('albums'), this.mainContentScroll);
                    this.setupComponentEvents('albumsPage');
                }
                break;
            case 'statisticsPage':
                if (!this.components.statisticsPage) {
                    this.components.statisticsPage = new StatisticsPage(this.mount('statistics'));
                    this.setupComponentEvents('statisticsPage');
                }
                break;
            case 'networkDiskModal':
                if (!this.components.networkDiskModal) {
                    this.components.networkDiskModal = new NetworkDiskModal();
                    this.setupComponentEvents('networkDiskModal');
                }
                break;
            default:
                console.warn('🎵 App: 未知的组件名称:', componentName);
        }
    }

    destroyComponent(componentName: OnDemandComponentName | string): void {
        switch (componentName) {
            case 'recentPage':
                if (this.components.recentPage) {
                    this.components.recentPage.destroy();
                    this.components.recentPage = null;
                    this.contentMounts.release('recent');
                }
                break;
            case 'artistsPage':
                if (this.components.artistsPage) {
                    this.components.artistsPage.destroy();
                    this.components.artistsPage = null;
                    this.contentMounts.release('artists');
                }
                break;
            case 'albumsPage':
                if (this.components.albumsPage) {
                    this.components.albumsPage.destroy();
                    this.components.albumsPage = null;
                    this.contentMounts.release('albums');
                }
                break;
            case 'statisticsPage':
                if (this.components.statisticsPage) {
                    this.components.statisticsPage.destroy();
                    this.components.statisticsPage = null;
                    this.contentMounts.release('statistics');
                }
                break;
            case 'networkDiskModal':
                if (this.components.networkDiskModal) {
                    this.components.networkDiskModal.hide();
                    this.components.networkDiskModal.destroy();
                    this.components.networkDiskModal = null;
                }
                break;
            default:
                console.warn('🎵 App: 未知的组件名称:', componentName);
        }
    }

    destroyAllComponents(): void {
        Object.values(this.components).forEach(component => {
            if (component && typeof component.destroy === 'function') {
                try {
                    component.destroy();
                } catch (error) {
                    console.warn('Failed to destroy component:', error);
                }
            }
        });

        Object.keys(this.components).forEach((key: string) => {
            delete this.components[key];
        });
        this.contentMounts.destroy();
    }

    private mount(key: ContentViewKey): HTMLElement {
        return this.contentMounts.acquire(key);
    }
}
