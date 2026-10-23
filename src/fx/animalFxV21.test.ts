import { describe, expect, it } from 'vitest';
import type { AnimalEvent, AnimalView } from '../contracts';
import { ANIMAL_SOUNDS } from './animalSounds';
import { ANIMAL_FX, AnimalFx, TILE } from './animalFx';
import type { Tone } from './sound';

const view = (id: number, o: Partial<AnimalView> = {}): AnimalView => ({
  id, x: 0, y: 9, z: 0, yaw: 0, headYaw: 0, state: 'idle', stateTicks: 0, friend: true, hearts: 0, targeted: false, ...o,
});
function make(motion = 1) {
  const fx = new AnimalFx({ sound: { playTones: (_t: readonly Tone[]) => undefined }, motion: () => motion });
  return fx;
}
const ev = (...e: unknown[]) => e as AnimalEvent[];
const eye = { x: 0, y: 9, z: 5 };
const out = () => ({ pos: new Float32Array(3 * 64), col: new Float32Array(3 * 64), size: new Float32Array(64), tile: new Float32Array(64) });
const fxOf = (fx: AnimalFx) => fx.fx() as unknown as Record<string, number>;

describe('LIVE-2.1 音（§3.5）', () => {
  const dur = (name: 'toss' | 'bonk') => Math.max(...(ANIMAL_SOUNDS[name] as readonly Tone[]).map((t) => (t.delay ?? 0) + t.dur));
  const peak = (name: 'toss' | 'bonk') => Math.max(...(ANIMAL_SOUNDS[name] as readonly Tone[]).map((t) => t.gain));
  it('toss（ひゅっ）と bonk（ぽよん・小さく）が ある。短く 小さい', () => {
    expect(dur('toss')).toBeLessThanOrEqual(0.4);
    expect(dur('bonk')).toBeLessThanOrEqual(0.4);
    expect(peak('toss')).toBeLessThanOrEqual(0.3);
    expect(peak('bonk')).toBeLessThanOrEqual(0.2); // 小さく
    expect(peak('bonk')).toBeLessThan(peak('toss') + 1e-9 + 0.1);
  });
  it('出来事 toss／bonk で それぞれ 1 回 鳴る。bonk は 小さな けむり', () => {
    const fx = make();
    fx.step([], eye);
    fx.onEvents(ev({ type: 'toss', id: 1, to: { x: 1, y: 9, z: 1 } }));
    expect(fx.played).toEqual(['toss']);
    fx.onEvents(ev({ type: 'bonk', id: 1, x: 2, y: 10, z: 2 }));
    expect(fx.played).toEqual(['toss', 'bonk']);
    expect(fx.particles.active(3)).toBeGreaterThan(0);
  });
  it('こたつ いっぱい は 今 の 合図 の 音（animalHint）', () => {
    const fx = make();
    fx.step([], eye);
    fx.onEvents(ev({ type: 'hint', hint: 'kitFull' }));
    expect(fx.played).toEqual(['animalHint']);
  });
});

describe('LIVE-2.1 いえ の しるし（ぽんっ と 大きく）と土けむり', () => {
  it('home: fx().homePop が 1 → 20 まで 1 → 40 で 0。fxReset では かわらない（時間 で きえる）', () => {
    const fx = make();
    fx.step([view(1)], eye);
    expect(fxOf(fx).homePop ?? 0).toBe(0);
    fx.onEvents(ev({ type: 'home', id: 1, coop: 1 }));
    expect(fxOf(fx).homePop).toBe(1);
    for (let i = 0; i < 19; i++) fx.step([view(1)], eye);
    expect(fxOf(fx).homePop).toBe(1);
    for (let i = 0; i < 10; i++) fx.step([view(1)], eye);
    expect(fxOf(fx).homePop).toBeGreaterThan(0);
    expect(fxOf(fx).homePop).toBeLessThan(1);
    for (let i = 0; i < 11; i++) fx.step([view(1)], eye);
    expect(fxOf(fx).homePop).toBe(0);
  });

  it('頭 の 上 に いえ の しるし（house3）が 1.5 倍 で 出て 20 ステップ で ふつう の 大きさ・40 で 消える', () => {
    const fx = make();
    fx.step([view(1)], eye);
    fx.onEvents(ev({ type: 'home', id: 1, coop: 1 }));
    fx.step([view(1)], eye);
    const sizeAt = (): number | null => {
      const o = out();
      const n = fx.write(o, 64, { x: 1, z: 0 });
      for (let i = 0; i < n; i++) if (o.tile[i] === TILE.house3) return o.size[i]!;
      return null;
    };
    const big = sizeAt();
    expect(big).toBeCloseTo(ANIMAL_FX.headHeartSize * 1.5, 1); // 1 ステップ たつ ので 1.475 倍
    for (let i = 0; i < 20; i++) fx.step([view(1)], eye);
    expect(sizeAt()).toBeCloseTo(ANIMAL_FX.headHeartSize, 5);
    for (let i = 0; i < 20; i++) fx.step([view(1)], eye);
    expect(sizeAt()).toBeNull();
  });

  it('うまり の しるし（house1〜2）は 出ない（homeFill が 来ない）', () => {
    const fx = make();
    fx.step([view(1)], eye);
    fx.onEvents(ev({ type: 'home', id: 1, coop: 1 }));
    const o = out();
    const n = fx.write(o, 64, { x: 1, z: 0 });
    for (let i = 0; i < n; i++) expect([TILE.houseEmpty, TILE.house1, TILE.house2]).not.toContain(o.tile[i]);
  });

  it('flattenDust: 列 ごと に 1 つ・25 まで（dust を 数える）。fxReset で 0', () => {
    const fx = make();
    fx.step([], eye);
    fx.flattenDust([{ x: 1, y: 9, z: 1 }, { x: 2, y: 9, z: 1 }]);
    expect(fxOf(fx).dust).toBe(2);
    expect(fx.particles.active(3)).toBeGreaterThanOrEqual(2);
    fx.flattenDust(Array.from({ length: 40 }, (_, i) => ({ x: i, y: 9, z: 0 })));
    expect(fxOf(fx).dust).toBe(2 + 25);
    fx.fxReset();
    expect(fxOf(fx).dust).toBe(0);
  });

  it('動き の 強さ 0 でも 数 は かぞえる（つぶ は 出さない）', () => {
    const fx = make(0);
    fx.step([], eye);
    fx.flattenDust([{ x: 1, y: 9, z: 1 }]);
    expect(fxOf(fx).dust).toBe(1);
    expect(fx.particles.active(3)).toBe(0);
  });
});
