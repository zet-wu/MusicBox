import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import {app} from 'electron';

export type LibrarySourceType = 'directory' | 'file';
export type LibrarySourceOrigin =
    | 'settings'
    | 'scan'
    | 'file_import'
    | 'playlist_binding'
    | 'migration';

export interface LibrarySourceKnownFile {
    path: string;
    canonicalPath: string;
    trackId?: string;
}

export interface LibrarySource {
    id: string;
    type: LibrarySourceType;
    path: string;
    canonicalPath: string;
    origin: LibrarySourceOrigin;
    knownFiles: LibrarySourceKnownFile[];
    createdAt: number;
    lastScanAt?: number;
}

export interface PlaylistSourceBinding {
    id: string;
    playlistId: string;
    sourceId: string;
    managedFiles: LibrarySourceKnownFile[];
    excludedPaths: string[];
    createdAt: number;
    lastSyncAt?: number;
}

interface LibrarySourceData {
    version: 1;
    sources: LibrarySource[];
    playlistBindings: PlaylistSourceBinding[];
}

export interface LegacyLibrarySourceData {
    musicFolders: string[];
    scannedDirectories: string[];
    tracks: Array<{
        fileId: string;
        filePath: string;
    }>;
}

export interface LibrarySourceLoadResult {
    migrated: boolean;
    sourceCount: number;
    directorySourceCount: number;
    fileSourceCount: number;
}

const CURRENT_VERSION = 1;

export class LibrarySourceManager {
    private readonly sourceFilePath: string;
    private data: LibrarySourceData = {
        version: CURRENT_VERSION,
        sources: [],
        playlistBindings: []
    };
    private loaded = false;
    private loadPromise: Promise<LibrarySourceLoadResult> | null = null;

    constructor(sourceFilePath?: string) {
        if (sourceFilePath) {
            this.sourceFilePath = sourceFilePath;
            return;
        }

        try {
            this.sourceFilePath = path.join(app.getPath('userData'), 'music-library-sources.json');
        } catch {
            this.sourceFilePath = path.join(process.cwd(), 'music-library-sources.json');
        }
    }

    async loadAndMigrate(legacyData: LegacyLibrarySourceData): Promise<LibrarySourceLoadResult> {
        if (this.loaded) return this.createLoadResult(false);
        if (this.loadPromise) return this.loadPromise;
        this.loadPromise = this.loadAndMigrateInternal(legacyData);
        try {
            return await this.loadPromise;
        } finally {
            this.loadPromise = null;
        }
    }

    private async loadAndMigrateInternal(legacyData: LegacyLibrarySourceData): Promise<LibrarySourceLoadResult> {
        try {
            const raw = await fs.promises.readFile(this.sourceFilePath, 'utf8');
            this.data = this.validateData(JSON.parse(raw));
            this.loaded = true;
            return this.createLoadResult(false);
        } catch (error: any) {
            if (error.code !== 'ENOENT') {
                throw new Error(`加载音乐库来源失败: ${error.message}`);
            }
        }

        this.data = this.migrateLegacyData(legacyData);
        await this.save();
        this.loaded = true;
        console.log(`✅ LibrarySourceManager: 已迁移 ${this.data.sources.length} 个音乐库来源`);
        return this.createLoadResult(true);
    }

    async ensureSource(
        type: LibrarySourceType,
        sourcePath: string,
        origin: LibrarySourceOrigin
    ): Promise<{source: LibrarySource; created: boolean}> {
        this.assertLoaded();
        const id = this.createSourceId(type, sourcePath);
        const existing = this.data.sources.find(source => source.id === id);
        if (existing) return {source: this.cloneSource(existing), created: false};

        const source = this.createSource(type, sourcePath, origin, Date.now());
        this.data.sources.push(source);
        await this.save();
        return {source: this.cloneSource(source), created: true};
    }

    async updateSourceScan(
        sourceId: string,
        knownFiles: LibrarySourceKnownFile[],
        fullScan: boolean
    ): Promise<LibrarySource> {
        this.assertLoaded();
        const source = this.data.sources.find(item => item.id === sourceId);
        if (!source) throw new Error('音乐库来源不存在');

        const normalizedFiles = this.mergeKnownFiles(
            fullScan ? [] : source.knownFiles,
            knownFiles
        );
        source.knownFiles = normalizedFiles;
        source.lastScanAt = Date.now();
        await this.save();
        return this.cloneSource(source);
    }

    async save(): Promise<void> {
        const temporaryPath = `${this.sourceFilePath}.tmp`;
        try {
            await fs.promises.mkdir(path.dirname(this.sourceFilePath), {recursive: true});
            await fs.promises.writeFile(temporaryPath, JSON.stringify(this.data, null, 2), 'utf8');
            await fs.promises.rename(temporaryPath, this.sourceFilePath);
        } catch (error) {
            await fs.promises.unlink(temporaryPath).catch(() => undefined);
            console.error('❌ LibrarySourceManager: 保存音乐库来源失败:', error);
            throw error;
        }
    }

    getSources(): LibrarySource[] {
        return this.data.sources.map(source => this.cloneSource(source));
    }

    getPlaylistBindings(): PlaylistSourceBinding[] {
        return this.data.playlistBindings.map(binding => ({
            ...binding,
            managedFiles: binding.managedFiles.map(file => ({...file})),
            excludedPaths: [...binding.excludedPaths]
        }));
    }

    canonicalize(sourcePath: string): string {
        if (sourcePath.startsWith('network://')) {
            const normalized = sourcePath.replace(/\\/g, '/').replace(/\/+$/, '');
            const separatorIndex = normalized.indexOf('/', 'network://'.length);
            if (separatorIndex === -1) return normalized.toLowerCase();
            return normalized.slice(0, separatorIndex).toLowerCase() + normalized.slice(separatorIndex);
        }

        const normalized = path.normalize(path.resolve(sourcePath));
        return process.platform === 'win32' ? normalized.toLowerCase() : normalized;
    }

    createSourceId(type: LibrarySourceType, sourcePath: string): string {
        return crypto
            .createHash('sha256')
            .update(`${type}:${this.canonicalize(sourcePath)}`)
            .digest('hex');
    }

    private migrateLegacyData(legacyData: LegacyLibrarySourceData): LibrarySourceData {
        const now = Date.now();
        const sources: LibrarySource[] = [];
        const directoryPaths = this.uniquePaths([
            ...(legacyData.musicFolders || []),
            ...(legacyData.scannedDirectories || [])
        ]);

        for (const directoryPath of directoryPaths) {
            sources.push(this.createSource('directory', directoryPath, 'migration', now));
        }

        for (const track of legacyData.tracks || []) {
            if (directoryPaths.some(directoryPath => this.containsPath(directoryPath, track.filePath))) continue;

            const source = this.createSource('file', track.filePath, 'migration', now);
            source.knownFiles = [{
                path: track.filePath,
                canonicalPath: this.canonicalize(track.filePath),
                trackId: track.fileId
            }];
            sources.push(source);
        }

        return {
            version: CURRENT_VERSION,
            sources,
            playlistBindings: []
        };
    }

    private createSource(
        type: LibrarySourceType,
        sourcePath: string,
        origin: LibrarySourceOrigin,
        createdAt: number
    ): LibrarySource {
        return {
            id: this.createSourceId(type, sourcePath),
            type,
            path: sourcePath,
            canonicalPath: this.canonicalize(sourcePath),
            origin,
            knownFiles: [],
            createdAt
        };
    }

    private containsPath(directoryPath: string, filePath: string): boolean {
        const canonicalDirectory = this.canonicalize(directoryPath);
        const canonicalFile = this.canonicalize(filePath);

        if (canonicalDirectory.startsWith('network://')) {
            return canonicalFile === canonicalDirectory || canonicalFile.startsWith(`${canonicalDirectory}/`);
        }

        const relativePath = path.relative(canonicalDirectory, canonicalFile);
        return relativePath === '' || (!relativePath.startsWith('..') && !path.isAbsolute(relativePath));
    }

    private uniquePaths(paths: string[]): string[] {
        const seen = new Set<string>();
        return paths.filter(sourcePath => {
            if (!sourcePath || typeof sourcePath !== 'string') return false;
            const canonicalPath = this.canonicalize(sourcePath);
            if (seen.has(canonicalPath)) return false;
            seen.add(canonicalPath);
            return true;
        });
    }

    private validateData(data: any): LibrarySourceData {
        if (data?.version !== CURRENT_VERSION) {
            throw new Error(`不支持的音乐库来源数据版本: ${data?.version ?? '未知'}`);
        }

        const sources: LibrarySource[] = Array.isArray(data.sources)
            ? data.sources.filter((source: any) => (
                source
                && typeof source.id === 'string'
                && (source.type === 'directory' || source.type === 'file')
                && typeof source.path === 'string'
            )).map((source: any) => ({
                ...source,
                canonicalPath: this.canonicalize(source.path),
                knownFiles: this.validateKnownFiles(source.knownFiles)
            }))
            : [];
        const sourceIds = new Set(sources.map(source => source.id));
        const playlistBindings: PlaylistSourceBinding[] = Array.isArray(data.playlistBindings)
            ? data.playlistBindings.filter((binding: any) => (
                binding
                && typeof binding.id === 'string'
                && typeof binding.playlistId === 'string'
                && typeof binding.sourceId === 'string'
                && sourceIds.has(binding.sourceId)
            )).map((binding: any) => ({
                ...binding,
                managedFiles: this.validateKnownFiles(binding.managedFiles),
                excludedPaths: Array.isArray(binding.excludedPaths)
                    ? Array.from(new Set(
                        binding.excludedPaths.filter((value: any) => typeof value === 'string')
                    )) as string[]
                    : []
            }))
            : [];

        return {
            version: CURRENT_VERSION,
            sources,
            playlistBindings
        };
    }

    private validateKnownFiles(files: any): LibrarySourceKnownFile[] {
        if (!Array.isArray(files)) return [];
        return files.filter((file: any) => (
            file
            && typeof file.path === 'string'
        )).map((file: any) => ({
            path: file.path,
            canonicalPath: this.canonicalize(file.path),
            trackId: typeof file.trackId === 'string' ? file.trackId : undefined
        }));
    }

    private mergeKnownFiles(
        existingFiles: LibrarySourceKnownFile[],
        newFiles: LibrarySourceKnownFile[]
    ): LibrarySourceKnownFile[] {
        const filesByPath = new Map<string, LibrarySourceKnownFile>();
        for (const file of [...existingFiles, ...newFiles]) {
            if (!file?.path) continue;
            const canonicalPath = this.canonicalize(file.path);
            filesByPath.set(canonicalPath, {
                path: file.path,
                canonicalPath,
                trackId: file.trackId
            });
        }
        return Array.from(filesByPath.values());
    }

    private cloneSource(source: LibrarySource): LibrarySource {
        return {
            ...source,
            knownFiles: source.knownFiles.map(file => ({...file}))
        };
    }

    private assertLoaded(): void {
        if (!this.loaded) throw new Error('音乐库来源尚未加载');
    }

    private createLoadResult(migrated: boolean): LibrarySourceLoadResult {
        return {
            migrated,
            sourceCount: this.data.sources.length,
            directorySourceCount: this.data.sources.filter(source => source.type === 'directory').length,
            fileSourceCount: this.data.sources.filter(source => source.type === 'file').length
        };
    }
}
