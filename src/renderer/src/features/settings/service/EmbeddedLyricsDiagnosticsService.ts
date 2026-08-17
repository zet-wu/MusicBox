import {mediaFileDialogService} from "@/features/media/service";
import {lyricsGateway} from '@/infrastructure/electron';

interface DebugEmbeddedLyricsResult {
    success: boolean;
    error?: string;
    lyricsAnalysis?: {
        type?: string;
        format?: string;
        language?: string;
        description?: string;
        synchronized?: boolean;
        textLength?: number;
        timestampCount?: number;
        textSample?: string;
    };
}

export interface EmbeddedLyricsDiagnosticsReport {
    selected: boolean;
    foundLyrics: boolean;
    filePath?: string;
    report?: string;
    error?: string;
}

class EmbeddedLyricsDiagnosticsService {
    async chooseFileAndBuildReport(): Promise<EmbeddedLyricsDiagnosticsReport> {
        const filePaths = await mediaFileDialogService.openFiles();
        if (!filePaths || filePaths.length === 0) {
            return {selected: false, foundLyrics: false};
        }

        const filePath = filePaths[0];
        const result = await lyricsGateway.getEmbedded(filePath);
        const lyrics = result.lyrics;
        const debugResult: DebugEmbeddedLyricsResult = {
            success: result.success,
            error: result.error,
            lyricsAnalysis: lyrics ? {
                type: lyrics.type,
                format: lyrics.format,
                language: lyrics.language,
                description: lyrics.description,
                synchronized: lyrics.synchronized,
                textLength: lyrics.text?.length ?? 0,
                timestampCount: lyrics.timestamps?.length ?? 0,
                textSample: lyrics.text?.slice(0, 500)
            } : undefined
        };

        return {
            selected: true,
            foundLyrics: debugResult.success && !!debugResult.lyricsAnalysis,
            filePath,
            report: this.buildReport(filePath, debugResult),
            error: debugResult.error
        };
    }

    private buildReport(filePath: string, debugResult: DebugEmbeddedLyricsResult): string {
        const reportLines: string[] = [
            `文件: ${filePath}`,
            `时间: ${new Date().toLocaleString()}`,
            ``,
            `=== 检测结果 ===`,
            `成功: ${debugResult.success ? '是' : '否'}`
        ];

        if (debugResult.success && debugResult.lyricsAnalysis) {
            const analysis = debugResult.lyricsAnalysis;
            reportLines.push(
                ``,
                `=== 歌词信息 ===`,
                `类型: ${analysis.type}`,
                `格式: ${analysis.format}`,
                `语言: ${analysis.language || '未知'}`,
                `描述: ${analysis.description || '无'}`,
                `同步歌词: ${analysis.synchronized ? '是' : '否'}`,
                `文本长度: ${analysis.textLength} 字符`,
                `时间戳数量: ${analysis.timestampCount}`,
                ``
            );

            if (analysis.textSample) {
                reportLines.push(`=== 歌词预览 ===`, analysis.textSample, ``);
            }

        } else {
            reportLines.push(`错误: ${debugResult.error || '未知错误'}`);
        }

        return reportLines.join('\n');
    }
}

export const embeddedLyricsDiagnosticsService = new EmbeddedLyricsDiagnosticsService();
