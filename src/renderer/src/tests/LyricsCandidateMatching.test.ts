import {describe, expect, it} from 'vitest';
import {rankLyricsCandidates, scoreLyricsCandidateIdentity} from '@/features/lyrics/domain/candidateMatching';

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
        expect(candidates[0].identityScore).toBeGreaterThan(90);
    });

    it('允许缺少专辑或时长，但对明显时长错误降权', () => {
        const missing = scoreLyricsCandidateIdentity(query, {
            providerId: 'test',
            candidateId: 'missing',
            title: 'Some Song',
            artists: ['Artist']
        });
        const mismatch = scoreLyricsCandidateIdentity(query, {
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

    it('统一中文简繁、日文新旧字体和汉字迭代符后评分', () => {
        const score = scoreLyricsCandidateIdentity({
            trackId: 'shinai',
            title: '深愛',
            artists: ['水樹奈々'],
            album: 'THE MUSEUM II',
            durationMs: 296_277
        }, {
            providerId: 'qqmusic',
            candidateId: 'shinai-qq',
            title: '深爱',
            artists: ['水树奈奈'],
            album: 'THE MUSEUM II',
            durationMs: 296_000,
            capabilities: {wordTimed: true}
        });

        expect(score).toBeGreaterThanOrEqual(98);
    });

    it('将日文新字体、旧字体与对应简体映射到共同候选形式', () => {
        const japanese = scoreLyricsCandidateIdentity({
            trackId: 'sawada',
            title: '時の過ぎゆくままに',
            artists: ['沢田研二'],
            durationMs: 202_000
        }, {
            providerId: 'test',
            candidateId: 'traditional',
            title: '時の過ぎゆくままに',
            artists: ['澤田研二'],
            durationMs: 202_000
        });
        const simplified = scoreLyricsCandidateIdentity({
            trackId: 'sawada',
            title: '時の過ぎゆくままに',
            artists: ['沢田研二'],
            durationMs: 202_000
        }, {
            providerId: 'test',
            candidateId: 'simplified',
            title: '时の过ぎゆくままに',
            artists: ['泽田研二'],
            durationMs: 202_000
        });

        expect(japanese).toBeGreaterThanOrEqual(90);
        expect(simplified).toBeGreaterThanOrEqual(90);
    });
});
