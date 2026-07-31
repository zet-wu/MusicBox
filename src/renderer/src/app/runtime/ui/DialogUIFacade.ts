import type {Playlist} from '@api/types/playlist';
import type {Track} from '@api/types/track';
import type {LibraryDirectoryOverview} from '@api/types/electron';
import type {ConfirmOptions} from '@/shared/types/AppContracts';
import type {AppComponentPort} from '../AppRuntimePorts';

export class DialogUIFacade {
    constructor(private readonly app: AppComponentPort) {}

    async toggleSettings(): Promise<void> {
        await this.app.components.settings?.toggle();
    }

    switchSettingsSection(sectionName: string): void {
        this.app.components.settings?.switchToSection(sectionName);
    }

    showCreatePlaylistDialog(tracks?: Track | Track[]): void {
        this.app.components.createPlaylistDialog?.show(tracks);
    }

    async showAddToPlaylistDialog(tracks: Track[]): Promise<void> {
        await this.app.components.addToPlaylistDialog?.show(tracks);
    }

    showRenamePlaylistDialog(playlist: Playlist): void {
        this.app.components.renamePlaylistDialog?.show(playlist);
    }

    async showPlaylistBindingDialog(playlist: Playlist): Promise<void> {
        await this.app.components.playlistBindingDialog?.show(playlist);
    }

    async showFolderPlaylistBindingDialog(source: LibraryDirectoryOverview): Promise<void> {
        await this.app.components.folderPlaylistBindingDialog?.show(source);
    }

    async showEditTrackInfoDialog(track: Track): Promise<void> {
        await this.app.components.editTrackInfoDialog?.show(track);
    }

    async confirm(options: ConfirmOptions): Promise<boolean> {
        return await this.app.components.confirmDialog.show(options);
    }

    showUpdateModal(): void {
        this.app.components.updateModal?.show();
    }

    showNetworkDriveModal(): boolean {
        const modal = this.app.components.networkDiskModal;
        if (!modal) {
            return false;
        }

        modal.show();
        return true;
    }

    async showPluginManager(): Promise<boolean> {
        const modal = this.app.components.pluginManagerModal;
        if (!modal) {
            return false;
        }

        await modal.show();
        return true;
    }
}
