import { describe, expect, it } from 'vitest';
import { HOUSE_SOUNDS, playDozuki, playHouseDone, playMizumori, playTonkachi, playTonkachiStart } from './houseSounds';
import { soundNames, tonesOf, type Tone } from './sound';
import { varyOf } from './sfxVary';

/**
 * HOUSE-1C: どうづき（掛け声 ＋ ドスン）・とんかち・みずもり・家が できた の 音（サウンド係の 3 案から yuzu が 選んだ もの）。
 * docs/design/HOUSE-1.md §3.1・docs/audio/SOUND.md §6.2。
 */
describe('HOUSE-1C の 音', () => {
  const NAMES = Object.keys(HOUSE_SOUNDS) as (keyof typeof HOUSE_SOUNDS)[];
  const CALLS = NAMES.filter((n) => n.startsWith('dozukiCall'));
  /** Tone の 並び → 表の 名前（無ければ ''） */
  const nameOf = (tones: readonly Tone[]): string => soundNames().find((n) => tonesOf(n) === tones) ?? '';
  const recorder = () => {
    const played: { name: string; semis: number }[] = [];
    return {
      played,
      sound: {
        playTones: (tones: readonly Tone[], semis?: number) => void played.push({ name: nameOf(tones), semis: semis ?? 0 }),
        play: (name: string, semis?: number) => void played.push({ name, semis: semis ?? 0 }),
      },
    };
  };

  it('ぜんぶ 効果音の 表に 登録されて いる（audio.sfx() に 名前が 残る）', () => {
    for (const name of NAMES) expect(tonesOf(name), name).toBe(HOUSE_SOUNDS[name]);
  });

  it('やさしい: 丸い 音と ノイズだけ・立ち上がりは 0.002 秒 以上・部品は 少ない', () => {
    for (const name of NAMES) {
      const tones = HOUSE_SOUNDS[name] as readonly Tone[];
      const parts = tones.reduce((n, t) => n + 1 + (t.partials?.length ?? 0), 0);
      expect(parts, name).toBeLessThanOrEqual((name as string) === 'houseDone' ? 30 : 16); // 部品は ぜんぶで 48 まで（SOUND.md §6.3）
      for (const t of tones) {
        expect(['sine', 'triangle', 'noise'], name).toContain(t.type);
        expect(t.gain, name).toBeGreaterThan(0);
        expect(t.gain, name).toBeLessThanOrEqual(0.8);
        expect(t.attack ?? 0.004, name).toBeGreaterThanOrEqual(0.002);
      }
    }
  });

  it('どうづき: 掛け声は 直前と ちがう もの ＋ いつも ドスン。かためた つちは 小さい 音 だけ', () => {
    const { played, sound } = recorder();
    for (let i = 0; i < CALLS.length * 2; i++) playDozuki(sound);
    const calls = played.filter((p) => p.name.startsWith('dozukiCall')).map((p) => p.name);
    expect(calls).toHaveLength(CALLS.length * 2);
    expect(played.filter((p) => p.name === 'dozukiThud')).toHaveLength(CALLS.length * 2);
    for (let i = 1; i < calls.length; i++) expect(calls[i]).not.toBe(calls[i - 1]);
    expect(new Set(calls).size).toBe(CALLS.length);
    expect(CALLS.length).toBeGreaterThanOrEqual(3);

    const hard = recorder();
    playDozuki(hard.sound, true);
    expect(hard.played.map((p) => p.name)).toEqual(['dozukiSoft']);
  });

  it('とんかち: 3 しゅるい 以上を まわす。和音に 合わせる 音には 高さの ずらしを わたさない', () => {
    const { played, sound } = recorder();
    for (let i = 0; i < 20; i++) playTonkachi(sound);
    expect(new Set(played.map((p) => p.name)).size).toBeGreaterThanOrEqual(3);
    for (let i = 1; i < played.length; i++) expect(played[i]!.name).not.toBe(played[i - 1]!.name);
    for (const p of played) {
      expect(p.name).toMatch(/^tonkachi/);
      if (varyOf(p.name).chord !== 'none') expect(p.semis).toBe(0);
      expect(Math.abs(p.semis)).toBeLessThanOrEqual(1); // ±6% くらいまで（GAMEDEV-TIPS 5）
    }
  });

  it('合図・みずもり は 1 回 1 つ。家が できた は 大きく 祝う 音（big）', () => {
    const { played, sound } = recorder();
    playTonkachiStart(sound);
    playMizumori(sound);
    expect(played.map((p) => p.name)).toEqual(['tonkachiStart', 'mizumori']);
    const done = recorder();
    playHouseDone(done.sound as never);
    expect(done.played).toHaveLength(1);
    expect(varyOf(done.played[0]!.name).big).toBe(true);
  });
});
