import { describe, expect, it } from 'vitest';
import { ARCHITECT_SOUNDS, playArchitect } from './architectSounds';
import { tonesOf, type Tone } from './sound';

/** HOUSE-1A: 建築士さんの 声（仮）。E2E の 約束: 名前に architect / kenchiku / popo / voice の どれかを ふくむ */
describe('建築士さんの 声（仮の 音）', () => {
  const VOICE = /architect|kenchiku|popo|voice/i;

  it('名前が E2E の 約束に 合い、効果音の 表に 登録されて いる（audio.sfx() に 名前が 残る）', () => {
    for (const name of Object.keys(ARCHITECT_SOUNDS)) {
      expect(name).toMatch(VOICE);
      expect(tonesOf(name), name).toBe(ARCHITECT_SOUNDS[name as keyof typeof ARCHITECT_SOUNDS]);
    }
  });

  it('やわらかく 小さい: 丸い 音（sine）だけ・音量は 0.25 以下・全部で 0.5 秒 いない・部品は 少ない', () => {
    const tones = ARCHITECT_SOUNDS.architect_voice as readonly Tone[];
    expect(tones.length).toBeLessThanOrEqual(8);
    for (const t of tones) {
      expect(t.type).toBe('sine');
      expect(t.gain).toBeLessThanOrEqual(0.25);
      expect(t.delay + t.dur).toBeLessThan(0.5);
    }
    // 「ぽ」が 3 つ（ゆっくり 入る 丸い 音）
    expect(tones.filter((t) => (t.attack ?? 0) >= 0.01 && t.gain >= 0.15)).toHaveLength(3);
  });

  it('鳴らす たびに 高さが 少しずつ かわる（半音。乱数なし）', () => {
    const played: number[] = [];
    const sound = { playTones: (_t: readonly Tone[], semis?: number) => void played.push(semis ?? 0) };
    for (let i = 0; i < 10; i++) playArchitect(sound, 'architect_voice');
    expect(new Set(played).size).toBeGreaterThanOrEqual(4);
    expect(played[0]).not.toBe(played[1]);
    for (const s of played) expect(Math.abs(s)).toBeLessThanOrEqual(2);
  });
});
