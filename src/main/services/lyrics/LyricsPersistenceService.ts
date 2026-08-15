import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import {isPathWithin} from '../../utils/pathSecurity';

export type PersistedLyricsSource =
    | {kind: 'local'; path: string}
    | {kind: 'embedded'; trackId: string}
    | {
        kind: 'provider';
        providerId: string;
        candidateId: string;
        manuallySelected: boolean;
    };

export interface PersistedLyricsBinding {
    trackId: string;
    canonicalTtmlPath: string;
    source: PersistedLyricsSource;
    updatedAt: number;
}

interface BindingFile {
    version: 1;
    bindings: Record<string, PersistedLyricsBinding>;
}

export class LyricsPersistenceService {
    private readonly lyricsRoot: string;
    private readonly canonicalRoot: string;
    private readonly bindingsPath: string;
    private writeQueue: Promise<void> = Promise.resolve();

    constructor(userDataPath: string) {
        this.lyricsRoot = path.join(userDataPath, 'lyrics');
        this.canonicalRoot = path.join(this.lyricsRoot, 'canonical');
        this.bindingsPath = path.join(this.lyricsRoot, 'bindings.json');
    }

    async read(trackId: string): Promise<{binding: PersistedLyricsBinding; ttml: string} | null> {
        const binding = (await this.readBindingFile()).bindings[trackId];
        if (!binding || !isPathWithin(binding.canonicalTtmlPath, this.canonicalRoot)) return null;

        try {
            const ttml = await fs.promises.readFile(binding.canonicalTtmlPath, 'utf8');
            return {binding, ttml};
        } catch (error: any) {
            if (error?.code === 'ENOENT') return null;
            throw error;
        }
    }

    async getBinding(trackId: string): Promise<PersistedLyricsBinding | null> {
        return (await this.readBindingFile()).bindings[trackId] ?? null;
    }

    async save(trackId: string, ttml: string, source: PersistedLyricsSource): Promise<PersistedLyricsBinding> {
        if (!trackId.trim()) throw new Error('trackId 不能为空');
        if (!ttml.trim()) throw new Error('TTML 内容不能为空');

        return this.enqueueWrite(async () => {
            await fs.promises.mkdir(this.canonicalRoot, {recursive: true});
            const canonicalTtmlPath = this.getCanonicalPath(trackId);
            await this.writeAtomically(canonicalTtmlPath, ttml);

            const store = await this.readBindingFile();
            const binding: PersistedLyricsBinding = {
                trackId,
                canonicalTtmlPath,
                source,
                updatedAt: Date.now()
            };
            store.bindings[trackId] = binding;
            await this.writeBindingFile(store);
            return binding;
        });
    }

    async clearBinding(trackId: string): Promise<boolean> {
        return this.enqueueWrite(async () => {
            const store = await this.readBindingFile();
            if (!store.bindings[trackId]) return false;
            delete store.bindings[trackId];
            await this.writeBindingFile(store);
            return true;
        });
    }

    private getCanonicalPath(trackId: string): string {
        const stableKey = crypto.createHash('sha256').update(trackId).digest('hex');
        return path.join(this.canonicalRoot, `${stableKey}.ttml`);
    }

    private async readBindingFile(): Promise<BindingFile> {
        try {
            const raw = await fs.promises.readFile(this.bindingsPath, 'utf8');
            const parsed = JSON.parse(raw) as Partial<BindingFile>;
            return {
                version: 1,
                bindings: parsed.bindings && typeof parsed.bindings === 'object' ? parsed.bindings : {}
            };
        } catch (error: any) {
            if (error?.code === 'ENOENT') return {version: 1, bindings: {}};
            throw error;
        }
    }

    private async writeBindingFile(store: BindingFile): Promise<void> {
        await fs.promises.mkdir(this.lyricsRoot, {recursive: true});
        await this.writeAtomically(this.bindingsPath, JSON.stringify(store, null, 2));
    }

    private async writeAtomically(targetPath: string, content: string): Promise<void> {
        const temporaryPath = `${targetPath}.${process.pid}.tmp`;
        await fs.promises.writeFile(temporaryPath, content, 'utf8');
        try {
            await fs.promises.rename(temporaryPath, targetPath);
        } catch (error: any) {
            if (process.platform !== 'win32' || error?.code !== 'EEXIST') throw error;
            await fs.promises.unlink(targetPath).catch(unlinkError => {
                if ((unlinkError as NodeJS.ErrnoException)?.code !== 'ENOENT') throw unlinkError;
            });
            await fs.promises.rename(temporaryPath, targetPath);
        }
    }

    private enqueueWrite<T>(operation: () => Promise<T>): Promise<T> {
        const result = this.writeQueue.then(operation, operation);
        this.writeQueue = result.then(() => undefined, () => undefined);
        return result;
    }
}
