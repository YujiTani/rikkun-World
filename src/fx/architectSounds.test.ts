import { describe, expect, it } from 'vitest';
import { ARCHITECT_SOUNDS, playArchitect } from './architectSounds';
import { tonesOf, type Tone } from './sound';

/**
 * HOUSE-1A: 建築士さんの 声「ぽぽぽ」（サウンド係の 3 案から yuzu が 選んだ もの）。
 * 今の src/fx/architectSounds.test.ts の 2 つ目（「sine だけ・0.5 秒 いない・部品 8 つ いない」）は 仮の 音 専用なので、これと 入れかえる。
 * E2E の 約束: 名前に architect / kenchiku / popo / voice の どれかを ふくむ（e2e/helpers/house.ts）。
 */
describe('建築士さんの 声「ぽぽぽ」', () => {
  const VOICE = /architect|kenchiku|popo|voice/i;
  const NAMES = Object.keys(ARCHITECT_SOUNDS) as (keyof typeof ARCHITECT_SOUNDS)[];
  const tablesOf = (): (readonly Tone[])[] => NAMES.map((n) => ARCHITECT_SOUNDS[n] as readonly Tone[]);

  /** 聞こえなくなる 時刻（秒）。いちばん 大きい 部品より 40 dB 小さく なる 所まで。sound.ts の 包み（直線で のぼって 指数で 0.0001 まで さがる）と 同じ 計算 */
  function audibleEnd(tones: readonly Tone[]): number {
    const layers: { gain: number; attack: number; start: number; end: number }[] = [];
    for (const t of tones) {
      const attack = Math.max(0.002, t.attack ?? 0.004);
      const peak = t.gain * (t.type === 'noise' ? 4 : 1); // ノイズは 4 倍（NOISE_BOOST）
      layers.push({ gain: peak, attack, start: t.delay, end: t.delay + Math.max(t.dur, attack + 0.01) });
      for (const p of t.partials ?? []) {
        layers.push({ gain: peak * p.gain, attack, start: t.delay, end: t.delay + Math.max(t.dur * (p.durScale ?? 1), attack + 0.01) });
      }
    }
    const top = Math.max(...layers.map((l) => l.gain));
    let last = 0;
    for (const l of layers) {
      if (l.gain <= top * 0.01) continue; // はじめから 40 dB より 小さい
      // gain × (0.0001 / gain) ^ x = top × 0.01 を とく（x: 0〜1 ＝ のぼりきってから おわりまで）
      const x = Math.log((top * 0.01) / l.gain) / Math.log(0.0001 / l.gain);
      last = Math.max(last, l.start + l.attack + x * (l.end - l.start - l.attack));
    }
    return last;
  }

  it('名前が E2E の 約束に 合い、効果音の 表に 登録されて いる（audio.sfx() に 名前が 残る）', () => {
    for (const name of NAMES) {
      expect(name).toMatch(VOICE);
      expect(tonesOf(name), name).toBe(ARCHITECT_SOUNDS[name]);
    }
  });

  it('やさしい: 丸い 音（sine・triangle）と ごく 小さな 息（noise）だけ・音量は 小さい・部品は 少ない', () => {
    for (const tones of tablesOf()) {
      const parts = tones.reduce((n, t) => n + 1 + (t.partials?.length ?? 0), 0);
      expect(parts).toBeLessThanOrEqual(18); // 1 つの 音に 使える 部品は 48 まで。ほかの 音と かさなっても あふれない
      for (const t of tones) {
        expect(['sine', 'triangle', 'noise']).toContain(t.type);
        expect(t.gain).toBeLessThanOrEqual(0.25);
        expect(t.attack ?? 0.004).toBeGreaterThanOrEqual(0.002); // 0.002 秒より 速い 立ち上がりは プチッと 鳴る
        if (t.type === 'noise') expect(t.gain).toBeLessThanOrEqual(0.05); // 息は ほんの 少し
      }
    }
  });

  it('みじかい: 聞こえる 長さは 0.3〜0.65 秒（1 回の 話で 1 回。ふきだしの あいだ ずっとは 鳴らさない）', () => {
    for (const tones of tablesOf()) {
      expect(audibleEnd(tones)).toBeGreaterThan(0.3);
      expect(audibleEnd(tones)).toBeLessThanOrEqual(0.65);
    }
  });

  it('「ぽ」が 3 つ: ほかより 大きい 丸い 音が ちょうど 3 つ', () => {
    for (const tones of tablesOf()) {
      const sines = tones.filter((t) => t.type === 'sine');
      const top = Math.max(...sines.map((t) => t.gain));
      expect(sines.filter((t) => t.gain >= top * 0.8)).toHaveLength(3);
    }
  });

  it('話しかける たびに かわる: 3 しゅるいを じゅんばんに・高さも すこしずつ（半音 2 つぶん まで。乱数なし）', () => {
    const played: { tones: readonly Tone[]; semis: number }[] = [];
    const sound = { playTones: (tones: readonly Tone[], semis?: number) => void played.push({ tones, semis: semis ?? 0 }) };
    for (let i = 0; i < 9; i++) playArchitect(sound, 'architect_voice');
    // となりどうしは ちがう 声・どの 声も 同じ 回数
    for (let i = 1; i < played.length; i++) expect(played[i].tones).not.toBe(played[i - 1].tones);
    const counts = new Map<readonly Tone[], number>();
    for (const p of played) counts.set(p.tones, (counts.get(p.tones) ?? 0) + 1);
    expect(counts.size).toBe(NAMES.length);
    for (const n of counts.values()) expect(n).toBe(9 / NAMES.length);
    // 高さの ずれ
    expect(new Set(played.map((p) => p.semis)).size).toBeGreaterThanOrEqual(4);
    expect(played[0].semis).not.toBe(played[1].semis);
    for (const p of played) expect(Math.abs(p.semis)).toBeLessThanOrEqual(2);
  });

  it('名前を 決めて 鳴らす（architect_voice 以外）と、その 声を そのまま 鳴らす', () => {
    for (const name of NAMES.filter((n) => n !== 'architect_voice')) {
      const played: (readonly Tone[])[] = [];
      playArchitect({ playTones: (tones) => void played.push(tones) }, name);
      expect(played).toEqual([ARCHITECT_SOUNDS[name]]);
    }
  });
});
