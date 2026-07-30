import {describe, expect, it} from 'vitest';
import {PlaybackQueue} from '../features/playback/domain/PlaybackQueue';
import type {Track} from '../api/types/track';

function createTrack(name: string): Track {
    return {
        fileId: name,
        filePath: `C:\\Music\\${name}.flac`,
        title: name,
        artist: '测试艺术家'
    };
}

function createQueue(randomValues: number[] = []): PlaybackQueue {
    let id = 0;
    let randomIndex = 0;
    return new PlaybackQueue({
        emit: () => undefined,
        persistPlayMode: () => undefined,
        createQueueId: () => `queue-${id++}`,
        random: () => randomValues[randomIndex++] ?? 0
    });
}

describe('PlaybackQueue', () => {
    it('追加时过滤输入和现有队列中的重复歌曲', () => {
        const queue = createQueue();
        const first = createTrack('first');
        const second = createTrack('second');

        const initialResult = queue.appendToQueue([first, first, second]);
        const repeatedResult = queue.appendToQueue([
            {...first, filePath: 'D:\\Other\\first.flac'},
            second
        ]);

        expect(initialResult).toMatchObject({added: 2, startedPlayback: true});
        expect(repeatedResult).toMatchObject({added: 0, skippedExisting: 2});
        expect(queue.getTracks()).toEqual([first, second]);
        expect(queue.getCurrentIndex()).toBe(0);
    });

    it('下一首播放会移动已有歌曲、加入新歌曲并跳过当前歌曲', () => {
        const queue = createQueue();
        const first = createTrack('first');
        const second = createTrack('second');
        const third = createTrack('third');
        const fourth = createTrack('fourth');
        queue.replaceQueue([first, second, third], {startIndex: 1});

        const result = queue.playNext([first, second, fourth]);

        expect(result).toMatchObject({
            added: 1,
            moved: 1,
            skippedCurrent: 1,
            startedPlayback: false
        });
        expect(queue.getTracks()).toEqual([second, first, fourth, third]);
        expect(queue.getCurrentIndex()).toBe(0);
    });

    it('进入随机模式时只重排当前歌曲之后的显式队列', () => {
        const queue = createQueue([0, 0]);
        const tracks = ['a', 'b', 'c', 'd'].map(createTrack);
        queue.replaceQueue(tracks, {startIndex: 1});

        queue.setPlayMode('shuffle');

        expect(queue.getTracks().map((track) => track.fileId)).toEqual(['a', 'b', 'd', 'c']);
        expect(queue.getCurrentIndex()).toBe(1);
    });

    it('随机模式新一轮重新洗牌且第一首不立即重复上一轮末曲', () => {
        const queue = createQueue([0, 0, 0, 0]);
        const tracks = ['a', 'b', 'c'].map(createTrack);
        queue.replaceQueue(tracks, {startIndex: 2});
        queue.setPlayMode('shuffle');

        const nextIndex = queue.getNextIndex('track-ended');
        queue.commitCurrentIndex(nextIndex);

        expect(nextIndex).toBe(0);
        expect(queue.getTracks()[0].fileId).not.toBe('c');
        expect(new Set(queue.getTracks().map((track) => track.fileId))).toEqual(new Set(['a', 'b', 'c']));
        expect(queue.getCurrentIndex()).toBe(0);
    });

    it('单曲循环只约束自然结束，手动下一首仍切换', () => {
        const queue = createQueue();
        queue.replaceQueue(['a', 'b'].map(createTrack), {startIndex: 0});
        queue.setPlayMode('repeat-one');

        expect(queue.getNextIndex('track-ended')).toBe(0);
        expect(queue.getNextIndex('manual-next')).toBe(1);
    });
});
