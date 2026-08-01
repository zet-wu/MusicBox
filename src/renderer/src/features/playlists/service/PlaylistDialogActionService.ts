import type {Playlist, Track} from "@api/types/library";
import {libraryDataService} from "@/features/library/service/LibraryDataService";

export interface CreatePlaylistActionResult {
    success: boolean;
    playlist?: Playlist;
    error?: string;
    bindingError?: string;
}

export interface RenamePlaylistActionResult {
    success: boolean;
    playlist?: Playlist;
    error?: string;
}

export interface AddToPlaylistActionResult {
    success: boolean;
    playlist?: Playlist;
    addedCount: number;
    error?: string;
}

export class PlaylistDialogActionService {
    async getPlaylists(): Promise<Playlist[]> {
        return await libraryDataService.getPlaylists();
    }

    async addTracksToPlaylist(
        playlistId: string,
        tracks: Track[],
        playlists: Playlist[]
    ): Promise<AddToPlaylistActionResult> {
        const trackIds = tracks.flatMap(track => track.fileId ? [track.fileId] : []);
        if (trackIds.length === 0) return {success: false, addedCount: 0, error: '所选歌曲缺少文件标识'};

        const result = await libraryDataService.addToPlaylist(playlistId, trackIds) as {
            success: boolean;
            results?: Array<{success: boolean}>;
            error?: string;
        };
        const addedCount = result.results?.filter(item => item.success).length
            ?? (result.success ? trackIds.length : 0);
        return {
            success: addedCount > 0,
            playlist: playlists.find(p => p.id === playlistId),
            addedCount,
            error: addedCount > 0 ? undefined : (result.error || '所选歌曲已在歌单中')
        };
    }

    async createPlaylist(
        name: string,
        description: string,
        tracksToAdd: Track[] = [],
        bindSourceId?: string
    ): Promise<CreatePlaylistActionResult> {
        const result = await libraryDataService.createPlaylist(name, description);
        if (!result.success || !result.playlist) {
            return result;
        }

        const trackIds = tracksToAdd.flatMap(track => track.fileId ? [track.fileId] : []);
        if (!bindSourceId && trackIds.length > 0) {
            try {
                await libraryDataService.addToPlaylist(result.playlist.id, trackIds);
                console.log(`✅ PlaylistDialogActionService: ${trackIds.length} 首歌曲已添加到新歌单`);
            } catch (error) {
                console.warn('⚠️ PlaylistDialogActionService: 添加歌曲到新歌单失败', error);
            }
        }

        if (bindSourceId) {
            const bindingResult = await libraryDataService.bindLibrarySourceToPlaylist(
                result.playlist.id,
                bindSourceId
            );
            if (!bindingResult.success) {
                return {
                    success: false,
                    playlist: result.playlist,
                    bindingError: bindingResult.error || '绑定歌单失败'
                };
            }
        }

        return result;
    }

    async renamePlaylist(playlistId: string, newName: string, description = ''): Promise<RenamePlaylistActionResult> {
        return await libraryDataService.renamePlaylist(playlistId, newName, description);
    }

}

export const playlistDialogActionService = new PlaylistDialogActionService();
