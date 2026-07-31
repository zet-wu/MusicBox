import * as mm from 'music-metadata';

interface EmbeddedCoverTask {
    filePath?: string;
    buffer?: Uint8Array;
    mimeType?: string;
}

interface EmbeddedCoverWorkerResult {
    format: string;
    data: Uint8Array;
}

/**
 * 在线程池中解析音频封面，避免 music-metadata 占用 Electron 主线程。
 */
async function extractEmbeddedCover(task: EmbeddedCoverTask): Promise<EmbeddedCoverWorkerResult | null> {
    const options: mm.IOptions = {
        skipPostHeaders: true
    };
    const metadata = task.filePath
        ? await mm.parseFile(task.filePath, options)
        : await mm.parseBuffer(
            task.buffer || new Uint8Array(),
            {
                mimeType: task.mimeType,
                size: task.buffer?.byteLength
            },
            options
        );
    const picture = metadata.common.picture?.[0];

    if (!picture) {
        return null;
    }

    return {
        format: picture.format,
        data: new Uint8Array(picture.data)
    };
}

export = extractEmbeddedCover;
