import { describe, expect, it } from 'vitest';
import type { FarmEvent, FarmHintKind, ItemId, PetResult } from '../contracts';
import { AchievementSystem } from '../achievements/AchievementSystem';
import { M6_SETTING_DEFAULTS } from '../contracts';
import { FarmHintModel, FARM_HINT_STEPS } from '../ui/farmHintModel';
import { FarmFx } from './farmFx';
import type { Tone } from './sound';

/**
 * COOP-1 5a（docs/design/COOP-1.md 1.14 §3.7 (a)「出来事は だれの 物か」・§8「つなぎ目の 約束」・§10、AC125・AC128・AC129）の 先行テスト（赤）。
 * 農業の 出来事（`farm.drainEvents()`）から 音・つぶ・合図・実績を 起こす `FarmFx` が、出来事の 人（`by?: 2`）で 合図の チップの 行き先だけを 分ける。
 *
 * ---- 実装への 約束（名前・形）----
 *   src/fx/farmFx.ts   `FarmFxDeps` に 足す:
 *     hintFor?: (who: 1 | 2) => { show(kind: FarmHintKind): void } | null
 *        … 合図 `hint` の 行き先。`by: 2` の 合図は `hintFor(2)`、`by` の ない 合図は `hintFor(1)`。null（か 2P の チップが ない）なら その 合図は どこにも 出さない。
 *          `hintFor` を 渡した ときは `hint` は 見ない。`hint` だけ 渡した ときは 今まで どおり（`by` の ない 合図だけ `hint` に 出す。`by: 2` の 合図は 1P の チップに 出さない）。
 *     shiverP2?: () => void
 *        … かびた パンを 食べた 人形の ぶるっ の 2P 用（`eat` の `by: 2`）。2P の 食べた ときは `say`（1P の ログ）も `shiver`（1P の 人形）も 呼ばない。
 *   そのほかは 人に よらず 同じ: 音は 出来事 1 つに 1 回・1P と 同じ 名前（`played`）と 同じ 音の 部品・つぶは 出来事の x,y,z（世界の 同じ 場所）・実績へは 出来事を そのまま。
 *   チップ（`FarmHintModel`）は 人ごとに 1 つずつ。120 ステップ（`FARM_HINT_STEPS`）で 消える。
 *   `duo.farmHint(who)` は その人の チップの `current()`（2P が いなければ who 2 は null）。→ ゲームの 外では 見られない ので ここは モデルで 見る。
 */

const at = { tick: 1, x: 4, y: 5, z: 6 };
const ev = <T extends FarmEvent['type']>(type: T, rest: Record<string, unknown> = {}, by?: 2): FarmEvent => ({ type, ...at, ...rest, ...(by ? { by } : {}) }) as unknown as FarmEvent;

/** 音の 部品・つぶ・ハート・合図を ためる だけの にせ */
function rig(over: { hintFor?: boolean; hint?: boolean } = {}) {
  const tones: Array<readonly Tone[]> = [];
  const bursts: Array<{ block: unknown; hex: number; count: number }> = [];
  const pets: Array<{ x: number; y: number; z: number; result: PetResult }> = [];
  const said: string[] = [];
  const shivers = { p1: 0, p2: 0 };
  const m1 = new FarmHintModel();
  const m2 = new FarmHintModel();
  const fx = new FarmFx({
    sound: { playTones: (t) => void tones.push(t) },
    particles: { burstHex: (block, hex, _cfg, count) => void bursts.push({ block, hex, count }) },
    sparkle: { onPet: (x, y, z, result) => void pets.push({ x, y, z, result }) },
    say: (t) => void said.push(t),
    shiver: () => void shivers.p1++,
    shiverP2: () => void shivers.p2++,
    ...(over.hint ? { hint: m1 } : {}),
    ...(over.hintFor === false ? {} : { hintFor: (who: 1 | 2) => (who === 2 ? m2 : m1) }),
  });
  return { fx, tones, bursts, pets, said, shivers, m1, m2 };
}

const HINTS: readonly FarmHintKind[] = ['till', 'fill', 'bucket', 'full'];

describe('AC125: 合図の チップの 行き先（起こした 人の 半分だけ）', () => {
  for (const kind of HINTS)
    it(`2P が 起こした ${kind} は 2P の チップだけ・1P の チップは 出ない`, () => {
      const r = rig();
      r.fx.feed([ev('hint', { hint: kind }, 2)]);
      expect(r.m2.current()).toBe(kind);
      expect(r.m1.current()).toBeNull();
    });

  for (const kind of HINTS)
    it(`1P が 起こした ${kind} は 今の チップだけ・2P の チップは 出ない`, () => {
      const r = rig();
      r.fx.feed([ev('hint', { hint: kind })]);
      expect(r.m1.current()).toBe(kind);
      expect(r.m2.current()).toBeNull();
    });

  it('2 人 同時なら 両方（別々の 合図でも よい）', () => {
    const r = rig();
    r.fx.feed([ev('hint', { hint: 'till' }), ev('hint', { hint: 'full' }, 2)]);
    expect(r.m1.current()).toBe('till');
    expect(r.m2.current()).toBe('full');
  });

  it('それぞれ 120 ステップで 消える（人ごとに 数える・同じ 合図の 出し直しは 残り時間を もどすだけ）', () => {
    const r = rig();
    r.fx.feed([ev('hint', { hint: 'fill' }, 2)]);
    for (let i = 0; i < FARM_HINT_STEPS - 1; i++) {
      r.m1.step();
      r.m2.step();
    }
    expect(r.m2.current(), '119 ステップ目までは 出ている').toBe('fill');
    r.fx.feed([ev('hint', { hint: 'fill' })]);
    r.m1.step();
    r.m2.step();
    expect(r.m2.current(), '2P の チップは 120 ステップで 消える').toBeNull();
    expect(r.m1.current(), '1P の チップは 1P の 合図から 数える').toBe('fill');
    expect(r.m1.stepsLeft()).toBe(FARM_HINT_STEPS - 1);
  });

  it('2P の チップが ない（hintFor が null を 返す）とき 2P の 合図は どこにも 出ない（1P の チップに 出ない）', () => {
    const m1 = new FarmHintModel();
    const fx = new FarmFx({ sound: { playTones: () => undefined }, hintFor: (who) => (who === 1 ? m1 : null) });
    fx.feed([ev('hint', { hint: 'till' }, 2)]);
    expect(m1.current()).toBeNull();
  });

  it('`hint` だけ 渡す（今の 1 人用の つなぎ）: by の ない 合図は 今まで どおり・by: 2 の 合図は 1P の チップに 出さない', () => {
    const r = rig({ hint: true, hintFor: false });
    r.fx.feed([ev('hint', { hint: 'till' }, 2)]);
    expect(r.m1.current()).toBeNull();
    r.fx.feed([ev('hint', { hint: 'till' })]);
    expect(r.m1.current()).toBe('till');
    expect(r.m1.shown).toBe(1);
  });
});

describe('AC128: 音は 出来事 1 つに 1 回・1P と 同じ 名前と 大きさ。つぶは 世界の 同じ 場所', () => {
  /** 音・つぶの 出る 出来事 */
  const SAMPLES: ReadonlyArray<[string, Record<string, unknown>]> = [
    ['till', {}],
    ['tillPress', { count: 1 }],
    ['plant', { kind: 'tomato' }],
    ['harvest', { kind: 'pumpkin', veg: 1, seeds: 1, wet: false }],
    ['wild', { kind: 'onion', seeds: 1 }],
    ['notRipe', { kind: 'tomato' }],
    ['eat', { item: 'tomato' as ItemId, heal: 2 }],
    ['seedFound', { from: 'grass', item: 'seed_onion' as ItemId }],
    ['fill', { item: 'watering_can', water: 4 }],
    ['fill', { item: 'watering_can', water: 4, wasFull: true }],
    ['pour', { item: 'watering_can', tiles: 1 }],
    ['pet', { result: 'happy' }],
    ['pet', { result: 'again' }],
    ['bucketFill', { item: 'bucket', changed: true }],
    ['bucketFill', { item: 'bucket', changed: false }],
    ['bucketPlace', { liquid: 'water' }],
    ['bucketNo', {}],
    ['ripened', { kind: 'eggplant' }],
    ['hint', { hint: 'fill' }],
    ['hint', { hint: 'bucket' }],
    ['hint', { hint: 'till' }],
    ['hint', { hint: 'full' }],
  ];

  for (const [type, rest] of SAMPLES)
    it(`${type} ${JSON.stringify(rest)}: 2P の 出来事の 音・つぶ・ハートは 1P の 出来事と 同じ（1 回）`, () => {
      const one = rig();
      const two = rig();
      one.fx.feed([ev(type as FarmEvent['type'], rest)]);
      two.fx.feed([ev(type as FarmEvent['type'], rest, 2)]);
      expect(two.fx.played, '同じ 名前').toEqual(one.fx.played);
      expect(two.fx.played.length, '同じ 名前が 2 回 ならない').toBeLessThanOrEqual(1);
      expect(two.tones, '同じ 音の 部品・同じ 大きさ').toEqual(one.tones);
      expect(two.bursts, 'つぶは 世界の 同じ 場所').toEqual(one.bursts);
      expect(two.pets).toEqual(one.pets);
      for (const b of one.bursts) expect(b.block).toEqual({ x: at.x, y: at.y, z: at.z });
    });

  it('2 人が 同じ ステップに 同じ 出来事を 起こしたら 音は 1 人 1 回ずつ（合わせて 2 回）', () => {
    const r = rig();
    r.fx.feed([ev('harvest', { kind: 'tomato', veg: 1, seeds: 1, wet: false }), ev('harvest', { kind: 'tomato', veg: 1, seeds: 1, wet: false }, 2)]);
    expect(r.fx.played).toEqual(['harvest', 'harvest']);
  });

  it('同じ 列を 2 回 わたさなければ 音は ふえない（1P と 2P の 出来事が 1 つの 列に 集まる）', () => {
    const r = rig();
    const list = [ev('till'), ev('till', {}, 2)];
    r.fx.feed(list);
    expect(r.fx.played).toEqual(['till', 'till']);
    r.fx.feed([]);
    expect(r.fx.played.length).toBe(2);
  });
});

describe('かびた パン（ぶるっ は 2P の 人形・ひとことは 出さない）', () => {
  it('2P が 食べた → shiverP2 が 1 回・say と 1P の shiver は 呼ばない・音は いつもの eat', () => {
    const r = rig();
    r.fx.feed([ev('eat', { item: 'kabita_pan' as ItemId, heal: 2 }, 2)]);
    expect(r.shivers).toEqual({ p1: 0, p2: 1 });
    expect(r.said).toEqual([]);
    expect(r.fx.played).toEqual(['eat']);
  });

  it('1P が 食べた → 今まで どおり（ひとこと ＋ 1P の ぶるっ）', () => {
    const r = rig();
    r.fx.feed([ev('eat', { item: 'kabita_pan' as ItemId, heal: 2 })]);
    expect(r.shivers).toEqual({ p1: 1, p2: 0 });
    expect(r.said).toEqual(['うぇ〜 かびてる…']);
  });

  it('ほかの 食べ物では 2P も ぶるっ しない', () => {
    const r = rig();
    r.fx.feed([ev('eat', { item: 'tomato' as ItemId, heal: 2 }, 2), ev('eat', { item: 'egg' as ItemId, heal: 2 }, 2)]);
    expect(r.shivers).toEqual({ p1: 0, p2: 0 });
  });
});

describe('AC129: 出来事は 人に よらず 実績へ そのまま わたる', () => {
  it('2P の 出来事も 1P の 出来事と 同じ 記録に なる（`by` を 見ない）', () => {
    const mk = () => new AchievementSystem(() => ({ ...M6_SETTING_DEFAULTS, achieveCooldown: 0, achieveCooldownEarly: 0 }));
    const events: ReadonlyArray<[string, Record<string, unknown>]> = [
      ['plant', { kind: 'tomato' }],
      ['harvest', { kind: 'tomato', veg: 1, seeds: 1, wet: true }],
      ['wild', { kind: 'onion', seeds: 1 }],
      ['pet', { result: 'happy' }],
      ['ripened', { kind: 'onion' }],
      ['eat', { item: 'tomato' as ItemId, heal: 2 }],
      ['visitOldFarm', {}],
      ['pour', { item: 'watering_can', tiles: 1 }],
    ];
    const a = mk();
    const b = mk();
    const fa = new FarmFx({ sound: { playTones: () => undefined }, achievements: a });
    const fb = new FarmFx({ sound: { playTones: () => undefined }, achievements: b });
    fa.feed(events.map(([t, r]) => ev(t as FarmEvent['type'], r)));
    fb.feed(events.map(([t, r]) => ev(t as FarmEvent['type'], r, 2)));
    expect(Object.keys(a.stats()).length).toBeGreaterThan(0);
    expect(b.stats()).toEqual(a.stats());
  });
});
