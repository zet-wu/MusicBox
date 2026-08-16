import type {Track} from '@api/types/track';
import {lyricsGateway} from '@/infrastructure/electron';
import {getLyricsService, lyricsProviderRegistry, lyricsSearchService} from '../service/defaultLyricsServices';
import {toTrackLyricsQuery} from '../service/LyricsService';
import type {LyricsCandidate, LyricsCandidatePreview, LyricsDocument, TrackLyricsQuery} from '../domain/types';
import {describeLyricsCandidatePreview, describeLyricsDocument} from '../domain/describeLyricsCandidatePreview';
import type {ProviderSearchResult} from '../service/LyricsSearchService';
import {TtmlDocumentService} from '../format/TtmlDocumentService';

type PickerTab = 'current' | 'embedded' | 'local' | string;

export interface LyricsDocumentAppliedDetail {
    trackId: string;
    document: LyricsDocument;
}

export class LyricsSourcePicker {
    private readonly root: HTMLElement;
    private readonly tabs: HTMLElement;
    private readonly content: HTMLElement;
    private readonly preview: HTMLElement;
    private readonly status: HTMLElement;
    private readonly ttmlService = new TtmlDocumentService();
    private track: Track | null = null;
    private query: TrackLyricsQuery | null = null;
    private activeTab: PickerTab = 'current';
    private searchController: AbortController | null = null;
    private inspectionController: AbortController | null = null;
    private readonly searchResults = new Map<string, ProviderSearchResult>();
    private readonly previewCache = new Map<string, LyricsCandidatePreview>();
    private readonly previewRequests = new Map<string, Promise<LyricsCandidatePreview>>();
    private selectedCandidate: LyricsCandidate | null = null;
    private selectedPreview: LyricsCandidatePreview | null = null;
    private localPreview: LyricsCandidatePreview | null | undefined;
    private embeddedPreview: LyricsCandidatePreview | null | undefined;

    constructor() {
        this.root = document.createElement('div');
        this.root.className = 'lyrics-source-picker';
        this.root.hidden = true;
        this.root.innerHTML = `
            <div class="lyrics-source-picker__backdrop" data-action="close"></div>
            <section class="lyrics-source-picker__dialog" role="dialog" aria-modal="true" aria-label="选择歌词">
                <header class="lyrics-source-picker__header">
                    <div><h2>选择歌词</h2><p class="lyrics-source-picker__track"></p></div>
                    <button type="button" data-action="close" aria-label="关闭">×</button>
                </header>
                <nav class="lyrics-source-picker__tabs" aria-label="歌词来源"></nav>
                <div class="lyrics-source-picker__body">
                    <div class="lyrics-source-picker__results"></div>
                    <aside class="lyrics-source-picker__preview"><p>选择候选后预览</p></aside>
                </div>
                <footer class="lyrics-source-picker__footer">
                    <span class="lyrics-source-picker__status"></span>
                    <div>
                        <button type="button" data-action="auto">重新自动匹配</button>
                        <button type="button" data-action="clear">清除手动绑定</button>
                        <button type="button" data-action="refresh">刷新当前来源</button>
                        <button type="button" class="primary" data-action="apply" disabled>使用此歌词</button>
                    </div>
                </footer>
            </section>`;
        document.body.appendChild(this.root);
        this.tabs = this.requireElement('.lyrics-source-picker__tabs');
        this.content = this.requireElement('.lyrics-source-picker__results');
        this.preview = this.requireElement('.lyrics-source-picker__preview');
        this.status = this.requireElement('.lyrics-source-picker__status');
        this.root.addEventListener('click', event => void this.handleClick(event));
        document.addEventListener('keydown', event => {
            if (event.key === 'Escape' && !this.root.hidden) this.close();
        });
    }

    async open(track: Track): Promise<void> {
        this.closeRequests();
        this.track = track;
        this.query = toTrackLyricsQuery(track);
        this.activeTab = 'current';
        this.selectedCandidate = null;
        this.selectedPreview = null;
        this.localPreview = undefined;
        this.embeddedPreview = undefined;
        this.searchResults.clear();
        this.previewCache.clear();
        this.previewRequests.clear();
        this.inspectionController = new AbortController();
        this.root.hidden = false;
        this.requireElement('.lyrics-source-picker__track').textContent = `${track.title} · ${track.artist}`;
        this.renderTabs();
        await this.renderCurrent();
        this.startProviderSearches();
    }

    close(): void {
        this.closeRequests();
        this.root.hidden = true;
        this.track = null;
        this.query = null;
    }

    destroy(): void {
        this.close();
        this.root.remove();
    }

    private startProviderSearches(): void {
        if (!this.query) return;
        this.searchController = new AbortController();
        for (const provider of lyricsProviderRegistry.list()) {
            this.searchResults.set(provider.id, {
                providerId: provider.id,
                displayName: provider.displayName,
                state: 'loading',
                candidates: []
            });
            void lyricsSearchService.searchProvider(provider.id, this.query, this.searchController.signal)
                .then(result => {
                    this.searchResults.set(provider.id, result);
                    if (this.activeTab === provider.id) this.renderActiveTab();
                })
                .catch(() => undefined);
        }
    }

    private renderTabs(): void {
        const tabs = [
            {id: 'current', label: '当前'},
            {id: 'embedded', label: '内嵌'},
            {id: 'local', label: '本地'},
            ...lyricsProviderRegistry.list().map(provider => ({id: provider.id, label: provider.displayName}))
        ];
        this.tabs.replaceChildren(...tabs.map(tab => {
            const button = document.createElement('button');
            button.type = 'button';
            button.dataset.tab = tab.id;
            button.textContent = tab.label;
            button.classList.toggle('active', tab.id === this.activeTab);
            return button;
        }));
    }

    private async renderCurrent(): Promise<void> {
        const query = this.query;
        if (!query) return;
        this.activeTab = 'current';
        this.renderTabs();
        this.content.innerHTML = '<div class="lyrics-source-picker__loading">正在读取当前绑定...</div>';
        const result = await lyricsGateway.readCanonical(query.trackId);
        if (this.query !== query || this.activeTab !== 'current') return;
        if (!result.success || !result.binding) {
            this.content.innerHTML = '<div class="lyrics-source-picker__empty">当前没有歌词绑定</div>';
            return;
        }
        const source = result.binding.source;
        const description = source.kind === 'provider'
            ? `${source.providerId} · ${result.binding.selectionMode === 'manual' ? '手动选择' : '自动匹配'}`
            : source.kind === 'local' ? `本地 · ${source.path}` : '音频内嵌';
        this.content.innerHTML = `<article class="lyrics-candidate current"><strong>当前使用</strong><p></p><div class="lyrics-candidate__badges"></div></article>`;
        const paragraph = this.content.querySelector('p');
        if (paragraph) paragraph.textContent = description;
        const labels = ['已绑定'];
        if (result.ttml) {
            try {
                const ttml = this.ttmlService.parse(result.ttml);
                labels.push('TTML', ...describeLyricsDocument({
                    ttmlText: result.ttml,
                    ttml,
                    render: this.ttmlService.project(ttml),
                    source
                }));
            } catch (error) {
                console.warn('⚠️ Lyrics: 当前绑定 TTML 徽章解析失败', error);
            }
        }
        this.renderBadgeLabels(this.content.querySelector('article')!, labels);
    }

    private renderActiveTab(): void {
        this.renderTabs();
        this.setStatus('');
        if (this.activeTab === 'current') {
            void this.renderCurrent();
            return;
        }
        if (this.activeTab === 'local') {
            void this.renderLocal();
            return;
        }
        if (this.activeTab === 'embedded') {
            void this.renderEmbedded();
            return;
        }

        const result = this.searchResults.get(this.activeTab);
        if (!result || result.state === 'loading') {
            this.content.innerHTML = '<div class="lyrics-source-picker__loading">正在搜索...</div>';
            return;
        }
        if (result.state === 'error') {
            this.content.innerHTML = `<div class="lyrics-source-picker__empty"><p></p><button type="button" data-action="retry">重试</button></div>`;
            const paragraph = this.content.querySelector('p');
            if (paragraph) paragraph.textContent = result.error ?? '搜索失败';
            return;
        }
        if (result.candidates.length === 0) {
            this.content.innerHTML = '<div class="lyrics-source-picker__empty">没有搜索到候选歌词</div>';
            return;
        }
        this.content.replaceChildren(...result.candidates.map(candidate => this.createCandidateRow(candidate)));
        void this.inspectCandidates(result.providerId, result.candidates);
    }

    private createCandidateRow(candidate: LyricsCandidate): HTMLElement {
        const row = document.createElement('button');
        row.type = 'button';
        row.className = 'lyrics-candidate';
        row.dataset.candidateId = candidate.candidateId;
        const duration = candidate.durationMs ? formatDuration(candidate.durationMs) : '--:--';
        row.innerHTML = `<strong></strong><p></p><div class="lyrics-candidate__badges"></div><span class="lyrics-candidate__score"></span>`;
        row.querySelector('strong')!.textContent = candidate.title;
        row.querySelector('p')!.textContent = `${candidate.artists.join(' / ') || '未知艺术家'} · ${candidate.album || '未知专辑'} · ${duration}`;
        row.querySelector('.lyrics-candidate__score')!.textContent = `匹配度 ${candidate.identityScore}%`;
        const preview = this.previewCache.get(candidateKey(candidate));
        if (preview) this.renderCandidateBadges(row, preview);
        return row;
    }

    private async renderLocal(): Promise<void> {
        const query = this.query;
        if (!query) return;
        if (this.localPreview === undefined) {
            this.content.innerHTML = '<div class="lyrics-source-picker__loading">正在查找本地歌词...</div>';
            this.localPreview = await getLyricsService().previewLocal(query);
        }
        if (this.query !== query || this.activeTab !== 'local') return;
        if (!this.localPreview) {
            this.content.innerHTML = '<div class="lyrics-source-picker__empty">没有找到匹配的本地歌词</div>';
            return;
        }

        const source = this.localPreview.document.source;
        if (source.kind !== 'local') return;
        const row = this.createSourceRow('local', source.path.split(/[\\/]/).pop() || source.path, source.path);
        this.renderCandidateBadges(row, this.localPreview);
        this.content.replaceChildren(row);
    }

    private async renderEmbedded(): Promise<void> {
        const query = this.query;
        if (!query) return;
        if (this.embeddedPreview === undefined) {
            this.content.innerHTML = '<div class="lyrics-source-picker__loading">正在读取内嵌歌词...</div>';
            this.embeddedPreview = await getLyricsService().previewEmbedded(query);
        }
        if (this.query !== query || this.activeTab !== 'embedded') return;
        if (!this.embeddedPreview) {
            this.content.innerHTML = '<div class="lyrics-source-picker__empty">当前音频没有可用的内嵌歌词</div>';
            return;
        }

        const row = this.createSourceRow('embedded', '音频内嵌歌词', this.query.filePath || this.query.title);
        this.renderCandidateBadges(row, this.embeddedPreview);
        this.content.replaceChildren(row);
    }

    private createSourceRow(kind: 'local' | 'embedded', title: string, description: string): HTMLElement {
        const row = document.createElement('button');
        row.type = 'button';
        row.className = 'lyrics-candidate';
        row.dataset.sourceKind = kind;
        row.innerHTML = '<strong></strong><p></p><div class="lyrics-candidate__badges"></div>';
        row.querySelector('strong')!.textContent = title;
        row.querySelector('p')!.textContent = description;
        return row;
    }

    private async inspectCandidates(providerId: string, candidates: LyricsCandidate[]): Promise<void> {
        const query = this.query;
        const controller = this.inspectionController;
        if (!query || !controller || controller.signal.aborted) return;
        let nextIndex = 0;
        const worker = async () => {
            while (nextIndex < candidates.length && !controller.signal.aborted) {
                const candidate = candidates[nextIndex++];
                try {
                    const preview = await this.resolveCandidate(query, candidate, controller.signal);
                    if (this.activeTab === providerId) this.updateCandidateBadges(candidate, preview);
                } catch (error) {
                    if (!controller.signal.aborted && this.activeTab === providerId) {
                        this.updateCandidateError(candidate, error);
                    }
                }
            }
        };
        await Promise.all(Array.from({length: Math.min(3, candidates.length)}, worker));
    }

    private resolveCandidate(
        query: TrackLyricsQuery,
        candidate: LyricsCandidate,
        signal: AbortSignal
    ): Promise<LyricsCandidatePreview> {
        const key = candidateKey(candidate);
        const cached = this.previewCache.get(key);
        if (cached) return Promise.resolve(cached);
        const pending = this.previewRequests.get(key);
        if (pending) return pending;
        const request = getLyricsService().previewCandidate(query, candidate, signal)
            .then(preview => {
                if (signal.aborted) throw signal.reason;
                this.previewCache.set(key, preview);
                return preview;
            })
            .finally(() => {
                if (this.previewRequests.get(key) === request) this.previewRequests.delete(key);
            });
        this.previewRequests.set(key, request);
        return request;
    }

    private updateCandidateBadges(candidate: LyricsCandidate, preview: LyricsCandidatePreview): void {
        const row = this.findCandidateRow(candidate);
        if (row) this.renderCandidateBadges(row, preview);
    }

    private renderCandidateBadges(row: HTMLElement, preview: LyricsCandidatePreview): void {
        this.renderBadgeLabels(row, describeLyricsCandidatePreview(preview));
    }

    private renderBadgeLabels(row: HTMLElement, labels: string[]): void {
        const badges = row.querySelector('.lyrics-candidate__badges');
        if (!badges) return;
        badges.replaceChildren(...labels.map(label => {
            const badge = document.createElement('span');
            badge.className = 'badge';
            badge.textContent = label;
            return badge;
        }));
    }

    private updateCandidateError(candidate: LyricsCandidate, error: unknown): void {
        const row = this.findCandidateRow(candidate);
        const badges = row?.querySelector('.lyrics-candidate__badges');
        if (!badges) return;
        const badge = document.createElement('span');
        badge.className = 'badge error';
        badge.textContent = '解析失败';
        badge.title = error instanceof Error ? error.message : String(error);
        badges.replaceChildren(badge);
    }

    private findCandidateRow(candidate: LyricsCandidate): HTMLElement | undefined {
        return Array.from(this.content.querySelectorAll<HTMLElement>('[data-candidate-id]'))
            .find(row => row.dataset.candidateId === candidate.candidateId);
    }

    private async selectCandidate(candidateId: string): Promise<void> {
        const result = this.searchResults.get(this.activeTab);
        const candidate = result?.candidates.find(item => item.candidateId === candidateId);
        if (!candidate || !this.query) return;
        this.selectedCandidate = candidate;
        this.selectedPreview = null;
        this.content.querySelectorAll('.lyrics-candidate').forEach(row => {
            row.classList.toggle('selected', (row as HTMLElement).dataset.candidateId === candidateId);
        });
        this.getActionButton('apply').disabled = true;
        this.preview.innerHTML = '<p>正在获取预览...</p>';

        const cacheKey = `${candidate.providerId}:${candidate.candidateId}`;
        let resolved = this.previewCache.get(cacheKey);
        if (!resolved) {
            const controller = this.inspectionController;
            if (!controller) return;
            try {
                resolved = await this.resolveCandidate(this.query, candidate, controller.signal);
                this.updateCandidateBadges(candidate, resolved);
            } catch (error) {
                if (!controller.signal.aborted) this.preview.textContent = error instanceof Error ? error.message : String(error);
                return;
            }
        }
        if (this.selectedCandidate !== candidate) return;
        this.renderDocumentPreview(resolved.document);
        this.getActionButton('apply').disabled = false;
    }

    private selectSourcePreview(kind: 'local' | 'embedded'): void {
        const preview = kind === 'local' ? this.localPreview : this.embeddedPreview;
        if (!preview) return;
        this.selectedCandidate = null;
        this.selectedPreview = preview;
        this.content.querySelectorAll('.lyrics-candidate').forEach(row => {
            row.classList.toggle('selected', (row as HTMLElement).dataset.sourceKind === kind);
        });
        this.renderDocumentPreview(preview.document);
        this.getActionButton('apply').disabled = false;
    }

    private renderDocumentPreview(document: LyricsDocument): void {
        this.preview.replaceChildren(...document.render.lines.slice(0, 6).map(line => {
            const block = documentNode('div', line.words.map(word => word.word).join(''));
            if (line.translatedLyric) block.appendChild(documentNode('small', line.translatedLyric));
            if (line.romanLyric) block.appendChild(documentNode('small', line.romanLyric));
            return block;
        }));
    }

    private async applySelected(): Promise<void> {
        if (!this.query || (!this.selectedCandidate && !this.selectedPreview)) return;
        this.getActionButton('apply').disabled = true;
        this.setStatus('正在应用歌词...');
        try {
            const preview = this.selectedPreview
                ?? (this.selectedCandidate ? this.previewCache.get(candidateKey(this.selectedCandidate)) : undefined);
            if (!preview) throw new Error('候选预览已失效，请重新选择');
            const result = await getLyricsService().applyPreview(this.query, preview);
            if (!result.document) throw new Error(result.error ?? '应用歌词失败');
            window.dispatchEvent(new CustomEvent<LyricsDocumentAppliedDetail>('lyrics:document-applied', {
                detail: {trackId: this.query.trackId, document: result.document}
            }));
            this.setStatus('歌词已应用');
            await this.renderCurrent();
        } catch (error) {
            this.setStatus(error instanceof Error ? error.message : String(error));
            this.getActionButton('apply').disabled = false;
        }
    }

    private async rerunAutomaticMatch(): Promise<void> {
        if (!this.track || !this.query) return;
        this.setStatus('正在重新匹配...');
        await getLyricsService().clearBinding(this.track);
        const controller = new AbortController();
        const result = await getLyricsService().load(this.track, controller.signal);
        if (result.document) {
            window.dispatchEvent(new CustomEvent<LyricsDocumentAppliedDetail>('lyrics:document-applied', {
                detail: {trackId: this.query.trackId, document: result.document}
            }));
            this.setStatus('自动匹配完成');
            await this.renderCurrent();
        } else {
            this.setStatus(result.error ?? '未找到歌词');
        }
    }

    private async clearBinding(): Promise<void> {
        if (!this.track) return;
        await getLyricsService().clearBinding(this.track);
        this.setStatus('已清除绑定，外置歌词文件未被删除');
        await this.renderCurrent();
    }

    private retryActiveProvider(): void {
        if (!this.query || ['current', 'local', 'embedded'].includes(this.activeTab)) return;
        const provider = lyricsProviderRegistry.get(this.activeTab);
        if (!provider) return;
        this.resetCandidateInspections();
        this.selectedCandidate = null;
        this.getActionButton('apply').disabled = true;
        this.preview.innerHTML = '<p>选择候选后预览</p>';
        const controller = this.searchController ?? new AbortController();
        this.searchController = controller;
        this.searchResults.set(provider.id, {providerId: provider.id, displayName: provider.displayName, state: 'loading', candidates: []});
        this.renderActiveTab();
        void lyricsSearchService.searchProvider(provider.id, this.query, controller.signal).then(result => {
            this.searchResults.set(provider.id, result);
            this.renderActiveTab();
        });
    }

    private async refreshCurrentSource(): Promise<void> {
        if (!this.query) return;
        if (this.activeTab === 'local') {
            this.localPreview = undefined;
            this.selectedPreview = null;
            this.getActionButton('apply').disabled = true;
            await this.renderLocal();
            return;
        }
        if (this.activeTab === 'embedded') {
            this.embeddedPreview = undefined;
            this.selectedPreview = null;
            this.getActionButton('apply').disabled = true;
            await this.renderEmbedded();
            return;
        }
        if (this.activeTab !== 'current') {
            this.retryActiveProvider();
            return;
        }
        const result = await lyricsGateway.getBinding(this.query.trackId);
        if (!result.success || !result.binding) throw new Error(result.error ?? '当前没有歌词绑定');
        this.setStatus('正在刷新当前来源...');
        const controller = new AbortController();
        const refreshed = await getLyricsService().refreshBinding(this.query, result.binding, controller.signal);
        if (!refreshed.document) throw new Error(refreshed.error ?? '刷新当前来源失败');
        window.dispatchEvent(new CustomEvent<LyricsDocumentAppliedDetail>('lyrics:document-applied', {
            detail: {trackId: this.query.trackId, document: refreshed.document}
        }));
        this.setStatus('当前来源已刷新');
        await this.renderCurrent();
    }

    private async handleClick(event: Event): Promise<void> {
        const target = event.target as HTMLElement;
        const action = target.closest<HTMLElement>('[data-action]')?.dataset.action;
        if (action === 'close') this.close();
        else if (action === 'apply') await this.applySelected();
        else if (action === 'auto') await this.rerunAutomaticMatch();
        else if (action === 'clear') await this.clearBinding();
        else if (action === 'refresh') await this.refreshCurrentSource();
        else if (action === 'retry') this.retryActiveProvider();

        const tab = target.closest<HTMLElement>('[data-tab]')?.dataset.tab;
        if (tab) {
            this.activeTab = tab;
            this.selectedCandidate = null;
            this.selectedPreview = null;
            this.getActionButton('apply').disabled = true;
            this.preview.innerHTML = '<p>选择候选后预览</p>';
            this.renderActiveTab();
        }
        const candidateId = target.closest<HTMLElement>('[data-candidate-id]')?.dataset.candidateId;
        if (candidateId) await this.selectCandidate(candidateId);
        const sourceKind = target.closest<HTMLElement>('[data-source-kind]')?.dataset.sourceKind;
        if (sourceKind === 'local' || sourceKind === 'embedded') this.selectSourcePreview(sourceKind);
    }

    private getActionButton(action: string): HTMLButtonElement {
        return this.root.querySelector<HTMLButtonElement>(`[data-action="${action}"]`)!;
    }

    private setStatus(message: string): void {
        this.status.textContent = message;
    }

    private closeRequests(): void {
        this.searchController?.abort();
        this.inspectionController?.abort();
        this.searchController = null;
        this.inspectionController = null;
        this.previewRequests.clear();
    }

    private resetCandidateInspections(): void {
        this.inspectionController?.abort();
        this.inspectionController = new AbortController();
        this.previewCache.clear();
        this.previewRequests.clear();
    }

    private requireElement(selector: string): HTMLElement {
        const element = this.root.querySelector<HTMLElement>(selector);
        if (!element) throw new Error(`歌词选择器缺少元素: ${selector}`);
        return element;
    }
}

let picker: LyricsSourcePicker | null = null;

export function getLyricsSourcePicker(): LyricsSourcePicker {
    picker ??= new LyricsSourcePicker();
    return picker;
}

function formatDuration(milliseconds: number): string {
    const totalSeconds = Math.round(milliseconds / 1000);
    return `${Math.floor(totalSeconds / 60)}:${String(totalSeconds % 60).padStart(2, '0')}`;
}

function documentNode(tagName: string, text: string): HTMLElement {
    const element = document.createElement(tagName);
    element.textContent = text;
    return element;
}

function candidateKey(candidate: LyricsCandidate): string {
    return `${candidate.providerId}:${candidate.candidateId}`;
}
