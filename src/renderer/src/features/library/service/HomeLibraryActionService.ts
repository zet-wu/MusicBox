import type {Track} from "@api/types/library";
import {appFileImportActionService} from "@/features/appShell/service/AppFileImportActionService";
import {mediaFileDialogService} from "@/features/media/service/MediaFileDialogService";
import {libraryService} from "./LibraryService";

export interface HomeLibraryActionResult {
    changed: boolean;
    tracks: Track[];
}

export class HomeLibraryActionService {
    async loadTracks(): Promise<Track[]> {
        return await libraryService.getTracks();
    }

    async scanSelectedFolders(): Promise<HomeLibraryActionResult> {
        const directories = await mediaFileDialogService.openDirectories();
        if (directories.length === 0) {
            return {changed: false, tracks: []};
        }

        let successCount = 0;
        for (const directory of directories) {
            if (await libraryService.scanDirectory(directory)) {
                successCount++;
            }
        }
        const tracks = successCount > 0 ? await libraryService.getTracks() : [];
        return {changed: successCount > 0, tracks};
    }

    async addMusicFiles(): Promise<HomeLibraryActionResult> {
        await appFileImportActionService.addMusicFiles();
        const tracks = await libraryService.getTracks();
        return {changed: true, tracks};
    }
}

export const homeLibraryActionService = new HomeLibraryActionService();
