import type {DesktopLyricsSettings as ApiDesktopLyricsSettings} from '@api/types/settings';
import type {AmllLyricLine} from '@applemusic-like-lyrics/ttml';

export type DesktopLyricLine = AmllLyricLine;

export interface DesktopLyricsSettings extends ApiDesktopLyricsSettings {
    layoutMode: 'default' | 'center';
    color: string;
    fontSize: number;
    opacity: number;
}

export interface DesktopLyricsElements {
    container: HTMLElement;
    lyricsMount: HTMLElement;
    controlsBar: HTMLElement;
    lockBtn: HTMLElement;
    lockIcon: HTMLElement;
    unlockIcon: HTMLElement;
    closeBtn: HTMLElement;
}
