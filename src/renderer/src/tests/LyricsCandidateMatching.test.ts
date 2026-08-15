import {describe, expect, it} from 'vitest';
import {rankLyricsCandidates, scoreLyricsCandidate} from '@/features/lyrics/domain/candidateMatching';

const query = {
    trackId: 'track-1',
    title: 'Some Song',
    artists: ['Artist'],
    album: 'Album',
    durationMs: 222_000
};

describe('lyrics candidate matching', () => {
    it('优先标题、艺术家、专辑与时长均匹配的候选', () => {
        const candidates = rankLyricsCandidates(query, [{
            providerId: 'test',
            candidateId: 'wrong-version',
            title: 'Some Song (Live)',
            artists: ['Other Artist'],
            durationMs: 280_000
        }, {
            providerId: 'test',
            candidateId: 'exact',
            title: 'Some Song',
            artists: ['Artist'],
            album: 'Album',
            durationMs: 221_000
        }]);

        expect(candidates[0].candidateId).toBe('exact');
        expect(candidates[0].matchScore).toBeGreaterThan(90);
    });

    it('允许缺少专辑或时长，但对明显时长错误降权', () => {
        const missing = scoreLyricsCandidate(query, {
            providerId: 'test',
            candidateId: 'missing',
            title: 'Some Song',
            artists: ['Artist']
        });
        const mismatch = scoreLyricsCandidate(query, {
            providerId: 'test',
            candidateId: 'mismatch',
            title: 'Some Song',
            artists: ['Artist'],
            album: 'Album',
            durationMs: 320_000
        });

        expect(missing).toBeGreaterThan(mismatch);
    });

    it('identity 接近时偏好完整 TTML 和逐字歌词', () => {
        const candidates = rankLyricsCandidates(query, [{
            providerId: 'line',
            candidateId: 'lrc',
            title: 'Some Song',
            artists: ['Artist'],
            album: 'Album',
            durationMs: 222_000,
            capabilities: {lineTimed: true}
        }, {
            providerId: 'ttml',
            candidateId: 'ttml',
            title: 'Some Song',
            artists: ['Artist'],
            album: 'Album',
            durationMs: 222_000,
            capabilities: {wordTimed: true, ttml: true}
        }]);

        expect(candidates[0].candidateId).toBe('ttml');
    });
});
