import { describe, expect, it } from 'vitest';
import type { AnimalEvent, AnimalView } from '../contracts';
import { AnimalFx, headHeartProgress } from './animalFx';
import { ANIMAL_SOUNDS, type AnimalSoundName } from './animalSounds';
import { tonesOf, type Tone } from './sound';

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
  const played: Tone[][] = [];
  const m = { v: motion };
  const fx = new AnimalFx({ sound: { playTones: (t) => void played.push([...t]) }, motion: () => m.v });
  return { fx, played, m };
}
const ev = (...e: AnimalEvent[]) => e;
const eye = { x: 0, y: 9, z: 5 };

describe('AC7 お祝いの 大きさ', () => {
  it('はじめての なかま: 紙ふぶき > 0・はじけ 8・ハート 1 以上・音 friendFirst', () => {
    const { fx } = make();
    fx.step([view(1, { hearts: 2 })], eye);
    fx.onEvents(ev({ type: 'feed', id: 1, item: 'tomato', hearts: 2, friend: true }, { type: 'friend', id: 1, first: true, count: 1 }));
    const c = fx.fx();
    expect(c.confetti).toBeGreaterThan(0);
    expect(c.confetti).toBeLessThanOrEqual(60);
    expect(c.burst).toBe(8);
    expect(c.hearts).toBeGreaterThanOrEqual(1);
    expect(fx.played).toContain('friendFirst');
    expect(fx.played).not.toContain('friend');
  });
  it('2 わ目から: 紙ふぶき 0・はじけ 5・音 friend', () => {
    const { fx } = make();
    fx.step([view(2, { hearts: 2 })], eye);
    fx.onEvents(ev({ type: 'friend', id: 2, first: false, count: 2 }));
    const c = fx.fx();
    expect(c.confetti).toBe(0);
    expect(c.burst).toBe(5);
    expect(fx.played).toContain('friend');
    expect(fx.played).not.toContain('friendFirst');
  });
  it('動きの 強さ 0: 紙ふぶき 0・はじけ 0。ハート 1 つ と 音は のこる', () => {
    const { fx } = make(0);
    fx.step([view(1, { hearts: 2 })], eye);
    fx.onEvents(ev({ type: 'feed', id: 1, item: 'tomato', hearts: 2, friend: true }, { type: 'friend', id: 1, first: true, count: 1 }));
    const c = fx.fx();
    expect(c.confetti).toBe(0);
    expect(c.burst).toBe(0);
    expect(c.hearts).toBe(1);
    expect(fx.played).toContain('friendFirst');
    expect(fx.particles.active()).toBe(1); // ハート 1 つ だけ
  });
  it('fxReset で 数が 0 に もどる（つぶは のこる）', () => {
    const { fx } = make();
    fx.step([view(1)], eye);
    fx.onEvents(ev({ type: 'friend', id: 1, first: true, count: 1 }));
    fx.fxReset();
    expect(fx.fx()).toMatchObject({ hearts: 0, burst: 0, confetti: 0, puff: 0, sparkle: 0, leaf: 0 });
  });
});

describe('出来事 → 音・つぶ（§3.6・§3.7）', () => {
  const run = (...events: AnimalEvent[]) => {
    const { fx } = make();
    fx.step([view(1, { x: 3, z: 4, friend: true }), view(2)], eye);
    fx.onEvents(events);
    return fx;
  };
  it('あげる = feed の音 とハート 1 つ', () => {
    const fx = run({ type: 'feed', id: 2, item: 'tomato', hearts: 1, friend: false });
    expect(fx.played).toEqual(['feed']);
    expect(fx.fx().hearts).toBe(1);
  });
  it('なでる(なかま) = petAnimal とハート 1 つ。やせいを なでた だけでは 音を 出さない（合図の音は hint）', () => {
    const f = run({ type: 'pet', id: 1, friend: true });
    expect(f.played).toEqual(['petAnimal']);
    expect(f.fx().hearts).toBe(1);
    const w = run({ type: 'pet', id: 2, friend: false });
    expect(w.played).toEqual([]);
    expect(w.fx().hearts).toBe(0);
  });
  it('合図 hint = animalHint', () => {
    expect(run({ type: 'hint', hint: 'feedHint' }).played).toEqual(['animalHint']);
    expect(run({ type: 'hint', hint: 'carryHint' }).played).toEqual(['animalHint']);
  });
  it('たまご = egg の音 と キラッ 4 つぶ', () => {
    const f = run({ type: 'egg', id: 1, x: 3, y: 9, z: 4 });
    expect(f.played).toEqual(['egg']);
    expect(f.fx().sparkle).toBe(4);
  });
  it('ワープ = warp の音 と けむり 6 つぶ ずつ（前と あと）', () => {
    const f = run({ type: 'warp', id: 1, from: { x: 3, y: 9, z: 4 }, to: { x: 1, y: 9, z: 1 } });
    expect(f.played).toEqual(['warp']);
    expect(f.fx().puff).toBe(12);
  });
  it('出る・消える は 音なし', () => {
    const f = run({ type: 'spawn', id: 3, x: 0, y: 9, z: 0 }, { type: 'remove', id: 3, reason: 'far' });
    expect(f.played).toEqual([]);
  });
  it('LIVE-4 AC2 ねらい = machoGo が 1 回（ねらい 1 つ に 出来事 1 つ）。やめる・たおす 出来事 は 音なし', () => {
    const f = run({ type: 'machoTarget', id: 1, yokai: 9, cause: 'playerHit' });
    expect(f.played).toEqual(['machoGo']);
    const g = run({ type: 'machoGiveUp', id: 1, reason: 'forget' }, { type: 'machoKO', id: 1, yokai: 9 });
    expect(g.played).toEqual([]);
  });
  it('LIVE-4 AC4・AC5 パンチ = machoPunch だけ、きりあげ = machoUpper だけ。かちポーズ = machoFlex', () => {
    const punch = { type: 'machoPunch', id: 1, yokai: 9, x: 0, y: 9, z: 0, hit: true, damage: 2 } as const;
    expect(run({ ...punch, upper: false }).played).toEqual(['machoPunch']);
    expect(run({ ...punch, upper: true, damage: 2.3 }).played).toEqual(['machoUpper']);
    expect(run({ type: 'machoFlex', id: 1 }).played).toEqual(['machoFlex']);
  });
  it('LIVE-2.1 AC4・AC6 なげる = toss の音、かべ に 当たる = bonk の音', () => {
    expect(run({ type: 'toss', id: 1, to: { x: 1, y: 9, z: 1 } } as AnimalEvent).played).toEqual(['toss']);
    expect(run({ type: 'bonk', id: 1, x: 1, y: 9, z: 1 } as AnimalEvent).played).toEqual(['bonk']);
  });
  it('音は SoundFx の 表(ANIMAL_SOUNDS)の 配列そのもので 鳴らす', () => {
    const { fx, played } = make();
    fx.onEvents(ev({ type: 'hint', hint: 'friendFull' }));
    expect(played[0]).toEqual([...ANIMAL_SOUNDS.animalHint]);
  });
});

describe('コッコッ（cluck）', () => {
  it('やせいが 16 マス以内に いる間 だけ、300〜600 ステップに 1 回。なかま・遠い やせいは 鳴らない', () => {
    const { fx } = make();
    const views = [view(1, { x: 0, z: 0 }), view(2, { x: 30, z: 0 }), view(3, { friend: true, x: 2, z: 0 })];
    const at: number[] = [];
    for (let t = 0; t < 1800; t++) {
      const before = fx.played.length;
      fx.step(views, { x: 0, y: 9, z: 8 });
      if (fx.played.length > before) at.push(t);
    }
    expect(fx.played.every((n) => n === 'cluck')).toBe(true);
    expect(at.length).toBeGreaterThanOrEqual(3);
    expect(at.length).toBeLessThanOrEqual(6);
    for (let i = 1; i < at.length; i++) {
      expect(at[i] - at[i - 1]).toBeGreaterThanOrEqual(300);
      expect(at[i] - at[i - 1]).toBeLessThanOrEqual(600);
    }
  });
  it('にわとり ごとに ずれる（3 わ の はじめの 声の ステップが ぜんぶ 同じ では ない）', () => {
    const first = [1, 2, 3].map((i) => {
      const { fx } = make();
      for (let t = 0; t < 700; t++) {
        fx.step([view(i, { x: i, z: 0 })], eye);
        if (fx.played.length) return t;
      }
      return -1;
    });
    expect(first.every((t) => t >= 0)).toBe(true);
    expect(new Set(first).size).toBeGreaterThan(1);
  });
});

describe('AC18 頭の 上の ハート', () => {
  it('やせい hearts 2 に 5 マス = うまった 2・ふち 1。8 マスでは 出ない', () => {
    const near = headHeartProgress([view(7, { hearts: 2, x: 5, z: 0 })], { x: 0, y: 9, z: 0 }, 6);
    expect(near).toEqual([{ id: 7, filled: 2, empty: 1 }]);
    expect(headHeartProgress([view(7, { hearts: 2, x: 8, z: 0 })], { x: 0, y: 9, z: 0 }, 6)).toEqual([]);
  });
  it('hearts 0 と なかまには 出ない。同時に 3 つ まで（近い 方）', () => {
    const vs = [
      view(1, { hearts: 0, x: 1 }),
      view(2, { hearts: 1, friend: true, x: 1 }),
      view(3, { hearts: 1, x: 5 }),
      view(4, { hearts: 1, x: 2 }),
      view(5, { hearts: 2, x: 3 }),
      view(6, { hearts: 1, x: 4 }),
    ];
    const p = headHeartProgress(vs, { x: 0, y: 9, z: 0 }, 6);
    expect(p.map((q) => q.id)).toEqual([4, 5, 6]);
  });
  it('step で marks が 窓口に 出て、遠ざかると 消える（版 3.2: progress → marks）', () => {
    const { fx } = make();
    fx.step([view(1, { hearts: 2, x: 5 })], { x: 0, y: 9, z: 0 });
    expect(fx.fx().marks).toEqual([{ id: 1, hearts: 2, full: false }]);
    fx.step([view(1, { hearts: 2, x: 8 })], { x: 0, y: 9, z: 0 });
    expect(fx.fx().marks).toEqual([]);
  });
});

describe('つぶの 数・動き', () => {
  it('つぶは 時間で 消える。同時に 出る 数は 上限 を こえない', () => {
    const { fx } = make();
    fx.step([view(1)], eye);
    for (let i = 0; i < 10; i++) fx.onEvents(ev({ type: 'friend', id: 1, first: true, count: i + 1 }));
    expect(fx.particles.active()).toBeLessThanOrEqual(fx.particles.cap);
    for (let t = 0; t < 200; t++) fx.step([view(1)], eye);
    expect(fx.particles.active()).toBe(0);
  });
  it('紙ふぶきは 1 回 60 つぶ まで、同じ シードなら 同じ 場所', () => {
    const a = make();
    const b = make();
    for (const m of [a, b]) {
      m.fx.step([view(1)], eye);
      m.fx.onEvents(ev({ type: 'friend', id: 1, first: true, count: 1 }));
    }
    expect(a.fx.fx().confetti).toBe(60);
    const wa = { pos: new Float32Array(3 * 300), col: new Float32Array(3 * 300), size: new Float32Array(300), tile: new Float32Array(300) };
    const wb = { pos: new Float32Array(3 * 300), col: new Float32Array(3 * 300), size: new Float32Array(300), tile: new Float32Array(300) };
    const na = a.fx.write(wa, 300, { x: 1, z: 0 });
    const nb = b.fx.write(wb, 300, { x: 1, z: 0 });
    expect(na).toBe(nb);
    expect(Array.from(wa.pos.slice(0, na * 3))).toEqual(Array.from(wb.pos.slice(0, nb * 3)));
  });
  it('頭の 上の ハートは カメラの 右 向きに ならべて 書く（3 つ、うまった 色 / ふち）', () => {
    const { fx } = make();
    fx.step([view(1, { hearts: 1, x: 2, y: 9, z: 0 })], { x: 0, y: 9, z: 0 });
    const w = { pos: new Float32Array(3 * 32), col: new Float32Array(3 * 32), size: new Float32Array(32), tile: new Float32Array(32) };
    const n = fx.write(w, 32, { x: 0, z: 1 });
    expect(n).toBe(3);
    expect([w.tile[0], w.tile[1], w.tile[2]]).toEqual([0, 1, 1]);
    // 右(+z)に ならぶ・同じ 高さ・頭の 上
    expect(w.pos[2]).toBeLessThan(w.pos[5]);
    expect(w.pos[1]).toBeCloseTo(w.pos[4], 5);
    expect(w.pos[1]).toBeGreaterThan(9 + 0.8);
  });
});

describe('音の 表（案 B）', () => {
  it('名前が 43 こ（LIVE-3 の 2 ＋ LIVE-1 の 18 ＋ LIVE-2 の 14 ＋ LIVE-2.1 の 2 ＋ GOLD-1 の 3 ＋ LIVE-4 の 4）あり、SoundFx の 表に 登録 されている（鳴らすと その 名前の 記録が 残る）', () => {
    const names = Object.keys(ANIMAL_SOUNDS) as AnimalSoundName[];
    expect(names.sort()).toEqual([
      'animalFull', 'animalHint', 'bonk', 'bugCatch', 'carryDown', 'carryUp', 'cluck', 'collect', 'collectMany', 'coopDoor', 'coopPlace', 'egg',
      'feed', 'flutter', 'followEnd', 'friend', 'friendFirst', 'goldenEgg', 'grow', 'growFirst', 'harapanFeed', 'hatch', 'hatchFirst',
      'hatchMacho', 'home', 'itadakimasu', 'kitPut', 'kitWobble', 'machoFlex', 'machoGo', 'machoPunch', 'machoUpper', 'natsukiGold', 'natsukiReady', 'netSwing', 'peep', 'petAnimal', 'rustle', 'rustle2',
      'rustle3', 'sleep', 'toss', 'warp',
    ]);
    for (const n of names) expect(tonesOf(n)).toBe(ANIMAL_SOUNDS[n]);
  });
  it('どの 音も 小さく 短い（1.2 秒以内・1 つの 大きさ 0.5 以下・立ち上がり 0.002 秒 以上）', () => {
    for (const [n, tones] of Object.entries(ANIMAL_SOUNDS)) {
      for (const t of tones as readonly Tone[]) {
        expect(t.delay + t.dur, n).toBeLessThanOrEqual(n === 'itadakimasu' ? 1.8 : 1.2); // いただきます は 1 回 だけ の 長い 音（SOUND 案 A）
        expect(t.gain, n).toBeLessThanOrEqual(0.5);
        expect(t.attack ?? 0.004, n).toBeGreaterThanOrEqual(0.002);
      }
    }
    // くり返す 声 は さらに 小さい
    const loud = (n: AnimalSoundName) => Math.max(...(ANIMAL_SOUNDS[n] as readonly Tone[]).map((t) => t.gain));
    expect(loud('cluck')).toBeLessThanOrEqual(0.25);
  });
});
