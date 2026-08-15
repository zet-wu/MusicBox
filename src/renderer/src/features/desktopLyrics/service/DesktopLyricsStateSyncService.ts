import {desktopLyricsGateway} from '@/infrastructure/electron/DesktopLyricsGateway';
import {getLyricsService} from '@/features/lyrics/service/defaultLyricsServices';
import type {AmllLyricLine} from '@applemusic-like-lyrics/ttml';
import type {DesktopLyricsPlaybackState} from '@api/types/playback';
import type {Track} from '@api/types/track';

export type DesktopLyricsSyncType = 'track' | 'playbackState' | 'position' | 'lyrics';

export interface CurrentDesktopLyricsState {
    currentTrack: Track | null;
    isPlaying: boolean;
    position: number;
}

export interface DesktopLyricsStateSyncOptions {
    getCurrentState: () => CurrentDesktopLyricsState;
}

export class DesktopLyricsStateSyncService {
    private readonly getCurrentState: () => CurrentDesktopLyricsState;

    constructor({getCurrentState}: DesktopLyricsStateSyncOptions) {
        this.getCurrentState = getCurrentState;
    }

    async syncToDesktopLyrics(
        type: DesktopLyricsSyncType,
        data: Track | DesktopLyricsPlaybackState | number | AmllLyricLine[] | null
    ): Promise<void> {
        try {
            switch (type) {
                case 'track':
                    await this.syncTrack(data as Track | null);
                    break;
                case 'playbackState':
                    await desktopLyricsGateway.updatePlaybackState(data as DesktopLyricsPlaybackState);
                    break;
                case 'position':
                    await desktopLyricsGateway.updatePosition(data as number);
                    break;
                case 'lyrics':
                    await desktopLyricsGateway.updateLyrics(data as AmllLyricLine[]);
                    break;
            }
        } catch (error) {
            console.error('❌ 桌面歌词同步失败:', error);
        }
    }

    async loadLyricsForDesktop(track: Track): Promise<void> {
        try {
            const result = await getLyricsService().load(track, new AbortController().signal);
            if (result.document?.render.lines.length) {
                await this.syncToDesktopLyrics('lyrics', result.document.render.lines);
                console.log(`🎵 loadLyricsForDesktop: canonical 歌词已同步`);
            }
        } catch (error) {
            console.error('❌ 为桌面歌词加载歌词失败:', error);
        }
    }

    async syncCurrentStateToDesktopLyrics(): Promise<void> {
        try {
            const {currentTrack, isPlaying, position} = this.getCurrentState();

            if (currentTrack) {
                await desktopLyricsGateway.updateTrack(currentTrack);

                if (currentTrack.title && currentTrack.artist) {
                    await this.loadLyricsForDesktop(currentTrack);
                } else {
                    console.log('🔄 syncCurrentStateToDesktopLyrics: 无法加载歌词，缺少 title 或 artist');
                }
            }

            await this.syncToDesktopLyrics('playbackState', {
                isPlaying,
                position
            });

            await this.syncToDesktopLyrics('position', position);
        } catch (error) {
            console.error('❌ 同步当前状态到桌面歌词失败:', error);
        }
    }

    private async syncTrack(track: Track | null): Promise<void> {
        await desktopLyricsGateway.updateTrack(track);
        if (track && track.title && track.artist) {
            await this.loadLyricsForDesktop(track);
        }
    }
}
