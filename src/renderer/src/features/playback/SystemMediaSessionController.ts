import type {Track} from '@api/types/track';
import type {SystemMediaKeyAction} from '@api/types/electron';
import type {
    PlaybackState,
    PlaybackStoreChange,
    PlaybackStoreListener,
    Unsubscribe
} from './PlaybackStore';

const MEDIA_ACTIONS: readonly MediaSessionAction[] = [
    'play',
    'pause',
    'previoustrack',
    'nexttrack',
    'seekbackward',
    'seekforward',
    'seekto'
];

interface SystemMediaPlaybackPort {
    getState(): Readonly<PlaybackState>;
    subscribe(listener: PlaybackStoreListener): Unsubscribe;
    play(): Promise<boolean>;
    pause(): Promise<boolean>;
    previousTrack(): Promise<boolean>;
    nextTrack(): Promise<boolean>;
    seek(position: number): Promise<boolean>;
}

interface SystemMediaSessionControllerOptions {
    playback: SystemMediaPlaybackPort;
    mediaSession?: MediaSession | null;
    createMetadata?: (init: MediaMetadataInit) => MediaMetadata;
    resolveArtwork?: (track: Track) => Promise<string | null>;
    defaultArtwork?: string;
    positionSyncIntervalMs?: number;
    actionDeduplicationMs?: number;
    nativeMediaKeys?: {
        setEnabled(enabled: boolean): Promise<boolean>;
        onTriggered(handler: (action: SystemMediaKeyAction) => void): Unsubscribe;
    };
    subscribeAudioEngineChanges?: (
        handler: (engineType: string | undefined) => void
    ) => Unsubscribe;
}

export class SystemMediaSessionController {
    private readonly playback: SystemMediaPlaybackPort;
    private readonly mediaSession: MediaSession | null;
    private readonly createMetadata: (init: MediaMetadataInit) => MediaMetadata;
    private readonly resolveArtwork?: (track: Track) => Promise<string | null>;
    private readonly defaultArtwork?: string;
    private readonly positionSyncIntervalMs: number;
    private readonly actionDeduplicationMs: number;
    private readonly nativeMediaKeys?: SystemMediaSessionControllerOptions['nativeMediaKeys'];
    private readonly subscribeAudioEngineChanges?: SystemMediaSessionControllerOptions['subscribeAudioEngineChanges'];
    private unsubscribe: Unsubscribe | null = null;
    private nativeMediaKeysUnsubscribe: Unsubscribe | null = null;
    private audioEngineUnsubscribe: Unsubscribe | null = null;
    private positionTimer: ReturnType<typeof setTimeout> | null = null;
    private lastPositionSyncAt = 0;
    private metadataGeneration = 0;
    private lastAction: MediaSessionAction | null = null;
    private lastActionAt = 0;
    private actionQueue: Promise<void> = Promise.resolve();
    private started = false;

    constructor({
        playback,
        mediaSession = SystemMediaSessionController.getDefaultMediaSession(),
        createMetadata = (init) => new MediaMetadata(init),
        resolveArtwork,
        defaultArtwork,
        positionSyncIntervalMs = 1000,
        actionDeduplicationMs = 250,
        nativeMediaKeys,
        subscribeAudioEngineChanges
    }: SystemMediaSessionControllerOptions) {
        this.playback = playback;
        this.mediaSession = mediaSession;
        this.createMetadata = createMetadata;
        this.resolveArtwork = resolveArtwork;
        this.defaultArtwork = defaultArtwork;
        this.positionSyncIntervalMs = positionSyncIntervalMs;
        this.actionDeduplicationMs = actionDeduplicationMs;
        this.nativeMediaKeys = nativeMediaKeys;
        this.subscribeAudioEngineChanges = subscribeAudioEngineChanges;
    }

    start(): void {
        if (this.started) {
            return;
        }

        this.started = true;
        if (this.mediaSession) {
            this.registerActionHandlers();
        }
        this.unsubscribe = this.playback.subscribe((state, change) => {
            this.handlePlaybackChange(state, change);
        });
        this.nativeMediaKeysUnsubscribe = this.nativeMediaKeys?.onTriggered((action) => {
            this.handleNativeMediaKey(action);
        }) ?? null;
        this.audioEngineUnsubscribe = this.subscribeAudioEngineChanges?.((engineType) => {
            void this.setAudioEngineType(engineType);
        }) ?? null;
        this.syncAll(this.playback.getState());
    }

    dispose(): void {
        this.started = false;
        this.unsubscribe?.();
        this.unsubscribe = null;
        this.nativeMediaKeysUnsubscribe?.();
        this.nativeMediaKeysUnsubscribe = null;
        this.audioEngineUnsubscribe?.();
        this.audioEngineUnsubscribe = null;
        void this.setAudioEngineType(null);
        this.clearPositionTimer();
        this.metadataGeneration++;

        if (!this.mediaSession) {
            return;
        }

        MEDIA_ACTIONS.forEach((action) => {
            this.setActionHandler(action, null);
        });
        this.mediaSession.metadata = null;
        this.mediaSession.playbackState = 'none';
        this.clearPositionState();
    }

    async setAudioEngineType(engineType: string | null | undefined): Promise<void> {
        if (!this.nativeMediaKeys) {
            return;
        }

        try {
            await this.nativeMediaKeys.setEnabled(engineType === 'wasapi');
        } catch (error) {
            console.warn('⚠️ SystemMediaSessionController: 更新WASAPI媒体键后备失败', error);
        }
    }

    handleAction(action: MediaSessionAction, details?: MediaSessionActionDetails): void {
        const now = Date.now();
        if (this.lastAction === action && now - this.lastActionAt < this.actionDeduplicationMs) {
            return;
        }

        this.lastAction = action;
        this.lastActionAt = now;
        this.actionQueue = this.actionQueue
            .then(async () => {
                await this.executeAction(action, details);
            })
            .catch((error) => {
                console.error(`❌ SystemMediaSessionController: 执行媒体动作失败 (${action})`, error);
            });
    }

    private handleNativeMediaKey(action: SystemMediaKeyAction): void {
        switch (action) {
            case 'playPause':
                this.handleAction(this.playback.getState().isPlaying ? 'pause' : 'play');
                break;
            case 'previousTrack':
                this.handleAction('previoustrack');
                break;
            case 'nextTrack':
                this.handleAction('nexttrack');
                break;
        }
    }

    private static getDefaultMediaSession(): MediaSession | null {
        return typeof navigator !== 'undefined' && 'mediaSession' in navigator
            ? navigator.mediaSession
            : null;
    }

    private registerActionHandlers(): void {
        MEDIA_ACTIONS.forEach((action) => {
            this.setActionHandler(action, (details) => {
                this.handleAction(action, details);
            });
        });
    }

    private setActionHandler(action: MediaSessionAction, handler: MediaSessionActionHandler | null): void {
        try {
            this.mediaSession?.setActionHandler(action, handler);
        } catch (error) {
            console.warn(`⚠️ SystemMediaSessionController: 当前平台不支持媒体动作 ${action}`, error);
        }
    }

    private async executeAction(
        action: MediaSessionAction,
        details?: MediaSessionActionDetails
    ): Promise<void> {
        switch (action) {
            case 'play':
                await this.playback.play();
                break;
            case 'pause':
                await this.playback.pause();
                break;
            case 'previoustrack':
                await this.playback.previousTrack();
                break;
            case 'nexttrack':
                await this.playback.nextTrack();
                break;
            case 'seekbackward':
                await this.seekByOffset(-(details?.seekOffset ?? 10));
                break;
            case 'seekforward':
                await this.seekByOffset(details?.seekOffset ?? 10);
                break;
            case 'seekto':
                if (typeof details?.seekTime === 'number') {
                    await this.playback.seek(details.seekTime);
                }
                break;
        }
    }

    private async seekByOffset(offset: number): Promise<void> {
        const state = this.playback.getState();
        const duration = Number.isFinite(state.duration) ? Math.max(0, state.duration) : 0;
        const position = Math.min(duration, Math.max(0, state.position + offset));
        await this.playback.seek(position);
    }

    private handlePlaybackChange(
        state: Readonly<PlaybackState>,
        change: PlaybackStoreChange
    ): void {
        switch (change.type) {
            case 'trackChanged':
                this.syncMetadata(state.currentTrack);
                this.syncPlaybackState(state);
                this.syncPosition(state, true);
                break;
            case 'playbackStateChanged':
                this.syncPlaybackState(state);
                this.syncPosition(state, true);
                break;
            case 'durationChanged':
                this.syncPosition(state, true);
                break;
            case 'positionChanged':
                this.syncPosition(state, false);
                break;
            default:
                break;
        }
    }

    private syncAll(state: Readonly<PlaybackState>): void {
        this.syncMetadata(state.currentTrack);
        this.syncPlaybackState(state);
        this.syncPosition(state, true);
    }

    private syncMetadata(track: Track | null): void {
        if (!this.mediaSession) {
            return;
        }

        const generation = ++this.metadataGeneration;
        if (!track) {
            this.mediaSession.metadata = null;
            return;
        }

        this.applyMetadata(track, track.cover || this.defaultArtwork || null);
        if (!track.cover && this.resolveArtwork) {
            void this.resolveArtwork(track)
                .then((artwork) => {
                    if (generation === this.metadataGeneration && artwork) {
                        this.applyMetadata(track, artwork);
                    }
                })
                .catch((error) => {
                    console.warn('⚠️ SystemMediaSessionController: 获取系统媒体封面失败', error);
                });
        }
    }

    private applyMetadata(track: Track, artwork: string | null): void {
        if (!this.mediaSession) {
            return;
        }

        const metadata: MediaMetadataInit = {
            title: track.title || track.fileName || '未知歌曲',
            artist: track.artist || '未知艺术家',
            album: track.album || ''
        };
        if (artwork) {
            metadata.artwork = [{src: artwork}];
        }

        this.mediaSession.metadata = this.createMetadata(metadata);
    }

    private syncPlaybackState(state: Readonly<PlaybackState>): void {
        if (!this.mediaSession) {
            return;
        }

        this.mediaSession.playbackState = state.currentTrack
            ? (state.isPlaying ? 'playing' : 'paused')
            : 'none';
    }

    private syncPosition(state: Readonly<PlaybackState>, force: boolean): void {
        if (!this.mediaSession) {
            return;
        }

        if (!this.hasValidPositionState(state)) {
            this.clearPositionTimer();
            this.clearPositionState();
            return;
        }

        const elapsed = Date.now() - this.lastPositionSyncAt;
        if (force || elapsed >= this.positionSyncIntervalMs) {
            this.publishPosition(state);
            return;
        }

        if (!this.positionTimer) {
            this.positionTimer = setTimeout(() => {
                this.positionTimer = null;
                this.publishPosition(this.playback.getState());
            }, this.positionSyncIntervalMs - elapsed);
        }
    }

    private hasValidPositionState(state: Readonly<PlaybackState>): boolean {
        return Boolean(
            state.currentTrack
            && Number.isFinite(state.duration)
            && state.duration > 0
            && Number.isFinite(state.position)
        );
    }

    private publishPosition(state: Readonly<PlaybackState>): void {
        if (!this.mediaSession || !this.hasValidPositionState(state)) {
            return;
        }

        this.clearPositionTimer();
        this.lastPositionSyncAt = Date.now();
        const duration = state.duration;
        const position = Math.min(duration, Math.max(0, state.position));

        try {
            this.mediaSession.setPositionState({
                duration,
                playbackRate: 1,
                position
            });
        } catch (error) {
            console.warn('⚠️ SystemMediaSessionController: 同步系统媒体进度失败', error);
        }
    }

    private clearPositionState(): void {
        try {
            this.mediaSession?.setPositionState();
        } catch (error) {
            console.warn('⚠️ SystemMediaSessionController: 清理系统媒体进度失败', error);
        }
    }

    private clearPositionTimer(): void {
        if (!this.positionTimer) {
            return;
        }

        clearTimeout(this.positionTimer);
        this.positionTimer = null;
    }
}
