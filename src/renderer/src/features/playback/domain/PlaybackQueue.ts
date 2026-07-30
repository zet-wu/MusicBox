import type {MusicBoxAPIEvents} from '@api/types/events';
import type {
    PlaybackQueueSnapshot,
    PlayMode,
    QueueAdvanceReason,
    QueueEntry,
    QueueMutationResult
} from '@api/types/playback';
import type {Track} from '@api/types/track';
import {deduplicateTracks, isSameTrack} from './TrackIdentity';

type Emit = <K extends keyof MusicBoxAPIEvents>(event: K, data: MusicBoxAPIEvents[K]) => void;

interface PlaybackQueueOptions {
    emit: Emit;
    persistPlayMode: (mode: PlayMode) => void;
    createQueueId?: () => string;
    random?: () => number;
}

interface ReplaceQueueOptions {
    startIndex?: number;
    playMode?: PlayMode;
    shuffleAll?: boolean;
}

const EMPTY_MUTATION_RESULT: QueueMutationResult = {
    added: 0,
    moved: 0,
    skippedExisting: 0,
    skippedCurrent: 0,
    startedPlayback: false
};

export class PlaybackQueue {
    private readonly emit: Emit;
    private readonly persistPlayMode: (mode: PlayMode) => void;
    private readonly createQueueId: () => string;
    private readonly random: () => number;
    private entries: QueueEntry[] = [];
    private currentQueueId: string | null = null;
    private playMode: PlayMode = 'sequence';

    constructor({
        emit,
        persistPlayMode,
        createQueueId = () => globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`,
        random = Math.random
    }: PlaybackQueueOptions) {
        this.emit = emit;
        this.persistPlayMode = persistPlayMode;
        this.createQueueId = createQueueId;
        this.random = random;
    }

    replaceQueue(tracks: Track[], options: ReplaceQueueOptions = {}): PlaybackQueueSnapshot {
        const startTrack = options.startIndex !== undefined && options.startIndex >= 0
            ? tracks[options.startIndex]
            : null;
        const uniqueTracks = deduplicateTracks(tracks);
        this.entries = uniqueTracks.map((track) => this.createEntry(track));

        const currentEntry = startTrack
            ? this.entries.find((entry) => isSameTrack(entry.track, startTrack))
            : null;
        this.currentQueueId = currentEntry?.queueId ?? null;

        if (options.playMode) {
            this.setPlayMode(options.playMode);
        }

        if (options.shuffleAll) {
            this.entries = this.shuffle(this.entries);
        }
        return this.getSnapshot();
    }

    appendToQueue(tracks: Track[]): QueueMutationResult {
        const uniqueTracks = deduplicateTracks(tracks);
        const newTracks = uniqueTracks.filter((track) => !this.findEntryByTrack(track));
        const skippedExisting = uniqueTracks.length - newTracks.length;
        if (newTracks.length === 0) {
            return {...EMPTY_MUTATION_RESULT, skippedExisting};
        }

        const newEntries = newTracks.map((track) => this.createEntry(track));
        const shouldStartPlayback = this.entries.length === 0 || this.currentQueueId === null;

        if (this.playMode === 'shuffle') {
            this.insertRandomlyAfterCurrent(newEntries);
        } else {
            this.entries.push(...newEntries);
        }

        if (shouldStartPlayback && this.entries.length > 0) {
            if (this.playMode === 'shuffle') {
                this.entries = this.shuffle(this.entries);
            }
            this.currentQueueId = this.entries[0].queueId;
        }

        return {
            ...EMPTY_MUTATION_RESULT,
            added: newEntries.length,
            skippedExisting,
            startedPlayback: shouldStartPlayback
        };
    }

    playNext(tracks: Track[]): QueueMutationResult {
        const uniqueTracks = deduplicateTracks(tracks);
        const currentEntry = this.getCurrentEntry();
        const requestedTracks = uniqueTracks.filter((track) => !isSameTrack(track, currentEntry?.track));
        const skippedCurrent = uniqueTracks.length - requestedTracks.length;
        if (requestedTracks.length === 0) {
            return {...EMPTY_MUTATION_RESULT, skippedCurrent};
        }

        let moved = 0;
        let added = 0;
        const requestedEntries = requestedTracks.map((track) => {
            const existingEntry = this.findEntryByTrack(track);
            if (existingEntry) {
                moved += 1;
                return existingEntry;
            }
            added += 1;
            return this.createEntry(track);
        });
        const requestedIds = new Set(requestedEntries.map((entry) => entry.queueId));
        this.entries = this.entries.filter((entry) => !requestedIds.has(entry.queueId));

        const currentIndex = this.getCurrentIndex();
        const insertionIndex = currentIndex >= 0 ? currentIndex + 1 : 0;
        this.entries.splice(insertionIndex, 0, ...requestedEntries);

        const shouldStartPlayback = this.currentQueueId === null && this.entries.length > 0;
        if (shouldStartPlayback) {
            this.currentQueueId = this.entries[0].queueId;
        }

        return {
            ...EMPTY_MUTATION_RESULT,
            added,
            moved,
            skippedCurrent,
            startedPlayback: shouldStartPlayback
        };
    }

    moveQueueEntry(queueId: string, targetIndex: number): boolean {
        const sourceIndex = this.entries.findIndex((entry) => entry.queueId === queueId);
        if (sourceIndex === -1) {
            return false;
        }

        const [entry] = this.entries.splice(sourceIndex, 1);
        const boundedTarget = Math.max(0, Math.min(targetIndex, this.entries.length));
        this.entries.splice(boundedTarget, 0, entry);
        return true;
    }

    removeQueueEntry(queueId: string): QueueEntry | null {
        const index = this.entries.findIndex((entry) => entry.queueId === queueId);
        if (index === -1) {
            return null;
        }

        const [removed] = this.entries.splice(index, 1);
        if (removed.queueId === this.currentQueueId) {
            this.currentQueueId = null;
        }
        return removed;
    }

    setCurrentIndex(index: number): boolean {
        const entry = this.entries[index];
        if (!entry) {
            if (index === -1) {
                this.currentQueueId = null;
                return true;
            }
            return false;
        }

        this.currentQueueId = entry.queueId;
        return true;
    }

    getNextIndex(reason: QueueAdvanceReason): number {
        if (this.entries.length === 0) {
            return -1;
        }

        const currentIndex = this.getCurrentIndex();
        if (reason === 'track-ended' && this.playMode === 'repeat-one') {
            return currentIndex >= 0 ? currentIndex : 0;
        }

        if (currentIndex < this.entries.length - 1) {
            return currentIndex + 1;
        }

        if (this.playMode === 'shuffle' && this.entries.length > 1) {
            const justFinishedId = this.currentQueueId;
            this.entries = this.shuffle(this.entries);
            if (this.entries[0].queueId === justFinishedId) {
                [this.entries[0], this.entries[1]] = [this.entries[1], this.entries[0]];
            }
        }

        return 0;
    }

    peekNextIndex(reason: QueueAdvanceReason): number {
        if (this.entries.length === 0) {
            return -1;
        }

        const currentIndex = this.getCurrentIndex();
        if (reason === 'track-ended' && this.playMode === 'repeat-one') {
            return currentIndex >= 0 ? currentIndex : 0;
        }

        if (currentIndex < this.entries.length - 1) {
            return currentIndex + 1;
        }

        // 随机模式会在循环边界刷新显式队列，边界处不预加载旧排列。
        return this.playMode === 'shuffle' ? -1 : 0;
    }

    getPreviousIndex(): number {
        if (this.entries.length === 0) {
            return -1;
        }

        const currentIndex = this.getCurrentIndex();
        return currentIndex > 0 ? currentIndex - 1 : this.entries.length - 1;
    }

    commitCurrentIndex(index: number): boolean {
        return this.setCurrentIndex(index);
    }

    shuffleUpcoming(): void {
        if (this.entries.length <= 1) {
            return;
        }

        const currentIndex = this.getCurrentIndex();
        const shuffleStart = currentIndex >= 0 ? currentIndex + 1 : 0;
        const prefix = this.entries.slice(0, shuffleStart);
        const suffix = this.shuffle(this.entries.slice(shuffleStart));
        this.entries = [...prefix, ...suffix];
    }

    getEntries(): QueueEntry[] {
        return this.entries.map((entry) => ({...entry}));
    }

    getTracks(): Track[] {
        return this.entries.map((entry) => entry.track);
    }

    getCurrentIndex(): number {
        if (!this.currentQueueId) {
            return -1;
        }
        return this.entries.findIndex((entry) => entry.queueId === this.currentQueueId);
    }

    getCurrentEntry(): QueueEntry | null {
        const currentIndex = this.getCurrentIndex();
        return currentIndex >= 0 ? this.entries[currentIndex] : null;
    }

    getSnapshot(): PlaybackQueueSnapshot {
        return {
            entries: this.getEntries(),
            currentQueueId: this.currentQueueId,
            playMode: this.playMode
        };
    }

    restore(snapshot: PlaybackQueueSnapshot): void {
        const currentTrack = snapshot.entries.find((entry) => entry.queueId === snapshot.currentQueueId)?.track;
        const uniqueTracks = deduplicateTracks(snapshot.entries.map((entry) => entry.track));
        this.entries = uniqueTracks.map((track) => {
            const savedEntry = snapshot.entries.find((entry) => isSameTrack(entry.track, track));
            return {
                queueId: savedEntry?.queueId || this.createQueueId(),
                track
            };
        });
        this.currentQueueId = currentTrack
            ? this.entries.find((entry) => isSameTrack(entry.track, currentTrack))?.queueId ?? null
            : null;
        this.setPlayMode(snapshot.playMode);
    }

    clearHistory(): void {
        // 兼容旧调用；显式队列的上一曲由可见顺序决定。
    }

    pushHistory(_index: number): void {
        // 兼容旧调用；显式队列不维护隐藏播放历史。
    }

    removeLastHistoryIndexIfMatches(_index: number): void {
        // 兼容旧调用；显式队列不维护隐藏播放历史。
    }

    setPlayMode(mode: unknown): boolean {
        const validModes: PlayMode[] = ['sequence', 'shuffle', 'repeat-one'];
        if (!validModes.includes(mode as PlayMode)) {
            return false;
        }

        const previousMode = this.playMode;
        this.playMode = mode as PlayMode;
        if (previousMode !== 'shuffle' && this.playMode === 'shuffle') {
            this.shuffleUpcoming();
        }
        this.emit('playModeChanged', this.playMode);
        this.persistPlayMode(this.playMode);
        return true;
    }

    getPlayMode(): PlayMode {
        return this.playMode;
    }

    togglePlayMode(): PlayMode {
        const modes: PlayMode[] = ['sequence', 'shuffle', 'repeat-one'];
        const currentIndex = modes.indexOf(this.playMode);
        const nextIndex = (currentIndex + 1) % modes.length;
        this.setPlayMode(modes[nextIndex]);
        return this.playMode;
    }

    getNextTrackIndex(playlist: Track[], currentIndex: number): number {
        if (playlist.length === 0) {
            return -1;
        }
        if (this.playMode === 'repeat-one') {
            return currentIndex;
        }
        return (currentIndex + 1) % playlist.length;
    }

    getPreviousTrackIndex(playlist: Track[], currentIndex: number): number {
        if (playlist.length === 0) {
            return -1;
        }
        return currentIndex > 0 ? currentIndex - 1 : playlist.length - 1;
    }

    private createEntry(track: Track): QueueEntry {
        return {
            queueId: this.createQueueId(),
            track
        };
    }

    private findEntryByTrack(track: Track): QueueEntry | undefined {
        return this.entries.find((entry) => isSameTrack(entry.track, track));
    }

    private insertRandomlyAfterCurrent(newEntries: QueueEntry[]): void {
        const currentIndex = this.getCurrentIndex();
        const insertionStart = currentIndex >= 0 ? currentIndex + 1 : 0;
        const prefix = this.entries.slice(0, insertionStart);
        const future = this.entries.slice(insertionStart);
        const randomizedEntries = this.shuffle(newEntries);

        randomizedEntries.forEach((entry) => {
            const insertionIndex = Math.floor(this.random() * (future.length + 1));
            future.splice(insertionIndex, 0, entry);
        });
        this.entries = [...prefix, ...future];
    }

    private shuffle<T>(values: T[]): T[] {
        const result = [...values];
        for (let index = result.length - 1; index > 0; index -= 1) {
            const swapIndex = Math.floor(this.random() * (index + 1));
            [result[index], result[swapIndex]] = [result[swapIndex], result[index]];
        }
        return result;
    }
}
