import type {LyricsCandidate, TrackLyricsQuery} from '../../domain/types';
import {rankLyricsCandidates} from '../../domain/candidateMatching';
import {lyricsGateway} from '@/infrastructure/electron';

export type LyricsFetch = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

interface ProviderRequestPolicy {
    concurrency: number;
    minimumIntervalMs: number;
}

interface ScheduledRequest {
    run: () => Promise<Response>;
    resolve: (response: Response) => void;
    reject: (error: unknown) => void;
    signal?: AbortSignal;
    cancelled: boolean;
    onAbort?: () => void;
}

const DEFAULT_REQUEST_TIMEOUT_MS = 12_000;
const requestSchedulers = new Map<string, ProviderRequestScheduler>();

export const providerFetch: LyricsFetch = (input, init = {}) => {
    const url = new URL(String(input));
    const source = providerSource(url.hostname);
    const scheduler = requestSchedulers.get(source) ?? createProviderScheduler(source);
    return scheduler.schedule(() => requestWithTimeout(input, init), init.signal ?? undefined);
};

export async function fetchJson<T>(
    request: LyricsFetch,
    url: string,
    signal: AbortSignal,
    init: RequestInit = {}
): Promise<T> {
    const response = await fetchWithRetry(request, url, signal, init);
    return response.json() as Promise<T>;
}

export async function fetchText(
    request: LyricsFetch,
    url: string,
    signal: AbortSignal,
    init: RequestInit = {}
): Promise<string> {
    const response = await fetchWithRetry(request, url, signal, init);
    return response.text();
}

export class LyricsHttpError extends Error {
    readonly retryable: boolean;

    constructor(readonly status: number, readonly retryAfterMs?: number) {
        super(`歌词请求失败: HTTP ${status}`);
        this.name = 'LyricsHttpError';
        this.retryable = [408, 425, 429, 500, 502, 503, 504].includes(status);
    }
}

async function fetchWithRetry(
    request: LyricsFetch,
    url: string,
    signal: AbortSignal,
    init: RequestInit
): Promise<Response> {
    const maximumAttempts = 3;
    for (let attempt = 0; attempt < maximumAttempts; attempt++) {
        if (signal.aborted) throw signal.reason;
        try {
            const response = await request(url, {...init, signal});
            if (response.ok) return response;
            const error = new LyricsHttpError(response.status, parseRetryAfter(response.headers.get('retry-after')));
            if (!error.retryable || attempt === maximumAttempts - 1) throw error;
            await abortableDelay(error.retryAfterMs ?? retryDelay(attempt), signal);
        } catch (error) {
            if (signal.aborted) throw error;
            if (error instanceof LyricsHttpError) {
                if (!error.retryable || attempt === maximumAttempts - 1) throw error;
            } else if (attempt === maximumAttempts - 1) {
                throw error;
            }
            await abortableDelay(retryDelay(attempt), signal);
        }
    }
    throw new Error('歌词请求失败');
}

class ProviderRequestScheduler {
    private readonly pending: ScheduledRequest[] = [];
    private activeCount = 0;
    private nextStartAt = 0;
    private timer: ReturnType<typeof setTimeout> | null = null;

    constructor(private readonly policy: ProviderRequestPolicy) {}

    schedule(run: () => Promise<Response>, signal?: AbortSignal): Promise<Response> {
        if (signal?.aborted) return Promise.reject(signal.reason);
        return new Promise<Response>((resolve, reject) => {
            const request: ScheduledRequest = {run, resolve, reject, signal, cancelled: false};
            request.onAbort = () => {
                request.cancelled = true;
                reject(signal?.reason);
                this.pump();
            };
            signal?.addEventListener('abort', request.onAbort, {once: true});
            this.pending.push(request);
            this.pump();
        });
    }

    private pump(): void {
        if (this.activeCount >= this.policy.concurrency) return;
        while (this.pending[0]?.cancelled) this.finishPending(this.pending.shift()!);
        if (this.pending.length === 0) return;
        const delay = Math.max(0, this.nextStartAt - Date.now());
        if (delay > 0) {
            if (!this.timer) {
                this.timer = setTimeout(() => {
                    this.timer = null;
                    this.pump();
                }, delay);
            }
            return;
        }

        const request = this.pending.shift()!;
        this.finishPending(request);
        if (request.cancelled) {
            this.pump();
            return;
        }
        this.activeCount++;
        this.nextStartAt = Date.now() + this.policy.minimumIntervalMs;
        void request.run()
            .then(request.resolve, request.reject)
            .finally(() => {
                this.activeCount--;
                this.pump();
            });
        this.pump();
    }

    private finishPending(request: ScheduledRequest): void {
        request.signal?.removeEventListener('abort', request.onAbort!);
    }
}

function createProviderScheduler(source: string): ProviderRequestScheduler {
    const scheduler = new ProviderRequestScheduler(providerRequestPolicy(source));
    requestSchedulers.set(source, scheduler);
    return scheduler;
}

export function providerRequestPolicy(source: string): ProviderRequestPolicy {
    if (source === 'qqmusic') return {concurrency: 1, minimumIntervalMs: 220};
    if (source === 'netease') return {concurrency: 2, minimumIntervalMs: 100};
    if (source === 'kugou') return {concurrency: 2, minimumIntervalMs: 100};
    if (source === 'amll') return {concurrency: 2, minimumIntervalMs: 150};
    return {concurrency: 2, minimumIntervalMs: 100};
}

function providerSource(hostname: string): string {
    if (hostname.endsWith('.qq.com')) return 'qqmusic';
    if (hostname.endsWith('.163.com')) return 'netease';
    if (hostname.endsWith('.kugou.com')) return 'kugou';
    if (hostname === 'amlldb.bikonoo.com') return 'amll';
    return hostname;
}

async function requestWithTimeout(input: RequestInfo | URL, init: RequestInit): Promise<Response> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(new Error('歌词请求超时')), DEFAULT_REQUEST_TIMEOUT_MS);
    const forwardAbort = () => controller.abort(init.signal?.reason);
    init.signal?.addEventListener('abort', forwardAbort, {once: true});
    try {
        return await lyricsGateway.providerRequest(input, {...init, signal: controller.signal});
    } finally {
        clearTimeout(timeout);
        init.signal?.removeEventListener('abort', forwardAbort);
    }
}

function retryDelay(attempt: number): number {
    const base = attempt === 0 ? 300 : 900;
    return base + Math.round(Math.random() * 150);
}

function parseRetryAfter(value: string | null): number | undefined {
    if (!value) return undefined;
    const seconds = Number(value);
    if (Number.isFinite(seconds)) return Math.max(0, seconds * 1000);
    const time = Date.parse(value);
    return Number.isNaN(time) ? undefined : Math.max(0, time - Date.now());
}

function abortableDelay(milliseconds: number, signal: AbortSignal): Promise<void> {
    if (signal.aborted) return Promise.reject(signal.reason);
    return new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
            signal.removeEventListener('abort', onAbort);
            resolve();
        }, milliseconds);
        const onAbort = () => {
            clearTimeout(timer);
            reject(signal.reason);
        };
        signal.addEventListener('abort', onAbort, {once: true});
    });
}

export function rankProviderCandidates(
    query: TrackLyricsQuery,
    candidates: Array<Omit<LyricsCandidate, 'identityScore' | 'qualityScore'>>
): LyricsCandidate[] {
    return rankLyricsCandidates(query, candidates);
}

export function splitArtists(value: string | undefined): string[] {
    return value?.split(/[、/&;,，]+/).map(item => item.trim()).filter(Boolean) ?? [];
}

export function decodeBase64Text(value: string): string {
    const bytes = decodeBase64Bytes(value);
    return new TextDecoder().decode(bytes);
}

export function decodeBase64Bytes(value: string): Uint8Array {
    const binary = atob(value.replace(/\s/g, ''));
    return Uint8Array.from(binary, character => character.charCodeAt(0));
}
