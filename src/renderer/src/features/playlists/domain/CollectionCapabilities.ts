export type CollectionType = 'playlist' | 'favorites' | 'all-tracks';

export interface CollectionCapabilities {
    canAddSongs: boolean;
    canClear: boolean;
    canEditCover: boolean;
    canRemoveTracks: boolean;
    showCreatedDate: boolean;
}

export function getCollectionCapabilities(collectionType: CollectionType): CollectionCapabilities {
    switch (collectionType) {
        case 'favorites':
            return {
                canAddSongs: true,
                canClear: true,
                canEditCover: false,
                canRemoveTracks: false,
                showCreatedDate: false
            };
        case 'all-tracks':
            return {
                canAddSongs: false,
                canClear: false,
                canEditCover: false,
                canRemoveTracks: false,
                showCreatedDate: false
            };
        default:
            return {
                canAddSongs: true,
                canClear: true,
                canEditCover: true,
                canRemoveTracks: true,
                showCreatedDate: true
            };
    }
}
