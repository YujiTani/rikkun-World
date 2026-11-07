import { describe, expect, it } from 'vitest';
import { BigShock } from './gashaBigShock';
import { createShockSet } from './gashaBigShockSet';
import type { GashaTarget } from './gashaTargets';
import { TUNE as T } from './gashaBigTuning';

/**
 * COOP-1 4d-3（docs/design/COOP-1.md §3.6 (c)「こうげきの 当たり」「ひるみ」「止め・ゆれ」・§9.10・AC110・AC111・AC113）: 手が 地面を たたいた ときの 当たり（BigShock）の 2 人分。実装の 前に 書いた 赤の テスト。
 *
 * ---- 開発への 約束（新しい ファイル `src/gasha/gashaBigShockSet.ts`。名前は 開発が かえて よいが、かえたら 依頼文と 仕様に 書く）----
 *   createShockSet({ targets: () => readonly GashaTarget[]; groundY(x, z): number }): ShockSet
 *     … 人ごとに BigShock（今の gashaBigShock.ts）を 1 つずつ 持つ。人は targets() を 毎ステップ 読んで ふやす・へらす（2P の さんか・やめるに ついて いく。
 *       やめた 人の ひるみ・ゆれ・当たりの 記録は その ステップで 消す）。式は BigShock の ものを そのまま 使う（コピーしない）。
 *     add(kind, x, y, z, facing?)       … 場所で きまる 当たり（打撃・衝撃波の 輪・小さい 衝撃）。**2 人とも** 見る（当たった 人だけに ダメージ・ひるみ・はじく）
 *     sweepStrike(who, from, dx, dz)    … 払う 腕に 当たった（その人に だけ）。当たったら true
 *     step(dt) / clear()
 *     inputBlocked(who) / staggerLeft(who) / shakeNow(who) / hits(who) / lastPush(who)  … 人ごとに 読む（ひるみの 入力止めは 当たった 人だけ。ゆれは 当てられた 人の 半分だけ）
 *   ダメージ・はじく 速さ・羽織の 倍率は その人の GashaTarget（hurt・setVelocity・knockbackMul・body().onGround）に わたす。
 *   1 人（1P だけ）の ときは 今の BigShock と まったく 同じ 動き（AC113）。
 */

const DT = 1 / 60;
type V3 = { x: number; y: number; z: number };

function man(who: 1 | 2, pos: V3, over: Partial<GashaTarget> = {}) {
  const log = { hurts: [] as number[], pushes: [] as V3[] };
  const t = {
    who, pos, yawDeg: 0, down: false,
    hurt: (a: number) => { log.hurts.push(a); return true; },
    setVelocity: (v: V3) => { log.pushes.push({ ...v }); },
    body: () => ({ position: pos, velocity: { x: 0, y: 0, z: 0 }, onGround: true }),
    ...over,
  } as GashaTarget;
  return { t, log };
}
const run = (s: { step(dt: number): void }, sec: number) => { for (let i = 0; i < Math.round(sec / DT); i++) s.step(DT); };
const mk = (people: GashaTarget[]) => createShockSet({ targets: () => people, groundY: () => -1 });

describe('場所で きまる 当たりは 2 人とも 見る。ダメージ・ひるみ・はじくは 当たった 人だけ（AC110・AC111）', () => {
  it('小さい 衝撃: 半径の 中の 1P だけ 当たる。2P は ダメージも ひるみも ない（もう 1 人は 動ける）', () => {
    const a = man(1, { x: T.slam.tapRadius - 0.5, y: 0, z: 0 });
    const b = man(2, { x: 100, y: 0, z: 0 });
    const s = mk([a.t, b.t]);
    s.add('tap', 0, 0, 0);
    expect(a.log.hurts).toEqual([T.slam.tapDamage]);
    expect(b.log.hurts).toEqual([]);
    expect(s.inputBlocked(1)).toBe(true);
    expect(s.inputBlocked(2)).toBe(false);
    expect(s.hits(1)[0]?.kind).toBe('tap');
    expect(s.hits(2)).toEqual([]);
  });

  it('2P だけ 当たれば 2P だけ 入力が 止まる（1P は 動ける）。ひるみは おわると もどる', () => {
    const a = man(1, { x: 100, y: 0, z: 0 });
    const b = man(2, { x: 1, y: 0, z: 0 });
    const s = mk([a.t, b.t]);
    s.add('tap', 0, 0, 0);
    expect(s.inputBlocked(2)).toBe(true);
    expect(s.inputBlocked(1)).toBe(false);
    expect(b.log.hurts).toEqual([T.slam.tapDamage]);
    expect(a.log.hurts).toEqual([]);
    expect(s.staggerLeft(2)).toBeGreaterThan(0);
    expect(s.staggerLeft(1)).toBe(0);
    run(s, T.stagger.sec + 0.05);
    expect(s.inputBlocked(2)).toBe(false);
  });

  it('2 人とも 半径の 中なら 2 人とも 当たり、2 人とも 入力が 止まる', () => {
    const a = man(1, { x: 1, y: 0, z: 0 });
    const b = man(2, { x: -1, y: 0, z: 0 });
    const s = mk([a.t, b.t]);
    s.add('tap', 0, 0, 0);
    expect(a.log.hurts.length).toBe(1);
    expect(b.log.hurts.length).toBe(1);
    expect(s.inputBlocked(1)).toBe(true);
    expect(s.inputBlocked(2)).toBe(true);
  });

  it('2P の 2 回目の ひるみは 2P だけ のびる（1P の ひるみは 1P の 分で おわる）', () => {
    const posA = { x: 1, y: 0, z: 0 };
    const a = man(1, posA);
    const b = man(2, { x: -1, y: 0, z: 0 });
    const s = mk([a.t, b.t]);
    s.add('tap', 0, 0, 0);
    run(s, T.stagger.sec * 0.8);
    posA.x = 100; // 1P は はなれる。2P だけ 2 回目に 当たる
    s.add('tap', 0, 0, 0);
    run(s, T.stagger.sec * 0.3);
    expect(s.inputBlocked(1)).toBe(false);
    expect(s.inputBlocked(2)).toBe(true);
  });

  it('はじく 向きと 速さは その人の 位置から。羽織（knockbackMul）も その人の 分だけ（1P が 羽織 0.3・2P は なし）', () => {
    const a = man(1, { x: 0, y: 0, z: 2 }, { knockbackMul: () => 0.3 });
    const b = man(2, { x: 0, y: 0, z: -2 });
    const s = mk([a.t, b.t]);
    s.add('tap', 0, 0, 0);
    expect(a.log.pushes.length).toBe(1);
    expect(b.log.pushes.length).toBe(1);
    expect(a.log.pushes[0]!.z).toBeCloseTo(T.stagger.tapKnockSpeed * 0.3, 6); // +z へ、羽織で よわく
    expect(b.log.pushes[0]!.z).toBeCloseTo(-T.stagger.tapKnockSpeed, 6); // -z へ、そのまま
    expect(a.log.pushes[0]!.y).toBe(T.stagger.knockUp);
    expect(b.log.pushes[0]!.y).toBe(T.stagger.knockUp);
  });

  it('当てられた ゆれは 当てられた 人の 半分だけ: 遠くて ゆれの 範囲の 外の 人は ゆれない', () => {
    const a = man(1, { x: 1, y: 0, z: 0 });
    const b = man(2, { x: T.slam.shakeRange + 30, y: 0, z: 0 });
    const s = mk([a.t, b.t]);
    s.add('tap', 0, 0, 0);
    expect(s.shakeNow(1)).toBeGreaterThan(0);
    expect(s.shakeNow(2)).toBe(0);
    run(s, Math.max(T.slam.tapShakeSec, T.stagger.shakeSec) + 0.05);
    expect(s.shakeNow(1)).toBe(0);
  });

  it('ジャンプ中の 人は 小さい 衝撃を よける（人ごとに 見る）。もう 1 人は 地面に いて 当たる', () => {
    const a = man(1, { x: 1, y: 1.2, z: 0 }, { body: () => ({ position: { x: 1, y: 1.2, z: 0 }, velocity: { x: 0, y: 0, z: 0 }, onGround: false }) });
    const b = man(2, { x: -1, y: 0, z: 0 });
    const s = mk([a.t, b.t]);
    s.add('tap', 0, 0, 0);
    expect(a.log.hurts).toEqual([]);
    expect(b.log.hurts).toEqual([T.slam.tapDamage]);
  });

  it('むてき中などで ダメージが 入らない 人は ひるまない（hurt が false）。もう 1 人は ふつうに 当たる', () => {
    const a = man(1, { x: 1, y: 0, z: 0 }, { hurt: () => false });
    const b = man(2, { x: -1, y: 0, z: 0 });
    const s = mk([a.t, b.t]);
    s.add('tap', 0, 0, 0);
    expect(s.inputBlocked(1)).toBe(false);
    expect(s.inputBlocked(2)).toBe(true);
    expect(s.hits(1)[0]?.ok).toBe(false);
  });
});

describe('衝撃波の 輪・払う 腕（人ごとに 1 回）', () => {
  it('たたきつけ: 輪の ふちが 通る ときに 人ごとに 1 回ずつ 当たる（近い 1P が 先、2P は あとから。1P の 当たりで 2P の 輪が 消えない）', () => {
    const near = T.slam.hitRadius + 2;
    const far = near + 10;
    const a = man(1, { x: near, y: 0, z: 0 });
    const b = man(2, { x: far, y: 0, z: 0 });
    const s = mk([a.t, b.t]);
    s.add('slam', 0, 0, 0);
    run(s, T.slam.waveRadius / T.slam.waveSpeed + 0.3);
    expect(s.hits(1).filter((h) => h.kind === 'wave').length).toBe(1);
    expect(s.hits(2).filter((h) => h.kind === 'wave').length).toBe(1);
    expect(a.log.hurts).toEqual([T.slam.waveDamage]);
    expect(b.log.hurts).toEqual([T.slam.waveDamage]);
  });

  it('打撃を 受けた 1P には 輪を 当てない。打撃の 外に いた 2P には 輪が 当たる', () => {
    const a = man(1, { x: 1, y: 0, z: 0 });
    const b = man(2, { x: T.slam.hitRadius + 3, y: 0, z: 0 });
    const s = mk([a.t, b.t]);
    s.add('slam', 0, 0, 0);
    run(s, T.slam.waveRadius / T.slam.waveSpeed + 0.3);
    expect(s.hits(1).map((h) => h.kind)).toEqual(['hit']);
    expect(s.hits(2).map((h) => h.kind)).toEqual(['wave']);
  });

  it('払う 腕: 当たった 人にだけ ダメージ・ひるみ・はじき。向きは わたした (dx, dz)', () => {
    const a = man(1, { x: 5, y: 0, z: 0 });
    const b = man(2, { x: -5, y: 0, z: 0 });
    const s = mk([a.t, b.t]);
    expect(s.sweepStrike(2, { x: -5, y: 1, z: 0 }, -1, 0)).toBe(true);
    expect(b.log.hurts).toEqual([T.sweep.damage]);
    expect(a.log.hurts).toEqual([]);
    expect(s.inputBlocked(2)).toBe(true);
    expect(s.inputBlocked(1)).toBe(false);
    expect(s.lastPush(2)?.x).toBeCloseTo(-T.sweep.knockSpeed, 6);
    expect(s.lastPush(1)).toBeNull();
  });
});

describe('2P の さんか・やめる（一覧が かわる）', () => {
  it('あとから 一覧に 入った 2P も 見る。やめて 一覧から 消えたら ひるみ・ゆれ・記録が その ステップで 消え、もう 当たらない', () => {
    const a = man(1, { x: 100, y: 0, z: 0 });
    const b = man(2, { x: 1, y: 0, z: 0 });
    let people: GashaTarget[] = [a.t];
    const s = createShockSet({ targets: () => people, groundY: () => -1 });
    s.add('tap', 0, 0, 0);
    expect(b.log.hurts).toEqual([]); // まだ いない
    people = [a.t, b.t];
    s.add('tap', 0, 0, 0);
    expect(b.log.hurts).toEqual([T.slam.tapDamage]);
    expect(s.inputBlocked(2)).toBe(true);
    people = [a.t];
    s.step(DT);
    expect(s.inputBlocked(2)).toBe(false);
    expect(s.staggerLeft(2)).toBe(0);
    expect(s.shakeNow(2)).toBe(0);
    expect(s.hits(2)).toEqual([]);
    s.add('tap', 0, 0, 0);
    expect(b.log.hurts.length).toBe(1);
  });

  it('2P が 倒れて いても 場所の 当たりは 見る（hurt が 受けつけるか どうかは その人の もの）', () => {
    const a = man(1, { x: 100, y: 0, z: 0 });
    const b = man(2, { x: 1, y: 0, z: 0 }, { down: true });
    const s = mk([a.t, b.t]);
    s.add('tap', 0, 0, 0);
    expect(b.log.hurts.length).toBe(1);
  });
});

describe('1 人（1P だけ）の とき は 今の BigShock と 同じ（AC113）', () => {
  it('同じ 場面で ダメージ・はじき・ひるみ・ゆれ・記録が 今の BigShock と 同じ', () => {
    const scene = (): { hurts: number[]; pushes: V3[]; ply: V3 } => ({ hurts: [], pushes: [], ply: { x: 1, y: 0, z: 2 } });
    const o = scene();
    const old = new BigShock({ player: () => o.ply, groundY: () => -1, hurt: (a) => { o.hurts.push(a); return true; }, setPlayerVelocity: (v) => { o.pushes.push({ ...v }); }, knockbackMul: () => 0.5 });
    const n = scene();
    const one = man(1, n.ply, { hurt: (a: number) => { n.hurts.push(a); return true; }, setVelocity: (v: V3) => { n.pushes.push({ ...v }); }, knockbackMul: () => 0.5 });
    const set = mk([one.t]);
    for (const k of ['tap', 'slam', 'slam2'] as const) { old.add(k, 0, 0, 0, { fx: 0, fz: 1 }); set.add(k, 0, 0, 0, { fx: 0, fz: 1 }); }
    for (let i = 0; i < 90; i++) { old.step(DT); set.step(DT); }
    expect(n.hurts).toEqual(o.hurts);
    expect(n.pushes).toEqual(o.pushes);
    expect(set.hits(1).map((h) => [h.kind, h.amount, h.ok])).toEqual(old.hits.map((h) => [h.kind, h.amount, h.ok]));
    expect(set.inputBlocked(1)).toBe(old.inputBlocked());
    expect(set.shakeNow(1)).toBeCloseTo(old.shakeNow, 9);
    expect(set.hits(2)).toEqual([]);
    expect(set.inputBlocked(2)).toBe(false);
  });
});
