import type {DesktopLyricsSettings as ApiDesktopLyricsSettings} from '@api/types/settings';
import type {AmllLyricLine} from '@applemusic-like-lyrics/ttml';

export type DesktopLyricLine = AmllLyricLine;

export interface DesktopLyricsSettings extends ApiDesktopLyricsSettings {
    layoutMode: 'default' | 'center';
    themeColor: string;
    fontColor: string;
    opacity: number;
    fontSize: number;
}

export interface DesktopLyricsElements {
    container: HTMLElement;
    currentLyricEl: HTMLElement;
    nextLyricEl: HTMLElement;
    controlsBar: HTMLElement;
    lockBtn: HTMLElement;
    lockIcon: HTMLElement;
    unlockIcon: HTMLElement;
    closeBtn: HTMLElement;
}
