import {libraryDataService} from "@/features/library/service/LibraryDataService";
import {libraryService} from "@/features/library/service/LibraryService";
import type {Result} from "@api/types/common";
import type {CacheValidationResult} from "@api/types/events";
import type {LibraryIndexRebuildResult} from "@api/types/electron";

export interface CacheStatisticsView {
    totalTracks: number;
    totalSize: number;
    scannedDirectories?: number;
    cacheAge?: number;
}

class CacheMaintenanceService {
    getStatistics(): Promise<CacheStatisticsView | null> {
        return libraryDataService.getCacheStatistics() as Promise<CacheStatisticsView | null>;
    }

    validate(): Promise<CacheValidationResult | null> {
        return libraryService.validateCache();
    }

    rebuildLibraryIndex(): Promise<LibraryIndexRebuildResult> {
        return libraryService.rebuildLibraryIndex();
    }

    clearIgnoreList(): Promise<Result> {
        return libraryDataService.clearIgnoreList();
    }
}

export const cacheMaintenanceService = new CacheMaintenanceService();
