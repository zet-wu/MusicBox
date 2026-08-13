import type {AppComponentPort} from '../AppRuntimePorts';
import {ContentUIFacade} from './ContentUIFacade';
import {DialogUIFacade} from './DialogUIFacade';
import {PlaybackUIFacade} from './PlaybackUIFacade';
import {QueueUIFacade} from './QueueUIFacade';
import type {ContentMountManager} from '../components/ContentMountManager';

export interface AppUIPorts {
    content: ContentUIFacade;
    dialogs: DialogUIFacade;
    playback: PlaybackUIFacade;
    queue: QueueUIFacade;
}

export function createAppUIPorts(app: AppComponentPort, contentMounts: ContentMountManager): AppUIPorts {
    return {
        content: new ContentUIFacade(app, contentMounts),
        dialogs: new DialogUIFacade(app),
        playback: new PlaybackUIFacade(app),
        queue: new QueueUIFacade(app)
    };
}
