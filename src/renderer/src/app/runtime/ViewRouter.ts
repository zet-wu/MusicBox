import type {ViewRouterHost} from './AppRuntimePorts';
import type {AppView} from '@/shared/types/AppContracts';
import type {ContentUIFacade} from './ui/ContentUIFacade';

interface ViewRouterOptions {
    app: ViewRouterHost;
    content: ContentUIFacade;
}

export class ViewRouter {
    private readonly app: ViewRouterHost;
    private readonly content: ContentUIFacade;

    constructor({app, content}: ViewRouterOptions) {
        this.app = app;
        this.content = content;
    }

    async handleViewChange(view: AppView): Promise<void> {
        const app = this.app;

        if (!this.isNavigableCoreView(view)) {
            console.warn('🎵 App: 未注册的视图，保持当前页面:', view);
            return;
        }

        this.hideAllPages();
        app.currentView = view;

        if (view !== 'playlist-detail' && view !== 'network-drive-detail') {
            this.updateSidebarSelection(view);
        }

        switch (view) {
            case 'home-page':
                await this.content.showHomePage();
                break;
            case 'library':
                await this.content.showSystemCollection('all-tracks');
                this.content.applySystemCollectionSearchResults(app.filteredLibrary);
                break;
            case 'favorites':
                await this.content.showSystemCollection('favorites');
                this.content.applySystemCollectionSearchResults(app.filteredLibrary);
                break;
            case 'recent':
                await this.content.showRecentPage();
                break;
            case 'artists':
                await this.content.showArtistsPage();
                break;
            case 'albums':
                await this.content.showAlbumsPage();
                break;
            case 'folders':
                await this.content.showFolderSourcesPage();
                break;
            case 'playlists':
                await this.content.showPlaylistsPage();
                break;
            case 'statistics':
                await this.content.showStatisticsPage();
                break;
            default:
                break;
        }
    }

    hideAllPages(): void {
        this.content.hideAllPages();
    }

    updateSidebarSelection(type: string, id: string | null = null): void {
        this.content.updateSidebarSelection(type, id);
    }

    private isNavigableCoreView(view: AppView): boolean {
        return [
            'home-page',
            'library',
            'favorites',
            'recent',
            'artists',
            'albums',
            'folders',
            'playlists',
            'statistics'
        ].includes(view);
    }
}
