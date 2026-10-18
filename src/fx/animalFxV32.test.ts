import { describe, expect, it } from 'vitest';
import type { AnimalEvent, AnimalView } from '../contracts';
import { AnimalFx, TILE } from './animalFx';
import { ANIMAL_SOUNDS, type AnimalSoundName } from './animalSounds';
import type { Tone } from './sound';

/** LIVE-1 版 3.2（しるし 3 しゅるい・あみ・とぶ むし・だっこ・パタパタ の 音とつぶ）。仕様 §3.3・§3.5〜§3.7・AC16 */

const view = (id: number, o: Partial<AnimalView> = {}): AnimalView => ({
  id,
  x: 0,
  y: 9,
  z: 0,
  yaw: 0,
  headYaw: 0,
  state: 'idle',
  stateTicks: 0,
  friend: false,
  hearts: 0,
  targeted: false,
  ...o,
});

function make(motion = 1) {
  const m = { v: motion };
  const fx = new AnimalFx({ sound: { playTones: () => {} }, motion: () => m.v });
  return { fx, m };
}
const eye = { x: 0, y: 9, z: 5 };
const out = (n: number) => ({ pos: new Float32Array(3 * n), col: new Float32Array(3 * n), size: new Float32Array(n), tile: new Float32Array(n) });
const E = (a: AnimalEvent): AnimalEvent[] => [a];
const swingEv = (caught: boolean, reason: 'chance' | 'pity' | 'empty' | 'miss' = caught ? 'chance' : 'miss'): AnimalEvent => ({
  type: 'swing',
  x: 3,
  y: 10,
  z: 0,
  caught,
  reason,
});

describe('AC16 頭の 上の しるし 3 しゅるい（marks）', () => {
  const marksOf = (v: AnimalView[], at = { x: 0, y: 9, z: 0 }) => {
    const { fx } = make();
    fx.step(v, at);
    return fx.fx().marks;
  };
  it('なかま: follow 18000・12001 → steps 3、12000・6001 → 2、6000・1 → 1、0 → しるし なし', () => {
    const want: Array<[number, number | undefined]> = [[18000, 3], [12001, 3], [12000, 2], [6001, 2], [6000, 1], [1, 1], [0, undefined]];
    for (const [follow, steps] of want) {
      const m = marksOf([view(1, { friend: true, follow, x: 3 })]);
      if (steps === undefined) expect(m, `follow ${follow}`).toEqual([]);
      else expect(m, `follow ${follow}`).toEqual([{ id: 1, steps, full: false }]);
    }
  });
  it('おなかいっぱい の 間 full true（やせい・なかま どちらも）。fullLeft 0 で false', () => {
    expect(marksOf([view(1, { friend: true, follow: 18000, fullLeft: 600, x: 3 })])).toEqual([{ id: 1, steps: 3, full: true }]);
    expect(marksOf([view(2, { hearts: 1, fullLeft: 10, x: 3 })])).toEqual([{ id: 2, hearts: 1, full: true }]);
    expect(marksOf([view(3, { fullLeft: 5, x: 3 })])).toEqual([{ id: 3, full: true }]);
    expect(marksOf([view(4, { friend: true, follow: 100, fullLeft: 0, x: 3 })])[0].full).toBe(false);
  });
  it('9 マス はなれる と 出ない・8 マス では 出る（あしあと・おなかいっぱい）', () => {
    expect(marksOf([view(1, { friend: true, follow: 18000, fullLeft: 5, x: 9 })])).toEqual([]);
    expect(marksOf([view(1, { friend: true, follow: 18000, fullLeft: 5, x: 8 })])).toHaveLength(1);
  });
  it('だっこ 中は あしあと も おなかいっぱい も 出さない', () => {
    expect(marksOf([view(1, { friend: true, follow: 18000, fullLeft: 5, carried: true, x: 1 })])).toEqual([]);
  });
  it('ハート（やせい）は 6 マス まで・なかまには 出ない', () => {
    expect(marksOf([view(1, { hearts: 2, x: 6 })])).toEqual([{ id: 1, hearts: 2, full: false }]);
    expect(marksOf([view(1, { hearts: 2, x: 6.5 })])).toEqual([]);
    expect(marksOf([view(1, { hearts: 2, friend: true, follow: 0, x: 2 })])).toEqual([]);
  });
  it('11 組（なかま 8 ＋ やせい 3）ぜんぶ 出る・描く 配列に ぜんぶ 入る（1 組 4 つぶ まで）', () => {
    const { fx } = make();
    const vs: AnimalView[] = [];
    for (let i = 0; i < 8; i++) vs.push(view(i + 1, { friend: true, follow: 18000, fullLeft: 300, x: i * 0.5 }));
    for (let i = 0; i < 3; i++) vs.push(view(20 + i, { hearts: 2, fullLeft: 300, x: 1 + i, z: 3 }));
    fx.step(vs, { x: 0, y: 9, z: 0 });
    expect(fx.fx().marks).toHaveLength(11);
    expect(fx.write(out(320), 320, { x: 1, z: 0 })).toBe(11 * 4);
  });
  it('あしあと は うまった 数 = steps、のこりは から の わく。おなかいっぱい は あしあと の 右 に 1 つ', () => {
    const { fx } = make();
    fx.step([view(1, { friend: true, follow: 7000, fullLeft: 300, x: 2 })], { x: 0, y: 9, z: 0 });
    const w = out(32);
    const n = fx.write(w, 32, { x: 0, z: 1 });
    expect(n).toBe(4);
    expect([w.tile[0], w.tile[1], w.tile[2]]).toEqual([TILE.footFull, TILE.footFull, TILE.footEmpty]);
    expect(w.tile[3]).toBe(TILE.belly);
    expect(w.pos[11]).toBeGreaterThan(w.pos[8]); // 右（+z）に ならぶ
  });
  it('おなかいっぱい は のこりで 小さく なる', () => {
    const size = (left: number) => {
      const { fx } = make();
      fx.step([view(1, { fullLeft: left, x: 2 })], { x: 0, y: 9, z: 0 });
      const w = out(8);
      fx.write(w, 8, { x: 0, z: 1 });
      return w.size[0];
    };
    expect(size(600)).toBeGreaterThan(size(300));
    expect(size(300)).toBeGreaterThan(size(30));
    expect(size(30)).toBeGreaterThan(0);
  });
  it('のこり 1,800 以下の あしあと は ゆっくり うすく・こく（強い 点滅 なし。1 しゅう 60 ステップ）', () => {
    const bright = (follow: number) => {
      const { fx } = make();
      const b: number[] = [];
      const w = out(8);
      for (let t = 0; t < 60; t++) {
        fx.step([view(1, { friend: true, follow, x: 2 })], { x: 0, y: 9, z: 0 });
        fx.write(w, 8, { x: 0, z: 1 });
        b.push(w.col[0]);
      }
      return b;
    };
    const b = bright(1500);
    expect(Math.max(...b) - Math.min(...b)).toBeGreaterThan(0.2);
    expect(Math.min(...b)).toBeGreaterThanOrEqual(0.5); // 強く 消えない
    for (let i = 1; i < b.length; i++) expect(Math.abs(b[i] - b[i - 1])).toBeLessThan(0.08);
    const c = bright(5000);
    expect(Math.max(...c) - Math.min(...c)).toBe(0);
  });
});

describe('版 3.2 の 出来事 → 音・つぶ（§3.6・§3.7）', () => {
  it('full = animalFull、carry = carryUp、putDown = carryDown', () => {
    const { fx } = make();
    fx.step([view(1, { friend: true })], eye);
    fx.onEvents(E({ type: 'full', id: 1 }));
    fx.onEvents(E({ type: 'carry', id: 1 }));
    fx.onEvents(E({ type: 'putDown', id: 1, x: 1, y: 9, z: 1 }));
    expect(fx.played).toEqual(['animalFull', 'carryUp', 'carryDown']);
  });
  it('followEnd = followEnd の 音 と けむり 4 つぶ', () => {
    const { fx } = make();
    fx.step([view(1, { friend: true, x: 3, z: 4 })], eye);
    fx.onEvents(E({ type: 'followEnd', id: 1 }));
    expect(fx.played).toEqual(['followEnd']);
    expect(fx.fx().puff).toBe(4);
    expect(fx.particles.active(3)).toBe(4);
  });
  it('あみ を ふる: 押した ステップ に netSwing。10 ステップ 目 に はっぱ 4 つぶ（とれても とれなくても）', () => {
    for (const caught of [true, false]) {
      const { fx } = make();
      fx.step([], eye);
      fx.onEvents(E(swingEv(caught)));
      expect(fx.played).toEqual(['netSwing']);
      expect(fx.fx().leaf).toBe(0);
      for (let t = 0; t < 9; t++) fx.step([], eye);
      expect(fx.fx().leaf).toBe(0);
      fx.step([], eye);
      expect(fx.fx().leaf).toBe(4);
      for (let t = 0; t < 40; t++) fx.step([], eye);
      expect(fx.fx().leaf).toBe(4);
    }
  });
  it('とれなかった = 10 ステップ 目 に rustle（3 しゅるい。つづけて 同じ には ならない）。失敗の 合図の 音は 出さない', () => {
    const { fx } = make();
    const seen: string[] = [];
    for (let i = 0; i < 12; i++) {
      fx.played.length = 0;
      fx.onEvents(E(swingEv(false, 'miss')));
      for (let t = 0; t < 10; t++) fx.step([], eye);
      const r = fx.played.filter((n) => n.startsWith('rustle'));
      expect(r, `${i}`).toHaveLength(1);
      expect(fx.played).not.toContain('animalHint');
      seen.push(r[0]);
    }
    expect(seen[0]).toBe('rustle');
    for (let i = 1; i < seen.length; i++) expect(seen[i]).not.toBe(seen[i - 1]);
    expect(new Set(seen).size).toBe(3);
  });
  it('おやすみ の き（empty）= rustle ＋ animalHint「おしい」', () => {
    const { fx } = make();
    fx.onEvents(E(swingEv(false, 'empty')));
    for (let t = 0; t < 10; t++) fx.step([], eye);
    expect(fx.played.some((n) => n.startsWith('rustle'))).toBe(true);
    expect(fx.played).toContain('animalHint');
  });
  it('とれた: rustle は 鳴らさない。bugCatch = bugCatch の 音 と キラッ 3 つぶ', () => {
    const { fx } = make();
    fx.onEvents(E(swingEv(true)));
    for (let t = 0; t < 30; t++) fx.step([], eye);
    expect(fx.played.some((n) => n.startsWith('rustle'))).toBe(false);
    fx.onEvents(E({ type: 'bugCatch', toInventory: true }));
    expect(fx.played).toContain('bugCatch');
    expect(fx.fx().sparkle).toBe(3);
  });
  it('とれた むし は 10 ステップ 目 に とび出し、30 ステップ 目 までに プレイヤー へ とんで 消える', () => {
    const { fx } = make();
    const eyeAt = { x: 0, y: 10.6, z: 0 };
    fx.step([], eyeAt);
    fx.onEvents(E(swingEv(true)));
    for (let t = 0; t < 9; t++) fx.step([], eyeAt);
    expect(fx.flights).toHaveLength(0);
    fx.step([], eyeAt);
    expect(fx.flights).toHaveLength(1);
    const f0 = { ...fx.flights[0] };
    // ねらった ブロック（3, 10, 0）の 近く から 出る
    expect(Math.hypot(f0.x - 3.5, f0.z - 0.5)).toBeLessThan(1.2);
    let prev = Math.hypot(f0.x - eyeAt.x, f0.z - eyeAt.z);
    for (let t = 0; t < 19; t++) {
      fx.step([], eyeAt);
      const f = fx.flights[0];
      expect(f).toBeDefined();
      const d = Math.hypot(f.x - eyeAt.x, f.z - eyeAt.z);
      expect(d).toBeLessThanOrEqual(prev + 1e-6);
      prev = d;
    }
    expect(prev).toBeLessThan(1.0);
    fx.step([], eyeAt);
    expect(fx.flights).toHaveLength(0);
  });
  it('とれなかった ときは むし は とばない', () => {
    const { fx } = make();
    fx.onEvents(E(swingEv(false)));
    for (let t = 0; t < 40; t++) fx.step([], eye);
    expect(fx.flights).toHaveLength(0);
  });
  it('動きの 強さ 0: むし の 弧（とぶ）を 止める。音と キラッ は のこる', () => {
    const { fx } = make(0);
    fx.onEvents(E(swingEv(true)));
    for (let t = 0; t < 40; t++) {
      fx.step([], eye);
      expect(fx.flights).toHaveLength(0);
    }
    fx.onEvents(E({ type: 'bugCatch', toInventory: true }));
    expect(fx.played).toContain('bugCatch');
    expect(fx.fx().sparkle).toBe(3);
  });
  it('パタパタ の 音: おちている にわとり が 16 マス 以内 の とき、16 ステップ に 1 回 まで。着地で 止まる', () => {
    const { fx } = make();
    for (let t = 0; t < 80; t++) fx.step([view(1, { friend: true, fluttering: true, x: 3 })], eye);
    const n = fx.played.filter((s) => s === 'flutter').length;
    expect(n).toBeGreaterThanOrEqual(4);
    expect(n).toBeLessThanOrEqual(6);
    fx.played.length = 0;
    for (let t = 0; t < 80; t++) fx.step([view(1, { friend: true, fluttering: false, x: 3 })], eye);
    expect(fx.played).toEqual([]);
    for (let t = 0; t < 80; t++) fx.step([view(2, { fluttering: true, x: 30 })], eye);
    expect(fx.played).toEqual([]);
  });
  it('同じ シード・同じ 操作 で 同じ はっぱ の 場所', () => {
    const run = () => {
      const { fx } = make();
      fx.onEvents(E(swingEv(false)));
      for (let t = 0; t < 12; t++) fx.step([], eye);
      const w = out(16);
      const n = fx.write(w, 16, { x: 1, z: 0 });
      return [n, Array.from(w.pos.slice(0, n * 3))];
    };
    expect(run()).toEqual(run());
  });
});

describe('版 3.2 の 音（案 B「木のおもちゃとオルゴール」）', () => {
  it('新しい 音（rustle は 3 しゅるい）は くり返しに 耐える 小ささ: 0.34 以下', () => {
    for (const n of ['netSwing', 'rustle', 'rustle2', 'rustle3', 'bugCatch', 'animalFull', 'carryUp', 'carryDown', 'flutter', 'followEnd'] as const) {
      const tones = ANIMAL_SOUNDS[n] as readonly Tone[];
      expect(tones.length, n).toBeGreaterThan(0);
      for (const t of tones) expect(t.gain, n).toBeLessThanOrEqual(0.34);
    }
    const loud = (n: AnimalSoundName) => Math.max(...(ANIMAL_SOUNDS[n] as readonly Tone[]).map((t) => t.gain));
    expect(loud('flutter')).toBeLessThanOrEqual(0.12);
    expect(loud('rustle')).toBeLessThanOrEqual(0.15);
    expect(loud('bugCatch')).toBeLessThanOrEqual(loud('feed')); // 「中 より 小さめ」
  });
  it('carryUp は オルゴール 2 音 上がり・followEnd は 2 音 下がり', () => {
    const notes = (n: AnimalSoundName) =>
      (ANIMAL_SOUNDS[n] as readonly Tone[]).filter((t) => t.type === 'sine' && t.f0 > 100).sort((a, b) => a.delay - b.delay);
    const up = notes('carryUp');
    expect(up).toHaveLength(2);
    expect(up[1].f0).toBeGreaterThan(up[0].f0);
    const down = notes('followEnd');
    expect(down).toHaveLength(2);
    expect(down[1].f0).toBeLessThan(down[0].f0);
  });
});
