import { describe, expect, it } from 'vitest';
import { bearingOf } from '../../combat/parry';
import type { DayPhase, Inventory, PlayerCombat, TimeOfDay, Vec3, YokaiKind } from '../../contracts';
import { ArrayVoxelWorld } from '../../world/VoxelWorld';
import { SENSE } from './senseTuning';
import { YokaiManager } from './YokaiManager';
import { createYokaiConfig, type YokaiConfig } from './config';
import type { YokaiField } from './entity';
import type { YokaiParryVerdict } from './managerTypes';
import { askParry } from './parry';

/**
 * COOP-1 作業 4d-1（docs/design/COOP-1.md 1.13 §3.6 (a)・§8 の 4d-1・AC99・AC102）の 先行テスト（赤）。
 * 妖怪（と 火の玉）の 攻撃が 当たる 直前の パリィへの 問い合わせを「ねらっている 人」ごとに する。
 * 今は `askParry` が `f.who === 2` なら null を 返す（2P は パリィ できない）。
 *
 * ---- 実装への 約束（developer が 作る 名前・形）----
 *   src/yokai/ai/managerTypes.ts
 *     YokaiParryPort.hit(h: { by; yokaiId; dirDeg; amount }, who: 1 | 2): YokaiParryVerdict     … 2 つ目の 引数 `who` を 足す（1P の 今の 実装 `hit: (h) => …` は そのまま 通る）
 *   src/yokai/ai/parry.ts
 *     askParry(port, f, by, yokaiId, from, amount): `port` が なければ null（今の まま）。あれば `port.hit({ by, yokaiId, dirDeg, amount }, f.who)`。
 *       **`f.who === 2` でも null に しない**。dirDeg は ねらっている 人の 足もと（f.px・f.py・f.pz）から 来た 向き（`bearingOf`）。
 *   managerTypes.ts  YokaiManagerOptions.onParryEvent(e, who: 1 | 2): void     … 2 つ目の 引数 `who` を 足す（今の `(e) => …` は そのまま 通る）。
 *       who = その よろけ・2 倍・はね返しの もとに なった パリィの 人。stagger = 受けた 攻撃の ねらい（f.who）、reflectHit = はね返した 火の玉の who（LiveFireball.who）、
 *       staggerDouble = ダメージを 当てた 人（damage の who）。配線は p2Parry.test.ts の `createParryEventSink`（その人の パリィの note に だけ 入れる）。
 *       reeler.applyStagger・hurt.ts・fireballs.ts が who を 持ちまわす（呼び出しの 形は 開発が きめる）。
 *   contact.ts・fireballs.ts の 呼び方は かえない（どちらも askParry を 通る）。ねらい（f.who）は ふつうの 妖怪と 同じ「近い 方」。
 *   ※ 1 人の ときは who は いつも 1 で、port の 答えも 今と 同じ（AC113）。
 */

const FROM: Vec3 = { x: 4.5, y: 9, z: 7.5 };
const field = (who: 1 | 2): YokaiField =>
  ({ ents: [], steps: 0, px: 1.5, py: 9, pz: 2.5, who, p1: { x: 1.5, y: 9, z: 2.5 }, p2: { on: true, x: 1.5, y: 9, z: 2.5 } }) as YokaiField;

describe('askParry は ねらっている 人（f.who）を 口に わたす', () => {
  for (const who of [1, 2] as const) {
    it(`f.who = ${who}: port.hit(h, ${who}) を 呼んで 答えを そのまま 返す（null に しない）。dirDeg は その人の 足もとから 来た 向き`, () => {
      const calls: Array<{ h: unknown; who: unknown }> = [];
      const verdict: YokaiParryVerdict = { result: 'early', amount: 3 };
      const port = { hit: (h: unknown, w: unknown) => (calls.push({ h, who: w }), verdict) } as never;
      const f = field(who);
      const v = askParry(port, f, 'attack', 11, FROM, 6);
      expect(v).toBe(verdict);
      expect(calls).toEqual([{ h: { by: 'attack', yokaiId: 11, dirDeg: bearingOf({ x: f.px, y: f.py, z: f.pz }, FROM), amount: 6 }, who }]);
    });
  }

  it('火の玉も 同じ（by = fireball・owner の id）。口が なければ null（今の まま）', () => {
    const calls: unknown[] = [];
    const port = { hit: (h: { by: string }, who: number) => (calls.push([h.by, who]), { result: 'none', amount: 1 }) } as never;
    askParry(port, field(2), 'fireball', 5, FROM, 1);
    expect(calls).toEqual([['fireball', 2]]);
    expect(askParry(undefined, field(2), 'attack', 1, FROM, 1)).toBeNull();
    expect(askParry(undefined, field(1), 'attack', 1, FROM, 1)).toBeNull();
  });
});

// ------------------------------------------------------------------ YokaiManager を とおして

const SIZE = { x: 200, y: 40, z: 64 };
const WIDE_Z = 32.5;
const X = 100.5;
const SIGHT = SENSE.kinds.karakasa.sight;

function makeTime(phase: DayPhase): TimeOfDay {
  return { dayTick: () => 0, day: () => 0, phase: () => phase, skyColor: () => '#000000', brightness: () => 1, dollBrightness: () => 1, set: () => {}, update: () => {}, onPhaseChange: () => () => {} };
}

interface Hit {
  amount: number;
  kind: YokaiKind;
}

function rig(o: { p1: Vec3; p2: Vec3 | null; verdict: (who: 1 | 2) => YokaiParryVerdict }) {
  const parryEvents: Array<{ type: string; who: unknown }> = [];
  const w = new ArrayVoxelWorld(SIZE);
  w.fill(0, 8, 0, SIZE.x - 1, 8, SIZE.z - 1, 'stone');
  const p1 = { position: { ...o.p1 } };
  const hits1: number[] = [];
  const hits2: Hit[] = [];
  const asked: Array<{ by: string; who: unknown }> = [];
  const combat: PlayerCombat = { hp: () => 20, maxHp: () => 20, dead: () => false, invincibleTicks: () => 0, damage: (a) => (hits1.push(a), true), heal: () => 0, drainEvents: () => [] };
  const p2 = { position: { ...(o.p2 ?? { x: 0, y: 0, z: 0 }) }, targetable: true, hurt: (amount: number, kind: YokaiKind) => (hits2.push({ amount, kind }), true) };
  const config = { ...createYokaiConfig(), yokaiAutoSpawn: false, yokaiWander: false } as YokaiConfig;
  const m = new YokaiManager({
    world: w,
    time: makeTime('night'),
    getPlayer: () => p1,
    combat,
    inventory: { add: () => 0 } as unknown as Inventory,
    seed: 5,
    config,
    ...(o.p2 ? { partner: () => p2 } : {}),
    parry: {
      hit: (h: { by: string }, who: unknown) => {
        asked.push({ by: h.by, who });
        return o.verdict((who as 1 | 2) ?? 1);
      },
    } as never,
    onParryEvent: ((e: { type: string }, who: unknown) => void parryEvents.push({ type: e.type, who })) as never,
  });
  return { m, hits1, hits2, asked, parryEvents, step: (n = 1) => void Array.from({ length: n }, () => m.update(1 / 60)) };
}

const NONE = (amount = 99): YokaiParryVerdict => ({ result: 'none', amount });

describe('AC99・AC102 妖怪の 体当たりは ねらっている 人の パリィに 聞く', () => {
  it('2P の となりで こうげき（1P は 遠い）→ 口に who = 2 で 聞く。1 度も who = 1 では 聞かない', () => {
    const r = rig({ p1: { x: X - SIGHT * 2.5, y: 9, z: WIDE_Z }, p2: { x: X + 1.2, y: 9, z: WIDE_Z }, verdict: () => NONE() });
    r.m.spawn('karakasa', X, 9, WIDE_Z, { ai: true });
    for (let i = 0; i < 900 && r.asked.length === 0; i++) r.step(1);
    expect(r.asked.length).toBeGreaterThan(0);
    expect(new Set(r.asked.map((a) => a.who))).toEqual(new Set([2]));
    expect(r.asked[0]!.by).toBe('attack');
  });

  it('1P の となりで こうげき（2P は 遠い）→ who = 1 だけ', () => {
    const r = rig({ p1: { x: X + 1.2, y: 9, z: WIDE_Z }, p2: { x: X - SIGHT * 2.5, y: 9, z: WIDE_Z }, verdict: () => NONE() });
    r.m.spawn('karakasa', X, 9, WIDE_Z, { ai: true });
    for (let i = 0; i < 900 && r.asked.length === 0; i++) r.step(1);
    expect(r.asked.length).toBeGreaterThan(0);
    expect(new Set(r.asked.map((a) => a.who))).toEqual(new Set([1]));
  });

  it('1 人の とき（2P なし）も who = 1。答え（成功）で 1P の ダメージは 0 — 今の 動きと 同じ', () => {
    const r = rig({ p1: { x: X + 1.2, y: 9, z: WIDE_Z }, p2: null, verdict: () => ({ result: 'success', amount: 0 }) });
    r.m.spawn('karakasa', X, 9, WIDE_Z, { ai: true });
    r.step(900);
    expect(r.asked.length).toBeGreaterThan(0);
    expect(new Set(r.asked.map((a) => a.who))).toEqual(new Set([1]));
    expect(r.hits1).toHaveLength(0);
  });

  it('2P ねらいの こうげきで 2P の 側が 成功 → partner.hurt は 呼ばれない（ダメージ 0）。1P の ダメージも 呼ばれない', () => {
    const r = rig({ p1: { x: X - SIGHT * 2.5, y: 9, z: WIDE_Z }, p2: { x: X + 1.2, y: 9, z: WIDE_Z }, verdict: (who) => (who === 2 ? { result: 'success', amount: 0 } : NONE()) });
    r.m.spawn('karakasa', X, 9, WIDE_Z, { ai: true });
    r.step(900);
    expect(r.asked.length).toBeGreaterThan(0);
    expect(r.hits2).toHaveLength(0);
    expect(r.hits1).toHaveLength(0);
  });

  it('2P ねらいで 2P の 側が おしい（半分）→ partner.hurt に 半分の 数が わたる', () => {
    const r = rig({ p1: { x: X - SIGHT * 2.5, y: 9, z: WIDE_Z }, p2: { x: X + 1.2, y: 9, z: WIDE_Z }, verdict: (who) => (who === 2 ? { result: 'early', amount: 1 } : NONE()) });
    r.m.spawn('karakasa', X, 9, WIDE_Z, { ai: true });
    for (let i = 0; i < 900 && r.hits2.length === 0; i++) r.step(1);
    expect(r.hits2[0]?.amount).toBe(1);
    expect(r.hits1).toHaveLength(0);
  });

  it('AC102 2P ねらいで 1P だけが パリィ していても（1P の 側だけ 成功）2P は ふつうに ダメージ（元の 数）', () => {
    const r = rig({ p1: { x: X - SIGHT * 2.5, y: 9, z: WIDE_Z }, p2: { x: X + 1.2, y: 9, z: WIDE_Z }, verdict: (who) => (who === 1 ? { result: 'success', amount: 0 } : NONE(7)) });
    r.m.spawn('karakasa', X, 9, WIDE_Z, { ai: true });
    for (let i = 0; i < 900 && r.hits2.length === 0; i++) r.step(1);
    expect(r.hits2.length).toBeGreaterThan(0);
    expect(r.hits2[0]!.amount, '口が 返した 数ではなく 元の ダメージ（none は 元の 数）').toBeGreaterThan(0);
    expect(r.hits1).toHaveLength(0);
  });

  it('AC102 逆: 1P ねらいで 2P だけが パリィ していても 1P は ふつうに ダメージ', () => {
    const r = rig({ p1: { x: X + 1.2, y: 9, z: WIDE_Z }, p2: { x: X - SIGHT * 2.5, y: 9, z: WIDE_Z }, verdict: (who) => (who === 2 ? { result: 'success', amount: 0 } : NONE()) });
    r.m.spawn('karakasa', X, 9, WIDE_Z, { ai: true });
    for (let i = 0; i < 900 && r.hits1.length === 0; i++) r.step(1);
    expect(r.hits1.length).toBeGreaterThan(0);
    expect(r.hits2).toHaveLength(0);
  });
});

describe('AC99 ひるんだ 出来事（onParryEvent）は パリィした 人（ねらわれた 人）を who で 伝える', () => {
  it('2P ねらいを 2P が 受けた → stagger の who = 2（1P では ない）', () => {
    const r = rig({ p1: { x: X - SIGHT * 2.5, y: 9, z: WIDE_Z }, p2: { x: X + 1.2, y: 9, z: WIDE_Z }, verdict: (who) => (who === 2 ? { result: 'success', amount: 0 } : NONE()) });
    r.m.spawn('karakasa', X, 9, WIDE_Z, { ai: true });
    for (let i = 0; i < 900 && !r.parryEvents.some((e) => e.type === 'stagger'); i++) r.step(1);
    const st = r.parryEvents.filter((e) => e.type === 'stagger');
    expect(st.length).toBeGreaterThan(0);
    expect(new Set(st.map((e) => e.who))).toEqual(new Set([2]));
  });

  it('1P ねらいを 1P が 受けた → stagger の who = 1（今の 動き）', () => {
    const r = rig({ p1: { x: X + 1.2, y: 9, z: WIDE_Z }, p2: { x: X - SIGHT * 2.5, y: 9, z: WIDE_Z }, verdict: (who) => (who === 1 ? { result: 'success', amount: 0 } : NONE()) });
    r.m.spawn('karakasa', X, 9, WIDE_Z, { ai: true });
    for (let i = 0; i < 900 && !r.parryEvents.some((e) => e.type === 'stagger'); i++) r.step(1);
    const st = r.parryEvents.filter((e) => e.type === 'stagger');
    expect(st.length).toBeGreaterThan(0);
    expect(new Set(st.map((e) => e.who))).toEqual(new Set([1]));
  });
});

describe('AC102 ちょうちんの 火の玉も ねらっている 人の パリィに 聞く', () => {
  it('2P の 近くの ちょうちん → who = 2 で 聞く（by = fireball）', () => {
    const r = rig({ p1: { x: X - 40, y: 9, z: WIDE_Z }, p2: { x: X + 5, y: 9, z: WIDE_Z }, verdict: () => NONE() });
    const id = r.m.spawn('chochin', X, 9, WIDE_Z, { yawDeg: 90 });
    r.m.attackNow(id);
    for (let i = 0; i < 900 && !r.asked.some((a) => a.by === 'fireball'); i++) r.step(1);
    const fb = r.asked.filter((a) => a.by === 'fireball');
    expect(fb.length).toBeGreaterThan(0);
    expect(new Set(fb.map((a) => a.who))).toEqual(new Set([2]));
  });
});
