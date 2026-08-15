import type {DesktopLyricLine, DesktopLyricsElements} from './DesktopLyricsTypes';

export class DesktopLyricsRenderController {
    private lyrics: DesktopLyricLine[] = [];
    private currentLyricIndex = -1;

    constructor(
        private readonly elements: Pick<DesktopLyricsElements, 'currentLyricEl' | 'nextLyricEl'>
    ) {}

    showDefaultLyrics(): void {
        this.elements.currentLyricEl.textContent = '暂无歌词';
        this.elements.nextLyricEl.textContent = '';
    }

    updateLyrics(lyricsData: DesktopLyricLine[] | unknown): void {
        if (!Array.isArray(lyricsData)) {
            this.reset();
            return;
        }
        this.lyrics = (lyricsData as DesktopLyricLine[]).filter(line => !line.isBG);
        this.currentLyricIndex = -1;
        this.renderCurrentLyric();
    }

    updatePosition(positionSeconds: number): number | null {
        if (!Number.isFinite(positionSeconds)) return null;
        const index = findLine(this.lyrics, positionSeconds * 1000);
        if (index !== this.currentLyricIndex) {
            this.currentLyricIndex = index;
            this.renderCurrentLyric();
        }
        return positionSeconds;
    }

    reset(): void {
        this.lyrics = [];
        this.currentLyricIndex = -1;
        this.showDefaultLyrics();
    }

    setPlaying(_isPlaying: boolean): void {}

    private renderCurrentLyric(): void {
        const current = this.lyrics[this.currentLyricIndex];
        const next = this.lyrics[this.currentLyricIndex + 1];
        this.elements.currentLyricEl.textContent = current ? getText(current) : '暂无歌词';
        this.elements.nextLyricEl.textContent = next ? getText(next) : '';
    }
}

function findLine(lines: DesktopLyricLine[], currentTimeMs: number): number {
    let active = -1;
    for (let index = 0; index < lines.length; index += 1) {
        if (lines[index].startTime > currentTimeMs) break;
        active = index;
    }
    return active;
}

function getText(line: DesktopLyricLine): string {
    return line.words.map(word => word.word).join('');
}
