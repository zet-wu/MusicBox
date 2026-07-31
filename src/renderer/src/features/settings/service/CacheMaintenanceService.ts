import {libraryDataService} from "@/features/library/service/LibraryDataService";
import {libraryService} from "@/features/library/service/LibraryService";
import type {Result} from "@api/types/common";
import type {CacheValidationResult} from "@api/types/events";
import type {LibraryIndexClearResult} from "@api/types/electron";

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

    clearLibraryIndex(): Promise<LibraryIndexClearResult> {
        return libraryService.clearLibraryIndex();
    }

    clearIgnoreList(): Promise<Result> {
        return libraryDataService.clearIgnoreList();
    }
}

export const cacheMaintenanceService = new CacheMaintenanceService();
