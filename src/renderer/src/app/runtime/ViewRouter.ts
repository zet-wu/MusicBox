import type {ViewRouterHost} from './AppRuntimePorts';
import type {AppView} from '@/shared/types/AppContracts';
import type {ContentUIFacade} from './ui/ContentUIFacade';
import {MainContentScrollCoordinator} from './MainContentScrollCoordinator';

interface ViewRouterOptions {
    app: ViewRouterHost;
    content: ContentUIFacade;
    scroll: MainContentScrollCoordinator;
}

export class ViewRouter {
    private readonly app: ViewRouterHost;
    private readonly content: ContentUIFacade;
    private readonly scroll: MainContentScrollCoordinator;
    private activeView: AppView | null = null;

    constructor({app, content, scroll}: ViewRouterOptions) {
        this.app = app;
        this.content = content;
        this.scroll = scroll;
    }

    async handleViewChange(view: AppView): Promise<void> {
        const app = this.app;

        if (!this.isNavigableCoreView(view)) {
            console.warn('🎵 App: 未注册的视图，保持当前页面:', view);
            return;
        }

        if (this.activeView === view && app.currentView === view) {
            return;
        }

        if (!this.isSurfaceManagedView(app.currentView)) {
            this.scroll.capture(app.currentView);
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
                break;
            case 'favorites':
                await this.content.showSystemCollection('favorites');
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

        this.activeView = view;
        if (!this.isSurfaceManagedView(view)) {
            this.scroll.restore(view, () => this.activeView === view && app.currentView === view);
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

    private isSurfaceManagedView(view: AppView): boolean {
        return view === 'artists' || view === 'albums' || view === 'playlists' || view === 'folders';
    }

}
