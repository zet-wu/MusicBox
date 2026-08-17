export interface KrcWord {
    text: string;
    startTime: number;
    endTime: number;
}

export interface KrcLine {
    text: string;
    startTime: number;
    endTime: number;
    words: KrcWord[];
    translation?: string;
    romanization?: string;
    romanizationWords?: KrcWord[];
}

export interface KrcParseResult {
    lines: KrcLine[];
}
